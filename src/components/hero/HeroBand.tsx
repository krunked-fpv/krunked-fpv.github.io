import { motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useFoley } from '../../audio/useFoley';
import { GITHUB_USER, SPRING } from '../../config/site';
import { hueOf } from '../../domain/buildProjects';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import { useChronoPulse } from '../../store/selectors';
import type { Project } from '../../types/project';
import { TelemetryRibbon } from './HeatStrip';
import { HeroCanvas } from './HeroCanvas';

export interface HeroBandProps {
  projects: Project[];
  activeSpotlight?: Project | null;
  /** Featured 5-blade exhibition stage mounted directly inside the living WebGL2 HeroCanvas atmosphere. */
  children?: ReactNode;
}

/**
 * Full-bleed Living Monolith Cinema Opening:
 * - Interactive 60fps WebGL2 <HeroCanvas /> behind both the monumental poster masthead and the 5-blade stage.
 * - Whisper-quiet top metadata hairline + bold sculptural masthead (zero boxed stat cards).
 * - Full-width hardware TelemetryRibbon & collapsible Live Dispatch anchored seamlessly at the base.
 */
export function HeroBand({ projects, activeSpotlight, children }: HeroBandProps) {
  const user = useDeck((s) => s.user);
  const theme = useDeck((s) => s.vault.prefs.theme);
  const pulseDays = useChronoPulse();
  const foley = useFoley();
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

  const spotlightTarget = activeSpotlight ?? live[0] ?? projects[0] ?? null;
  const activeHue = spotlightTarget ? hueOf(spotlightTarget) : 84;
  const profileUrl = user?.html_url ?? `https://github.com/${GITHUB_USER}`;
  const profileLogin = user?.login ?? GITHUB_USER;

  return (
    <section
      id="stage"
      aria-label="Monolith studio stage"
      className="relative w-full overflow-hidden border-b border-hairline bg-chassis"
    >
      {/* Full-Bleed Living 60fps WebGL2 Shader Backdrop */}
      <HeroCanvas accentHue={activeHue} theme={theme} className="pointer-events-none absolute inset-0 z-0" />

      {/* Subtle Bottom Horizon Feather into Telemetry Ribbon */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-32 bg-gradient-to-t from-chassis via-chassis/45 to-transparent"
      />

      {/* Monumental Editorial Masthead + Children (5-Blade Expanding Accordion) */}
      <div className="relative z-[1] mx-auto max-w-[1440px] px-4 pt-4 pb-5 sm:px-6 lg:pt-5 lg:pb-6">
        {/* Top Architectural Metadata Hairline */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-2.5"
        >
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mono inline-flex min-w-0 items-center gap-2 text-[10.5px] tracking-[0.12em] text-dim transition hover:text-ink"
          >
            {user?.avatar_url ? (
              <img
                src={`${user.avatar_url}${user.avatar_url.includes('?') ? '&' : '?'}s=48`}
                alt=""
                width={18}
                height={18}
                className="size-[18px] shrink-0 rounded-full object-cover ring-1 ring-hairline-strong"
              />
            ) : (
              <span className="size-[18px] shrink-0 rounded-full bg-tint shadow-[inset_0_0_0_1px_var(--hairline-strong)]" />
            )}
            <span className="truncate font-semibold text-ink">@{profileLogin}</span>
            <span className="hidden text-mute sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden shrink-0 text-mute sm:inline">INDEPENDENT PLAYABLE SOFTWARE STUDIO</span>
          </a>

          <div className="mono flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] tracking-[0.12em] text-mute uppercase">
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
              <span className="led-dot" style={{ ['--c' as string]: 'var(--led-hot)' }} aria-hidden="true" />
              {live.length} LIVE WORLDS
            </span>
            <span className="hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden sm:inline">
              <b className="font-semibold text-ink">{velocityVal}</b> COMMITS (30D)
            </span>
            <span className="hidden md:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden md:inline">
              LAST SHIP{' '}
              <b className={`font-semibold ${latestFresh ? 'text-hot-ink' : 'text-ink'}`}>
                {latestAgeMs !== null ? `${formatDelta(latestAgeMs)} AGO` : '--'}
              </b>
            </span>
          </div>
        </motion.div>

        {/* Full-Width Sculptural Poster Masthead */}
        <div className="mt-4 mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.03 }}
            className="masthead-display text-[clamp(36px,5.6vw,78px)] font-bold leading-[0.91] tracking-[-0.045em] text-ink"
          >
            PLAYABLE WORLDS
            <br />
            <span className="serif font-normal tracking-[-0.02em] text-ink/90" style={{ fontSize: '1.03em' }}>
              &amp; rogue <span className="text-hot-ink">instruments.</span>
            </span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.06 }}
            className="flex max-w-[360px] shrink-0 flex-col gap-2.5 lg:pb-1"
          >
            <p className="text-[13.5px] leading-[1.5] text-dim">
              Zero-backend games, 60fps aerospace radar, WebGL2 turntables &amp; tactile tools — built live in the open.
            </p>
            <a
              href="#worlds"
              onClick={() => foley.tick()}
              className="mono group inline-flex w-fit items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.16em] text-ink uppercase transition hover:text-hot-ink"
            >
              <span>Explore All {live.length}</span>
              <ArrowDown
                size={13}
                className="text-hot-ink transition-transform duration-200 group-hover:translate-y-0.5"
                aria-hidden="true"
              />
            </a>
          </motion.div>
        </div>

        {/* Featured 5-Blade Expanding Monolith Accordion Slot */}
        {children && <div className="w-full">{children}</div>}
      </div>

      {/* Full-Width Hardware Telemetry & Collapsible Live Dispatch Ribbon */}
      <TelemetryRibbon projects={projects} />
    </section>
  );
}
