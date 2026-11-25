import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFoley } from '../../audio/useFoley';
import { sanitizeCurationPatch, sanitizeHttpUrl } from '../../domain/sanitize';
import { useDeck } from '../../store/deckStore';
import type { ArtStyle, Category, Project } from '../../types/project';
import type { CurationOverride } from '../../types/vault';

const CATEGORIES: readonly Category[] = [
  'Game',
  'App',
  'Hardware/Sky',
  'Audio/Vinyl',
  'Automation',
  'Engine',
  'Utility',
];

const ART_STYLES: readonly ArtStyle[] = ['topo', 'orbital', 'synthwave', 'prism', 'groove'];

/** Hardware-tuned non-purple OKLCH hues (strictly outside 245..340 deg). */
const ACCENT_SWATCHES: { hue: number; label: string; color: string }[] = [
  { hue: 26, label: 'Orange', color: '#FF4F00' },
  { hue: 62, label: 'Amber', color: '#F59E0B' },
  { hue: 158, label: 'Phosphor', color: '#10B981' },
  { hue: 198, label: 'Cyan', color: '#06B6D4' },
  { hue: 224, label: 'Cobalt', color: '#3B82F6' },
  { hue: 12, label: 'Crimson', color: '#EF4444' },
];

export function CuratePanel({ project }: { project: Project }) {
  const saved = useDeck((s) => s.vault.curation[project.name]);
  const setCuration = useDeck((s) => s.setCuration);
  const resetCuration = useDeck((s) => s.resetCuration);
  const toast = useDeck((s) => s.toast);
  const foley = useFoley();

  const [displayName, setDisplayName] = useState(saved?.displayName ?? project.displayName);
  const [tagline, setTagline] = useState(saved?.tagline ?? project.tagline);
  const [category, setCategory] = useState<Category>(saved?.category ?? project.category);
  const [artStyle, setArtStyle] = useState<ArtStyle>(saved?.artStyle ?? project.art.style);
  const initialAccent = saved?.accent ?? project.accentHue ?? null;
  const [accent, setAccent] = useState<number | null>(initialAccent !== null ? Math.round(initialAccent) : null);
  const [launchUrl, setLaunchUrl] = useState(saved?.launchUrl ?? '');
  const [hidden, setHidden] = useState(saved?.hidden ?? project.hidden);
  const [featured, setFeatured] = useState(saved?.featured ?? project.featured);
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    setDisplayName(saved?.displayName ?? project.displayName);
    setTagline(saved?.tagline ?? project.tagline);
    setCategory(saved?.category ?? project.category);
    setArtStyle(saved?.artStyle ?? project.art.style);
    const nextAccent = saved?.accent ?? project.accentHue ?? null;
    setAccent(nextAccent !== null ? Math.round(nextAccent) : null);
    setLaunchUrl(saved?.launchUrl ?? '');
    setHidden(saved?.hidden ?? project.hidden);
    setFeatured(saved?.featured ?? project.featured);
    setUrlError('');
  }, [project.name, saved, project.displayName, project.tagline, project.category, project.art.style, project.accentHue, project.hidden, project.featured]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError('');

    const rawPatch: Partial<CurationOverride> = {
      displayName: displayName.trim() || undefined,
      tagline: tagline.trim() || undefined,
      category,
      artStyle,
      hidden,
      featured,
    };

    if (accent !== null) {
      rawPatch.accent = accent;
    }

    if (launchUrl.trim()) {
      const safe = sanitizeHttpUrl(launchUrl.trim(), undefined, { allowBareDomain: true });
      if (!safe) {
        setUrlError('Must be a valid http(s) URL without embedded credentials.');
        return;
      }
      rawPatch.launchUrl = safe;
    }

    const clean = sanitizeCurationPatch(rawPatch);
    setCuration(project.name, clean);
    foley.latch();
    toast(`Saved local curation for ${clean.displayName ?? project.displayName}`, 'ok');
  };

  const handleReset = () => {
    resetCuration(project.name);
    foley.click();
    toast(`Reset ${project.name} to GitHub defaults`, 'info');
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5 rounded-[14px] border border-hairline bg-inset p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-hot-ink" />
          <h4 className="eyebrow text-dim!">Local Vault Curation</h4>
        </div>
        <span className="mono text-[10px] text-mute">
          {project.hasCustomCuration ? 'OVERRIDDEN IN VAULT' : 'DEFAULT METADATA'}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Display Name</span>
          <input
            type="text"
            maxLength={72}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={project.name}
            className="h-10 rounded-[10px] border border-hairline bg-surface px-3 text-[13.5px] text-ink outline-none focus:border-hairline-strong"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="h-10 rounded-[10px] border border-hairline bg-surface px-3 text-[13.5px] text-ink outline-none focus:border-hairline-strong"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Tagline</span>
        <textarea
          rows={2}
          maxLength={200}
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Concise one-line description..."
          className="rounded-[10px] border border-hairline bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-hairline-strong"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Procedural Art Style</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Art style">
            {ART_STYLES.map((st) => {
              const on = artStyle === st;
              return (
                <button
                  key={st}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    foley.tick();
                    setArtStyle(st);
                  }}
                  className={`mono rounded-[7px] border px-2.5 py-1.5 text-[11px] uppercase tracking-wider transition-colors ${
                    on
                      ? 'border-hairline-strong bg-ink text-chassis'
                      : 'border-hairline bg-surface text-dim hover:text-ink'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Accent Hue</span>
            <button
              type="button"
              onClick={() => {
                foley.tick();
                setAccent(null);
              }}
              className="mono text-[10px] text-mute hover:text-ink"
            >
              {accent === null ? 'AUTO' : `${Math.round(accent)} DEG · RESET`}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_SWATCHES.map((sw) => {
              const selected = accent === sw.hue;
              return (
                <button
                  key={sw.hue}
                  type="button"
                  onClick={() => {
                    foley.tick();
                    setAccent(sw.hue);
                  }}
                  aria-label={`Set accent to ${sw.label}`}
                  title={sw.label}
                  className={`size-7 rounded-full border-2 transition-transform ${
                    selected ? 'scale-110 border-ink' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  style={{ background: sw.color }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Custom Launch URL (Optional)</span>
        <input
          type="url"
          value={launchUrl}
          onChange={(e) => setLaunchUrl(e.target.value)}
          placeholder="https://example.com/app (leave blank for automatic resolution)"
          className="mono h-10 rounded-[10px] border border-hairline bg-surface px-3 text-[12.5px] text-ink outline-none placeholder:text-mute focus:border-hairline-strong"
        />
        {urlError && <span className="mono text-[11px] text-alarm-ink">{urlError}</span>}
      </label>

      <div className="flex flex-wrap items-center gap-5 border-t border-hairline pt-3 text-[13px] text-dim">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => {
              foley.tick();
              setFeatured(e.target.checked);
            }}
            className="size-4 accent-hot"
          />
          <span>Feature in Spotlight</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => {
              foley.tick();
              setHidden(e.target.checked);
            }}
            className="size-4 accent-hot"
          />
          <span>Hide from default view</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-4">
        <p className="mono text-[10.5px] text-mute">
          Persisted in local triple-store Vault (LS + IDB + Cookie)
        </p>
        <div className="flex items-center gap-2">
          {project.hasCustomCuration && (
            <button type="button" onClick={handleReset} className="btn">
              <RotateCcw size={13} /> Reset Defaults
            </button>
          )}
          <button type="submit" className="btn btn-primary">
            <Check size={14} /> Save Curation
          </button>
        </div>
      </div>
    </form>
  );
}
