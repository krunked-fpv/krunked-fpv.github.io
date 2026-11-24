import { motion } from 'framer-motion';
import { SPRING, GITHUB_USER } from '../../config/site';
import { formatDelta } from '../../domain/freshness';
import { useNow } from '../../hooks/useNow';
import { useDeck } from '../../store/deckStore';
import type { Project } from '../../types/project';
import { StatCounter } from './StatCounter';
import { HeatStrip } from './HeatStrip';

export function HeroBand({ projects }: { projects: Project[] }) {
  const user = useDeck((s) => s.user);
  const now = useNow(10_000);
  const live = projects.filter((p) => p.kind === 'live');
  const latest = projects.reduce<Project | null>((a, p) => (!a || Date.parse(p.lastActivityAt) > Date.parse(a.lastActivityAt) ? p : a), null);
  const pushes7d = projects.reduce((a, p) => a + p.pushes7d, 0);
  return (
    <section className="mx-auto max-w-[1480px] overflow-hidden px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-end">
        <div className="min-w-0">
          <motion.a
            href={user?.html_url ?? `https://github.com/${GITHUB_USER}`}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="mono mb-5 inline-flex max-w-full items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-[11.5px] tracking-wider text-dim shadow-[inset_0_0_0_1px_var(--hairline)] hover:text-ink"
          >
            {user?.avatar_url ? (
              <img src={`${user.avatar_url}${user.avatar_url.includes('?') ? '&' : '?'}s=48`} alt="" width={22} height={22} className="size-[22px] rounded-full" />
            ) : (
              <span className="size-[22px] rounded-full bg-white/10" />
            )}
            @{user?.login ?? GITHUB_USER}
            {user && <span className="text-mute">· {user.public_repos} repos</span>}
          </motion.a>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.05 }}
            className="display text-[clamp(34px,8vw,104px)]"
          >
            {live.length || '—'} live build{live.length === 1 ? '' : 's'}.
            <br />
            <span className="serif font-normal text-dim" style={{ letterSpacing: '-0.02em', lineHeight: 1.05 }}>
              {latest ? (
                <>
                  Last ship <span className="text-phosphor">{formatDelta(now - Date.parse(latest.lastActivityAt))}</span> ago.
                </>
              ) : (
                'Warming the forge…'
              )}
            </span>
          </motion.h1>
          {latest && (
            <p className="mt-4 max-w-xl break-words text-[15px] text-dim">
              Most recent: <span className="text-ink">{latest.displayName}</span>
              {latest.latestCommit?.message ? <> — “{latest.latestCommit.message}”</> : null}. Tap anything below to play it instantly.
            </p>
          )}
        </div>
        <div className="flex w-full min-w-0 flex-col gap-7 overflow-hidden">
          <div className="grid grid-cols-3 gap-4">
            <StatCounter value={live.length} label="Live apps" />
            <StatCounter value={pushes7d} label="Pushes 7d" />
            <StatCounter value={projects.length} label="Repos" />
          </div>
          <HeatStrip />
        </div>
      </div>
    </section>
  );
}
