import { AlertTriangle, Check, Download, Eye, EyeOff, KeyRound, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AuthError, fetchRateLimit } from '../../data/ghClient';
import { clearAll } from '../../data/httpCache';
import { getRate, subscribeRate } from '../../data/rateLimit';
import { forceSync } from '../../data/syncEngine';
import { useDeck } from '../../store/deckStore';
import { validate } from '../../vault/cookieVault';
import { clearPat, getPat, patScope, setPat } from '../../vault/patStore';
import { IconButton } from '../ui/IconButton';
import { Modal } from '../ui/Modal';

export function SettingsModal() {
  const open = useDeck((s) => s.settingsOpen);
  const setOpen = useDeck((s) => s.setSettings);
  const vault = useDeck((s) => s.vault);
  const replaceVault = useDeck((s) => s.replaceVault);
  const toast = useDeck((s) => s.toast);
  const rate = useSyncExternalStore(subscribeRate, getRate);

  const [token, setToken] = useState('');
  const [reveal, setReveal] = useState(false);
  const [scope, setScope] = useState<'device' | 'session'>('session');
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setToken(getPat() ?? '');
    setScope(patScope() ?? 'session');
    setReveal(false);
    setTestNote(null);
  }, [open]);

  const close = () => setOpen(false);

  const handleSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      clearPat();
      setTestNote({ ok: true, msg: 'Token cleared. Reverted to unauthenticated 60/hr limit.' });
      void fetchRateLimit();
      return;
    }
    setTesting(true);
    setTestNote(null);
    try {
      const r = await fetchRateLimit(trimmed);
      if (!r) {
        setTestNote({ ok: false, msg: 'Network error verifying token.' });
        return;
      }
      setPat(trimmed, scope);
      setTestNote({ ok: true, msg: `Verified · ${r.remaining}/${r.limit} quota remaining` });
      toast('GitHub token verified & saved', 'ok');
      void forceSync();
    } catch (err) {
      if (err instanceof AuthError) {
        setTestNote({ ok: false, msg: 'Token rejected by GitHub (401 Unauthorized).' });
      } else {
        setTestNote({ ok: false, msg: (err as Error).message || 'Token check failed.' });
      }
    } finally {
      setTesting(false);
    }
  };

  const handleClearToken = () => {
    clearPat();
    setToken('');
    setTestNote({ ok: true, msg: 'Token removed from storage.' });
    void fetchRateLimit();
    toast('Token cleared', 'info');
  };

  const handleClearCache = () => {
    clearAll();
    toast('HTTP ETag cache cleared — revalidating', 'ok');
    void forceSync();
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `krunked-forge-deck-vault-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported curation vault', 'ok');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = validate(JSON.parse(await file.text()));
      if (!parsed) {
        toast('Invalid vault schema — import aborted', 'warn');
        return;
      }
      replaceVault({ ...parsed, updatedAt: Date.now() });
      toast(`Imported ${parsed.pins.length} pins & preferences`, 'ok');
    } catch {
      toast('Could not parse vault JSON', 'warn');
    }
  };

  return (
    <Modal open={open} onClose={close} label="Settings">
      <div
        className="surface overflow-hidden rounded-[20px]!"
        style={{ background: 'var(--color-ob-800)', boxShadow: '0 40px 120px -20px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight">Deck Settings</h2>
            <p className="mono mt-0.5 text-[11px] text-mute">API QUOTA · LOCAL TOKEN · CURATION VAULT</p>
          </div>
          <IconButton label="Close settings" onClick={close}>
            <X size={17} />
          </IconButton>
        </div>

        <div className="thin-scroll flex max-h-[75vh] flex-col gap-6 overflow-y-auto p-5">
          {/* GitHub PAT */}
          <form onSubmit={(e) => void handleSaveAndTest(e)} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label htmlFor="pat-input" className="eyebrow flex items-center gap-1.5 text-dim!">
                <KeyRound size={12} /> GitHub Personal Access Token (Optional)
              </label>
              {rate && (
                <span className="mono text-[11px] text-dim">
                  Quota: <b className="text-ink">{rate.remaining}/{rate.limit}</b>
                </span>
              )}
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-solar/25 bg-solar/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-dim">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-solar" />
              <span>
                Origin storage is shared with every app hosted on this GitHub Pages domain. Use a{' '}
                <strong className="font-medium text-ink">fine-grained, read-only public token</strong> with zero write scopes. Never sent anywhere except{' '}
                <code className="mono text-[11px] text-ink">api.github.com</code>.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="pat-input"
                  type={reveal ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="github_pat_…"
                  autoComplete="off"
                  spellCheck={false}
                  className="mono h-10 w-full rounded-xl border border-white/[0.08] bg-ob-950 px-3 pr-10 text-[13px] text-ink outline-none placeholder:text-mute focus:border-volt"
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? 'Hide token' : 'Reveal token'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-mute hover:text-ink"
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button type="submit" disabled={testing} className="btn btn-primary shrink-0">
                <Check size={14} /> {testing ? 'Checking…' : 'Test & Save'}
              </button>
              {getPat() && (
                <button type="button" onClick={handleClearToken} className="btn shrink-0 text-dim">
                  Clear
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-dim">
              <span className="mono text-[10.5px] uppercase tracking-wider text-mute">Store:</span>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="pat-scope"
                  checked={scope === 'session'}
                  onChange={() => setScope('session')}
                  className="accent-phosphor"
                />
                This session only (sessionStorage)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="pat-scope"
                  checked={scope === 'device'}
                  onChange={() => setScope('device')}
                  className="accent-phosphor"
                />
                This device (localStorage)
              </label>
            </div>

            {testNote && (
              <p className={`mono text-[11.5px] ${testNote.ok ? 'text-phosphor' : 'text-alarm'}`}>{testNote.msg}</p>
            )}
          </form>

          {/* Cache & Vault */}
          <div className="grid gap-4 border-t border-white/[0.07] pt-5 sm:grid-cols-2">
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-white/[0.06] bg-ob-950/60 p-4">
              <div>
                <h3 className="eyebrow text-dim!">ETag HTTP Cache</h3>
                <p className="mt-1.5 text-[12.5px] text-mute">
                  Conditional 304 checks keep quota intact. Wipe the cache if GitHub responses look stale.
                </p>
              </div>
              <button type="button" onClick={handleClearCache} className="btn w-fit">
                <Trash2 size={14} /> Reset API Cache
              </button>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-xl border border-white/[0.06] bg-ob-950/60 p-4">
              <div>
                <h3 className="eyebrow text-dim!">Curation Vault ({vault.pins.length} pins)</h3>
                <p className="mt-1.5 text-[12.5px] text-mute">
                  Export or restore pinned Flagship Dock order, view preferences, and commit read-markers.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleExport} className="btn">
                  <Download size={14} /> Export JSON
                </button>
                <button type="button" onClick={() => fileInput.current?.click()} className="btn">
                  <Upload size={14} /> Import JSON
                </button>
                <input ref={fileInput} type="file" accept="application/json" onChange={(e) => void handleImport(e)} className="hidden" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
