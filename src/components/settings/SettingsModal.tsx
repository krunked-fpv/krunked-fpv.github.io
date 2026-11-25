import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Moon,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sun,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { foley as foleyEngine } from '../../audio/microFoley';
import { useFoley } from '../../audio/useFoley';
import { SPRING, THEME_COLORS } from '../../config/site';
import { AuthError, fetchRateLimit } from '../../data/ghClient';
import { clearAll } from '../../data/httpCache';
import { getRate, subscribeRate } from '../../data/rateLimit';
import { forceSync } from '../../data/syncEngine';
import { statusLabel } from '../../data/syncReducer';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import type { FoleyCue } from '../../types/audio';
import type { SettingsTab, ThemeMode } from '../../types/project';
import { downloadDeckConfig, importDeckConfigFromFile } from '../../vault/configIo';
import { getVaultStatus, reconcileVault, subscribeVaultStatus } from '../../vault/cookieVault';
import { clearPat, getPat, getPatStatus, GITHUB_API_ORIGIN, patScope, setPat } from '../../vault/patStore';
import { Chip } from '../ui/Chip';
import { IconButton } from '../ui/IconButton';
import { Modal } from '../ui/Modal';

const TABS: { key: SettingsTab; label: string; Icon: typeof Sliders }[] = [
  { key: 'prefs', label: 'Preferences', Icon: Sliders },
  { key: 'vault', label: 'Vault & Config', Icon: Database },
  { key: 'diagnostics', label: 'API & Diagnostics', Icon: Activity },
];

const FOLEY_CUES: FoleyCue[] = ['tick', 'click', 'latch', 'relay', 'sync'];

function applyThemeImmediate(next: ThemeMode, setTheme: (t: ThemeMode) => void) {
  const commit = () => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next === 'daylight' ? 'light' : 'dark';
      const meta =
        document.getElementById('meta-theme-color') ??
        document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_COLORS[next]);
    }
    setTheme(next);
  };
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (!reduced && typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
    document.startViewTransition(commit);
  } else {
    commit();
  }
}

export function SettingsModal() {
  const open = useDeck((s) => s.settingsOpen);
  const tab = useDeck((s) => s.settingsTab);
  const setOpen = useDeck((s) => s.setSettings);
  const setTab = useDeck((s) => s.setSettingsTab);
  const vault = useDeck((s) => s.vault);
  const sync = useDeck((s) => s.sync);
  const setTheme = useDeck((s) => s.setTheme);
  const importVault = useDeck((s) => s.importVault);
  const resetVault = useDeck((s) => s.resetVault);
  const toast = useDeck((s) => s.toast);

  const foley = useFoley();
  const rate = useSyncExternalStore(subscribeRate, getRate);
  const vaultStatus = useSyncExternalStore(subscribeVaultStatus, getVaultStatus);
  const now = useNow(1000);

  const [token, setToken] = useState('');
  const [reveal, setReveal] = useState(false);
  const [scope, setScope] = useState<'device' | 'session'>('session');
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setToken(getPat() ?? '');
    setScope(patScope() ?? 'session');
    setReveal(false);
    setTestNote(null);
    setConfirmReset(false);
  }, [open]);

  useEffect(() => {
    if (!confirmReset) return;
    const t = window.setTimeout(() => setConfirmReset(false), 4500);
    return () => window.clearTimeout(t);
  }, [confirmReset]);

  const close = () => {
    setOpen(false);
    if (window.location.hash === '#settings') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

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
        setTestNote({ ok: false, msg: 'Network error or ?sync=off prevented verification.' });
        return;
      }
      const res = setPat(trimmed, scope);
      if (!res.saved) {
        setTestNote({ ok: false, msg: 'Invalid token format (printable ASCII only, no whitespace/control chars).' });
        return;
      }
      foley.latch();
      setTestNote({ ok: true, msg: `Verified · ${r.remaining}/${r.limit} quota remaining (${scope})` });
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
    foley.click();
    setTestNote({ ok: true, msg: 'Token erased from local/session storage.' });
    void fetchRateLimit();
    toast('Token cleared', 'info');
  };

  const handleClearCache = () => {
    clearAll();
    foley.click();
    toast('ETag HTTP cache purged — revalidating', 'ok');
    void forceSync();
  };

  const handleExport = () => {
    downloadDeckConfig(vault);
    foley.latch();
    toast('Exported PAT-free KrunkedDeckConfigV2 JSON', 'ok');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { state } = await importDeckConfigFromFile(file);
      importVault(state);
      applyThemeImmediate(state.prefs.theme, setTheme);
      foley.latch();
      toast(`Imported ${state.pins.length} pins & ${Object.keys(state.curation).length} curations`, 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Invalid KrunkedDeckConfigV2 JSON', 'warn');
    }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const { state, status } = await reconcileVault();
      importVault(state);
      foley.click();
      toast(`Vault reconciled · ${status.healthyCount}/3 mirrors healthy (rev ${status.rev})`, 'ok');
    } finally {
      setReconciling(false);
    }
  };

  const handleResetVault = () => {
    if (!confirmReset) {
      foley.tick();
      setConfirmReset(true);
      return;
    }
    resetVault();
    applyThemeImmediate('obsidian', setTheme);
    setConfirmReset(false);
    foley.click();
    toast('Vault reset to factory defaults', 'info');
  };

  const handleTestCue = (cue: FoleyCue) => {
    if (!foley.enabled) {
      foley.setEnabled(true);
    }
    foley.play(cue);
  };

  const patStatus = getPatStatus();
  const foleyDiag = foleyEngine.getDiagnostics();
  const cookiePct = Math.min(100, Math.round((vaultStatus.cookieBytes / vaultStatus.cookieBudget) * 100));
  const ratePct = rate && rate.limit > 0 ? Math.min(100, Math.round((rate.remaining / rate.limit) * 100)) : null;
  const resetSec = rate ? Math.max(0, Math.ceil((rate.reset * 1000 - now) / 1000)) : 0;
  const resetCountdown = `${String(Math.floor(resetSec / 60)).padStart(2, '0')}:${String(resetSec % 60).padStart(2, '0')}`;
  const curationCount = Object.keys(vault.curation).length;

  return (
    <Modal open={open} onClose={close} label="Studio settings" size="lg" mobileSheet>
      <div className="surface surface-elevated flex max-h-[86dvh] flex-col overflow-hidden rounded-[10px]! bg-elevated">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Monolith Console</h2>
            <p className="mono mt-0.5 text-[10.5px] tracking-[0.14em] text-mute">
              CHASSIS FINISH · TRIPLE-STORE VAULT · API FIREWALL
            </p>
          </div>
          <IconButton label="Close settings" onClick={close}>
            <X size={17} />
          </IconButton>
        </div>

        {/* 3-Tab Recessed Monolith Switcher */}
        <div
          role="tablist"
          aria-label="Settings tabs"
          className="hide-scroll flex shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline bg-inset/85 px-5 py-2 sm:px-6"
        >
          {TABS.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (tab !== key) {
                    foley.tick();
                    setTab(key);
                  }
                }}
                className={`relative flex h-8 shrink-0 items-center gap-1.5 rounded-[4px] px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-ink' : 'text-mute hover:bg-hover hover:text-dim'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="settings-tab-ind"
                    transition={SPRING}
                    className="absolute inset-0 rounded-[4px] border border-hairline-strong bg-elevated"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-2 bottom-0 h-[1.5px] rounded-full bg-hot"
                    />
                  </motion.span>
                )}
                <Icon size={13} className="relative" />
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {tab === 'prefs' && (
            <div className="flex flex-col gap-5">
              {/* Dual Monolith / Vellum Theme */}
              <section className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="eyebrow text-dim!">Cosmic Telemetry Mode</h3>
                  <span className="mono text-[10.5px] uppercase tracking-wider text-mute">
                    {vault.prefs.theme === 'daylight' ? 'SOLAR ECLIPSE' : 'EVENT HORIZON'}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Hardware theme">
                  {(
                    [
                      {
                        id: 'obsidian' as const,
                        name: 'Event Horizon',
                        desc: 'Deep-space singularity with gravitational lensing and kinetic acid-lime HUD.',
                        Icon: Moon,
                        swatchBg: '#020203',
                        swatchCard: '#0C0D10',
                        swatchDot: '#D2FF28',
                      },
                      {
                        id: 'daylight' as const,
                        name: 'Solar Eclipse',
                        desc: 'Total solar eclipse on archival Swiss vellum with pitch-ink corona.',
                        Icon: Sun,
                        swatchBg: '#F5F3EC',
                        swatchCard: '#FFFFFF',
                        swatchDot: '#0A0A0B',
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = vault.prefs.theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          if (!selected) {
                            foley.click();
                            applyThemeImmediate(opt.id, setTheme);
                          }
                        }}
                        className={`flex flex-col gap-2.5 rounded-[6px] border p-4 text-left transition-colors ${
                          selected
                            ? 'border-hot/70 bg-inset ring-1 ring-hot/40'
                            : 'border-hairline bg-inset/45 hover:border-hairline-strong hover:bg-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                            <opt.Icon size={14} className={selected ? 'text-hot-ink' : 'text-mute'} />
                            {opt.name}
                          </span>
                          <span
                            className="flex h-5 w-11 items-center justify-end rounded-[3px] border border-hairline p-1"
                            style={{ background: opt.swatchBg }}
                            aria-hidden="true"
                          >
                            <span className="h-full w-4 rounded-[1px]" style={{ background: opt.swatchCard }} />
                            <span className="ml-1 size-1.5 rounded-full" style={{ background: opt.swatchDot }} />
                          </span>
                        </div>
                        <p className="text-[12.5px] leading-snug text-dim">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Procedural WebAudio Micro-Foley */}
              <section className="flex flex-col gap-3 rounded-[6px] border border-hairline bg-inset/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="eyebrow flex items-center gap-1.5 text-dim!">
                      {foley.enabled ? <Volume2 size={12} className="text-phosphor-ink" /> : <VolumeX size={12} />}
                      Procedural WebAudio Micro-Foley
                    </h3>
                    <p className="mt-1 text-[12.5px] text-dim">
                      Synthesized 2ms mechanical switch transients. Strictly muted by default with zero AudioContext until enabled.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={foley.enabled}
                    onClick={() => foley.toggle()}
                    className={`btn min-h-9! gap-2 px-3.5 ${foley.enabled ? 'btn-primary' : ''}`}
                  >
                    {foley.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    {foley.enabled ? 'Sound Active' : 'Muted'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mono mr-1 text-[10px] uppercase tracking-wider text-mute">TEST CUE</span>
                    {FOLEY_CUES.map((cue) => (
                      <button
                        key={cue}
                        type="button"
                        onClick={() => handleTestCue(cue)}
                        className="mono rounded-[4px] border border-hairline bg-surface px-2.5 py-1 text-[10.5px] uppercase tracking-wider text-dim transition-colors hover:border-hairline-strong hover:text-ink"
                      >
                        {cue}
                      </button>
                    ))}
                  </div>
                  <span className="mono text-[10px] uppercase text-mute">
                    DSP: {foleyDiag.supported ? foleyDiag.contextState : 'UNSUPPORTED'}
                  </span>
                </div>
              </section>

              {/* Local Curation Overview */}
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-hairline bg-inset/70 p-4">
                <div>
                  <h3 className="eyebrow text-dim!">Local Overrides &amp; Dock</h3>
                  <p className="mt-1 text-[12.5px] text-dim">
                    {vault.pins.length} pinned builds · {curationCount} local curation overrides active. Edit any repo via its Peek Curate tab.
                  </p>
                </div>
                <Chip tone="online" led>
                  REV #{vaultStatus.rev}
                </Chip>
              </section>
            </div>
          )}

          {tab === 'vault' && (
            <div className="flex flex-col gap-5">
              {/* Triple-Store Health Mirrors */}
              <section className="flex flex-col gap-3 rounded-[6px] border border-hairline bg-inset/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="eyebrow flex items-center gap-1.5 text-dim!">
                      <HardDrive size={12} /> Triple-Store Auto-Healing Mirrors
                    </h3>
                    <p className="mono mt-0.5 text-[10.5px] text-mute">
                      REV #{vaultStatus.rev} · {vaultStatus.healthyCount}/3 MIRRORS HEALTHY · HEALED FROM{' '}
                      {vaultStatus.lastHealedFrom.toUpperCase()}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={reconciling}
                    onClick={() => void handleReconcile()}
                    className="btn min-h-8! gap-1.5 text-[11.5px]"
                  >
                    <RefreshCw size={12} className={reconciling ? 'spin' : ''} />
                    Reconcile
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      ['localStorage', 'LocalStorage'],
                      ['indexedDB', 'IndexedDB'],
                      ['cookie', 'Shadow Cookie'],
                    ] as const
                  ).map(([key, label]) => {
                    const ok = vaultStatus.stores[key];
                    return (
                      <div
                        key={key}
                        className="flex flex-col gap-1 rounded-[4px] border border-hairline bg-surface px-3 py-2.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-[6px] rounded-full"
                            style={{ background: ok ? 'var(--led-online)' : 'var(--led-alarm)' }}
                            aria-hidden="true"
                          />
                          <span className="text-[12.5px] font-medium text-ink">{label}</span>
                        </div>
                        <span
                          className="mono text-[10px] uppercase tracking-wider"
                          style={{ color: ok ? 'var(--led-online-ink)' : 'var(--led-alarm-ink)' }}
                        >
                          {ok ? 'SYNCED' : 'DEGRADED'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Shadow Cookie Budget Meter (<3800B) */}
                <div className="border-t border-hairline pt-3">
                  <div className="mono mb-1.5 flex items-center justify-between text-[10.5px]">
                    <span className="text-dim">SHADOW COOKIE PAYLOAD (V2 BASE64URL + CRC)</span>
                    <span className="text-ink">
                      {vaultStatus.cookieBytes} / {vaultStatus.cookieBudget} B ({cookiePct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-[2px] bg-surface">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${cookiePct}%`,
                        background:
                          cookiePct > 85 ? 'var(--led-alarm)' : cookiePct > 65 ? 'var(--led-active)' : 'var(--led-online)',
                      }}
                    />
                  </div>
                  <div className="mono mt-1.5 flex items-center justify-between text-[10px] text-mute">
                    <span>SHEDDING: {vaultStatus.cookieShedLevel.toUpperCase()}</span>
                    <span>SAMESITE=LAX · 1Y TTL</span>
                  </div>
                </div>
              </section>

              {/* Portable Config I/O */}
              <section className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col justify-between gap-3 rounded-[6px] border border-hairline bg-inset/70 p-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="eyebrow text-dim!">Portable Config V2</h3>
                      <Chip tone="online" led>
                        PAT-FREE
                      </Chip>
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-dim">
                      Export or restore pins, theme, audio preference, and local curations via strict{' '}
                      <code className="mono text-[11px] text-ink">KrunkedDeckConfigV2</code> schema. Personal access tokens are strictly excluded.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleExport} className="btn">
                      <Download size={14} /> Export JSON
                    </button>
                    <button type="button" onClick={() => fileInput.current?.click()} className="btn">
                      <Upload size={14} /> Import JSON
                    </button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => void handleImport(e)}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Safe 2-Step Reset */}
                <div className="flex flex-col justify-between gap-3 rounded-[6px] border border-hairline bg-inset/70 p-4">
                  <div className="flex flex-col gap-1.5">
                    <h3 className="eyebrow text-dim!">Factory Reset</h3>
                    <p className="text-[12.5px] leading-relaxed text-dim">
                      Clears all pinned cartridges, custom project curations, view prefs, and read-markers across all three vault mirrors.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetVault}
                      className={`btn w-fit ${confirmReset ? 'border-alarm text-alarm-ink' : ''}`}
                    >
                      <RotateCcw size={14} />
                      {confirmReset ? 'Click again to confirm reset' : 'Reset Vault'}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {tab === 'diagnostics' && (
            <div className="flex flex-col gap-5">
              {/* Rate-Limit & ETag Telemetry */}
              <section className="flex flex-col gap-3 rounded-[6px] border border-hairline bg-inset/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="eyebrow text-dim!">GitHub API Telemetry &amp; ETag Cache</h3>
                    <p className="mono mt-0.5 text-[10.5px] text-mute">
                      PHASE: {statusLabel(sync, now)} · HYDRATE: {sync.hydrateSource.toUpperCase()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        foley.click();
                        void forceSync();
                      }}
                      className="btn min-h-8! gap-1.5 text-[11.5px]"
                    >
                      <RefreshCw size={12} /> Force Sync
                    </button>
                    <button
                      type="button"
                      onClick={handleClearCache}
                      className="btn min-h-8! gap-1.5 text-[11.5px]"
                    >
                      <Trash2 size={12} /> Purge ETag Cache
                    </button>
                  </div>
                </div>

                {rate ? (
                  <div className="border-t border-hairline pt-3">
                    <div className="mono mb-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-dim">CORE QUOTA REMAINING</span>
                      <span className="text-ink">
                        {rate.remaining} / {rate.limit} · RESETS IN {resetCountdown}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-[2px] bg-surface">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${ratePct ?? 100}%`,
                          background:
                            (ratePct ?? 100) < 15
                              ? 'var(--led-alarm)'
                              : (ratePct ?? 100) < 35
                                ? 'var(--led-active)'
                                : 'var(--led-online)',
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mono border-t border-hairline pt-2.5 text-[11px] text-mute">
                    Quota telemetry initializes on first live GitHub API call (0 calls fired under ?sync=off).
                  </p>
                )}
              </section>

              {/* GitHub PAT & Strict Origin Firewall */}
              <form
                onSubmit={(e) => void handleSaveAndTest(e)}
                className="flex flex-col gap-3 rounded-[6px] border border-hairline bg-inset/70 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="pat-input" className="eyebrow flex items-center gap-1.5 text-dim!">
                    <KeyRound size={12} /> GitHub Personal Access Token (Optional)
                  </label>
                  <Chip tone="online" led>
                    <ShieldCheck size={11} /> {GITHUB_API_ORIGIN} ONLY
                  </Chip>
                </div>

                <div className="flex items-start gap-2.5 rounded-[4px] border border-hairline bg-surface px-3.5 py-2.5 text-[12px] leading-relaxed text-dim">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-solar-ink" />
                  <span>
                    Use a <strong className="font-medium text-ink">fine-grained, read-only public token</strong> with zero write scopes. Origin firewall strictly enforces{' '}
                    <code className="mono text-[11px] text-ink">{GITHUB_API_ORIGIN}</code> and excludes PATs from cookies, IndexedDB vault, and JSON exports.
                  </span>
                </div>

                {patStatus.configured && (
                  <p className="mono text-[11px] text-phosphor-ink">
                    ACTIVE TOKEN: {patStatus.maskedHint} ({patStatus.scope?.toUpperCase()})
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <input
                      id="pat-input"
                      type={reveal ? 'text' : 'password'}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="github_pat_..."
                      autoComplete="off"
                      spellCheck={false}
                      className="mono h-10 w-full rounded-[6px] border border-hairline bg-surface px-3 pr-10 text-[13px] text-ink outline-none placeholder:text-mute focus:border-hairline-strong"
                    />
                    <button
                      type="button"
                      onClick={() => setReveal((r) => !r)}
                      aria-label={reveal ? 'Hide token' : 'Reveal token'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mute hover:text-ink"
                    >
                      {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button type="submit" disabled={testing} className="btn btn-primary shrink-0">
                    <Check size={14} /> {testing ? 'Checking...' : 'Test & Save'}
                  </button>
                  {patStatus.configured && (
                    <button type="button" onClick={handleClearToken} className="btn shrink-0 text-dim">
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-dim">
                  <span className="mono text-[10.5px] uppercase tracking-wider text-mute">STORAGE:</span>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="pat-scope"
                      checked={scope === 'session'}
                      onChange={() => setScope('session')}
                      className="accent-hot"
                    />
                    This session (sessionStorage)
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="pat-scope"
                      checked={scope === 'device'}
                      onChange={() => setScope('device')}
                      className="accent-hot"
                    />
                    This device (localStorage)
                  </label>
                </div>

                {testNote && (
                  <p className={`mono text-[11.5px] ${testNote.ok ? 'text-phosphor-ink' : 'text-alarm-ink'}`}>
                    {testNote.msg}
                  </p>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
