import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { makePalette } from '../../art/color';
import { GITHUB_USER, SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import { useChronoPulse } from '../../store/selectors';
import type { Project } from '../../types/project';
import { HeatStrip } from './HeatStrip';
import { StatCounter } from './StatCounter';

export function HeroBand({
  projects,
  activeSpotlight,
}: {
  projects: Project[];
  activeSpotlight?: Project | null;
}) {
  const user = useDeck((s) => s.user);
  const theme = useDeck((s) => s.vault.prefs.theme);
  const pulseDays = useChronoPulse();
  const now = useNow(10_000);

  const live = useMemo(() => projects.filter((p) => p.kind === 'live'), [projects]);
  const latest = useMemo(
    () =>
      projects.reduce<Project | null>(
        (acc, p) => (!acc || Date.parse(p.lastActivityAt) > Date.parse(acc.lastActivityAt) ? p : acc),
        null,
      ),
    [projects],
  );
  const pulse30d = useMemo(
    () => pulseDays.slice(-30).reduce((sum, d) => sum + d.count, 0),
    [pulseDays],
  );
  const projectCommits30d = useMemo(
    () => projects.reduce((sum, p) => sum + (p.commits30dTotal || 0), 0),
    [projects],
  );
  const commits30d = pulse30d > 0 ? pulse30d : projectCommits30d;
  const pushes7d = useMemo(() => projects.reduce((sum, p) => sum + p.pushes7d, 0), [projects]);
  const velocityVal = commits30d > 0 ? commits30d : pushes7d;
  const latestAgeMs = latest ? Math.max(0, now - Date.parse(latest.lastActivityAt)) : null;
  const latestFresh = latest?.freshness.tier === 'fresh';

  // Whisper-subtle atmospheric light wash keyed to the active featured world's non-purple OKLCH hue
  const spotlightTarget = activeSpotlight ?? live[0] ?? projects[0] ?? null;
  const { stageGlowColor, glowBg } = useMemo(() => {
    const rawHue = spotlightTarget ? hueOf(spotlightTarget) : 28;
    const pal = makePalette(rawHue, theme);
    const primaryAlpha = theme === 'daylight' ? 0.07 : 0.11;
    const secondaryAlpha = theme === 'daylight' ? 0.035 : 0.05;
    return {
      stageGlowColor: pal.keyAlpha(primaryAlpha),
      glowBg: `radial-gradient(640px 260px at 18% 24%, ${pal.keyAlpha(primaryAlpha)}, transparent 72%), radial-gradient(520px 220px at 78% 15%, ${pal.counterAlpha(secondaryAlpha)}, transparent 70%)`,
    };
  }, [spotlightTarget, theme]);

  return (
    <section
      aria-label="Studio overview"
      className="hero-grid relative w-full overflow-hidden border-b border-hairline"
      style={{ ['--stage-glow-color' as string]: stageGlowColor }}
    >
      {/* Dynamic Ambient Atmosphere Wash */}
      <div aria-hidden="true" className="stage-glow" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 transition-all duration-700"
        style={{ background: glowBg }}
      />

      <div className="relative z-[1] mx-auto max-w-[1400px] px-4 py-4 sm:px-6 lg:py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,476px)] lg:items-center lg:gap-8">
          {/* Left Column: Editorial Identity & Soul */}
          <div className="min-w-0">
            <motion.a
              href={user?.html_url ?? `https://github.com/${GITHUB_USER}`}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING}
              className="mono mb-2 inline-flex h-7 max-w-full items-center gap-2 rounded-full bg-surface/90 py-0.5 pl-1 pr-3 text-[10.5px] tracking-[0.08em] text-dim shadow-[inset_0_0_0_1px_var(--hairline)] backdrop-blur-sm transition hover:bg-elevated hover:text-ink"
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
              <span className="hidden text-mute sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="hidden shrink-0 text-mute sm:inline">INDEPENDENT WEB ATELIER</span>
              <span className="text-mute" aria-hidden="true">
                ·
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-phosphor-ink">
                <span
                  className="led-dot"
                  style={{ ['--c' as string]: live.length > 0 ? 'var(--led-online)' : 'var(--ink-muted)' }}
                  aria-hidden="true"
                />
                {live.length} LIVE WORLDS
              </span>
            </motion.a>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.03 }}
              className="display text-[clamp(30px,3.6vw,46px)] leading-[1.01] tracking-[-0.035em] text-ink"
            >
              Playable worlds,
              <br />
              <span className="serif font-normal text-ink/90" style={{ fontSize: '1.03em' }}>
                forged <span className="text-hot-ink">live.</span>
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.06 }}
              className="mt-2 max-w-[540px] text-[13.5px] leading-[1.48] text-dim sm:text-[14px]"
            >
              Zero-backend apps, arcade sims, aerospace decks &amp; tactile audio studios — shipped continuously by{' '}
              <span className="font-medium text-ink">{user?.login ?? GITHUB_USER}</span>.
            </motion.p>
          </div>

          {/* Right Column: Compact Telemetry & Intelligent 30D/90D Chrono-Pulse */}
          <div className="surface-inset w-full min-w-0 overflow-hidden p-3 sm:p-3.5">
            <div className="mb-2.5 grid grid-cols-3 divide-x divide-hairline border-b border-hairline pb-2.5">
              <StatCounter
                value={live.length}
                label="Live Worlds"
                shortLabel="Live"
                tone="online"
                className="pr-2 sm:pr-3"
              />
              <StatCounter
                value={velocityVal}
                label={commits30d > 0 ? 'Commits 30d' : 'Pushes 7d'}
                shortLabel="30d"
                tone="hot"
                className="px-2 sm:px-3"
              />
              <StatCounter
                displayText={latestAgeMs !== null ? formatDelta(latestAgeMs) : '--'}
                suffix={latestAgeMs !== null ? 'ago' : ''}
                label="Last Ship"
                shortLabel="Shipped"
                tone={latestFresh ? 'active' : 'neutral'}
                className="pl-2 sm:pl-3"
              />
            </div>
            <HeatStrip />
          </div>
        </div>
      </div>
    </section>
  );
}
