import { motion } from 'framer-motion';
import { ArrowUpRight, Eye } from 'lucide-react';
import { GITHUB_USER, SPRING } from '../../config/site';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useFoley } from '../../audio/useFoley';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { HeatStrip } from './HeatStrip';
import { StatCounter } from './StatCounter';

export function HeroBand({ projects }: { projects: Project[] }) {
  const user = useDeck((s) => s.user);
  const setPeek = useDeck((s) => s.setPeek);
  const { relay, latch } = useFoley();
  const now = useNow(10_000);

  const live = projects.filter((p) => p.kind === 'live');
  const latest = projects.reduce<Project | null>(
    (acc, p) => (!acc || Date.parse(p.lastActivityAt) > Date.parse(acc.lastActivityAt) ? p : acc),
    null,
  );
  const commits30d = projects.reduce((sum, p) => sum + (p.commits30dTotal || 0), 0);
  const pushes7d = projects.reduce((sum, p) => sum + p.pushes7d, 0);
  const velocityVal = commits30d > 0 ? commits30d : pushes7d;
  const velocityLabel = commits30d > 0 ? '30d Commits' : 'Pushes 7d';
  const latestAgeMs = latest ? Math.max(0, now - Date.parse(latest.lastActivityAt)) : null;
  const latestFresh = latest?.freshness.tier === 'fresh';

  return (
    <section
      aria-label="Forge overview"
      className="hero-grid w-full border-b border-hairline"
    >
      <div className="relative z-[1] mx-auto max-w-[1480px] overflow-hidden px-4 py-5 sm:px-6 lg:py-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:items-center lg:gap-8">
          {/* Left: Operator identity, tight editorial headline & 1-line dispatch */}
          <div className="min-w-0">
            <motion.a
              href={user?.html_url ?? `https://github.com/${GITHUB_USER}`}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING}
              className="mono mb-2.5 inline-flex h-7 max-w-full items-center gap-2 rounded-full bg-surface py-0.5 pl-1 pr-3 text-[11px] tracking-[0.08em] text-dim shadow-[inset_0_0_0_1px_var(--hairline)] transition hover:bg-elevated hover:text-ink"
            >
              {user?.avatar_url ? (
                <img
                  src={`${user.avatar_url}${user.avatar_url.includes('?') ? '&' : '?'}s=48`}
                  alt=""
                  width={20}
                  height={20}
                  className="size-5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="size-5 shrink-0 rounded-full bg-tint shadow-[inset_0_0_0_1px_var(--hairline)]" />
              )}
              <span className="truncate font-medium text-ink">@{user?.login ?? GITHUB_USER}</span>
              <span className="text-mute" aria-hidden="true">/</span>
              <span className="shrink-0 text-mute">
                {projects.length} TRACKED
              </span>
              <span
                className="led-dot"
                style={{ ['--c' as string]: live.length > 0 ? 'var(--led-online)' : 'var(--ink-muted)' }}
                aria-hidden="true"
              />
            </motion.a>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.03 }}
              className="display text-[clamp(30px,4.5vw,56px)] text-ink"
            >
              {live.length > 0 ? `${live.length} live build${live.length === 1 ? '' : 's'}.` : 'Forge deck online.'}
              <br />
              <span className="serif font-normal text-dim" style={{ fontSize: '0.94em', lineHeight: 1.04 }}>
                {latest && latestAgeMs !== null ? (
                  <>
                    Last ship{' '}
                    <span className={latestFresh ? 'text-hot-ink' : 'text-phosphor-ink'}>
                      {formatDelta(latestAgeMs)}
                    </span>{' '}
                    ago.
                  </>
                ) : (
                  'Hydrating telemetry...'
                )}
              </span>
            </motion.h1>

            {latest && (
              <div className="mt-2.5 flex min-w-0 items-center gap-2 text-[13px] text-dim">
                <span className="chip chip-hot shrink-0">LATEST</span>
                {latest.launchUrl ? (
                  <a
                    href={latest.launchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => relay()}
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-ink transition hover:text-hot-ink"
                  >
                    {latest.displayName}
                    <ArrowUpRight size={13} className="text-mute" aria-hidden="true" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      latch();
                      setPeek(latest.name, 'card');
                    }}
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-ink transition hover:text-hot-ink"
                  >
                    {latest.displayName}
                    <Eye size={13} className="text-mute" aria-hidden="true" />
                  </button>
                )}
                {latest.latestCommit?.message && (
                  <span className="min-w-0 truncate text-mute" title={latest.latestCommit.message}>
                    — {latest.latestCommit.message}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: Recessed Telemetry Instrument Rack */}
          <div className="surface-inset w-full min-w-0 overflow-hidden p-3 sm:p-3.5">
            <div className="mb-3 grid grid-cols-3 divide-x divide-hairline border-b border-hairline pb-3">
              <StatCounter value={live.length} label="Live Builds" shortLabel="Live Apps" tone="online" className="pr-2 sm:pr-3.5" />
              <StatCounter
                value={velocityVal}
                label={velocityLabel}
                shortLabel={commits30d > 0 ? 'Commits' : '7d Push'}
                tone="hot"
                className="px-2 sm:px-3.5"
              />
              <StatCounter value={projects.length} label="Tracked Repos" shortLabel="Repos" tone="neutral" className="pl-2 sm:pl-3.5" />
            </div>
            <HeatStrip />
          </div>
        </div>
      </div>
    </section>
  );
}
