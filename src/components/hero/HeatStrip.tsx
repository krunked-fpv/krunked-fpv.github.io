import { useCallback, useMemo, useRef, useState } from 'react';
import {
  buildChronoWindow,
  buildMomentumPath,
  formatRepoSummary,
  normalizeChronoDays,
  resolveChronoWindowRange,
  thermalTier,
  type ChronoDayInput,
} from '../../art/chronoPulse';
import { foley } from '../../audio/microFoley';
import { useDeck } from '../../store/deckStore';
import { useHeat } from '../../store/selectors';
import type { ChronoDay, ChronoWindow } from '../../types/github';

export interface HeatStripProps {
  days?: readonly ChronoDayInput[];
  activeWindow?: { startDate: string; endDate: string; startIdx?: number; endIdx?: number } | null;
  onSelectWindow?: (win: ChronoWindow | null) => void;
  onHoverDay?: (day: ChronoDay | null) => void;
  onTick?: () => void;
  className?: string;
}

const DAY_COUNT = 90;
const SLOT_W = 4;
const VB_W = DAY_COUNT * SLOT_W; // 360
const VB_H = 44;
const BASELINE_Y = 38;
const MAX_BAR_H = 32;

const TIER_FILL = [
  'var(--heat-0, rgba(255,255,255,0.09))',
  'var(--heat-1, #10B981)',
  'var(--heat-2, #F59E0B)',
  'var(--heat-3, #FF4F00)',
] as const;

/**
 * Interactive 90-Day Chrono-Pulse Thermal Telemetry Waveform & Sprint-Window Scrubber.
 * Supports pointer hover/drag range lock, click-to-toggle day filter, full keyboard scrubbing,
 * viewport-clamped 375px-safe tooltip, and dual-theme CSS thermal tokens.
 */
export function HeatStrip({
  days: daysProp,
  activeWindow: windowProp,
  onSelectWindow,
  onHoverDay,
  onTick,
  className = '',
}: HeatStripProps = {}) {
  const storeDays = useHeat();
  const storeWindow = useDeck((s) => s.chronoWindow);
  const setStoreWindow = useDeck((s) => s.setChronoWindow);

  const days = useMemo(
    () => normalizeChronoDays(daysProp ?? storeDays, DAY_COUNT),
    [daysProp, storeDays],
  );
  const activeWindow = windowProp !== undefined ? windowProp : storeWindow;
  const lockedRange = useMemo(
    () => resolveChronoWindowRange(activeWindow, days),
    [activeWindow, days],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState<number>(DAY_COUNT - 1);
  const [isFocused, setIsFocused] = useState(false);
  const [dragState, setDragState] = useState<{ anchor: number; current: number } | null>(null);
  const lastSoundIdxRef = useRef<number>(-1);

  const playTick = useCallback(() => {
    if (onTick) onTick();
    else foley.tick();
  }, [onTick]);

  const commitWindow = useCallback(
    (next: ChronoWindow | null) => {
      if (onSelectWindow) onSelectWindow(next);
      else setStoreWindow(next);
    },
    [onSelectWindow, setStoreWindow],
  );

  const maxCount = useMemo(() => Math.max(1, ...days.map((d) => d.count)), [days]);
  const totalCount = useMemo(() => days.reduce((a, d) => a + d.count, 0), [days]);
  const activeDays = useMemo(() => days.filter((d) => d.count > 0).length, [days]);
  const momentumPath = useMemo(() => buildMomentumPath(days, BASELINE_Y, MAX_BAR_H, SLOT_W), [days]);

  const previewRange: [number, number] | null = dragState
    ? [Math.min(dragState.anchor, dragState.current), Math.max(dragState.anchor, dragState.current)]
    : null;
  const displayRange = previewRange ?? lockedRange;

  const clientXToIndex = useCallback((clientX: number): number => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(DAY_COUNT - 1, Math.floor(ratio * DAY_COUNT)));
  }, []);

  const toggleOrLockRange = useCallback(
    (startIdx: number, endIdx: number) => {
      const a = Math.min(startIdx, endIdx);
      const b = Math.max(startIdx, endIdx);
      const isSameSingle =
        a === b && lockedRange !== null && lockedRange[0] === a && lockedRange[1] === b;
      if (isSameSingle) {
        commitWindow(null);
      } else {
        commitWindow(buildChronoWindow(days, a, b));
      }
    },
    [commitWindow, days, lockedRange],
  );

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const idx = clientXToIndex(e.clientX);
    setDragState({ anchor: idx, current: idx });
    setHoverIdx(idx);
    setFocusIdx(idx);
    lastSoundIdxRef.current = idx;
    playTick();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointerId
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const idx = clientXToIndex(e.clientX);
    if (dragState) {
      if (idx !== dragState.current) {
        setDragState({ anchor: dragState.anchor, current: idx });
        setFocusIdx(idx);
        setHoverIdx(idx);
        if (idx !== lastSoundIdxRef.current) {
          lastSoundIdxRef.current = idx;
          playTick();
        }
      }
      return;
    }
    if (idx !== hoverIdx) {
      setHoverIdx(idx);
      setFocusIdx(idx);
      if (idx !== lastSoundIdxRef.current) {
        lastSoundIdxRef.current = idx;
        playTick();
      }
      onHoverDay?.(days[idx] ?? null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    const { anchor, current } = dragState;
    setDragState(null);
    if (e.type !== 'pointercancel') {
      toggleOrLockRange(anchor, current);
    }
  };

  const handlePointerLeave = () => {
    if (dragState) return;
    setHoverIdx(null);
    lastSoundIdxRef.current = -1;
    onHoverDay?.(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      const nextIdx = Math.max(0, Math.min(DAY_COUNT - 1, focusIdx + delta));
      if (nextIdx !== focusIdx) {
        if (e.shiftKey) {
          const base = lockedRange ? lockedRange[0] : focusIdx;
          commitWindow(buildChronoWindow(days, base, nextIdx));
        } else {
          onHoverDay?.(days[nextIdx] ?? null);
        }
        setFocusIdx(nextIdx);
        setHoverIdx(nextIdx);
        playTick();
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      playTick();
      toggleOrLockRange(focusIdx, focusIdx);
      return;
    }
    if (e.key === 'Escape' && lockedRange) {
      e.preventDefault();
      playTick();
      commitWindow(null);
    }
  };

  // Active inspection readout (drag range > hovered/focused day > locked window > default summary)
  const inspectedIdx = hoverIdx ?? (isFocused ? focusIdx : null);
  const tooltipPayload = useMemo(() => {
    if (previewRange) {
      const w = buildChronoWindow(days, previewRange[0], previewRange[1]);
      if (!w) return null;
      const mid = Math.round((previewRange[0] + previewRange[1]) / 2);
      return {
        anchorIdx: mid,
        dateLabel: w.startDate === w.endDate ? w.startDate : `${w.startDate} .. ${w.endDate}`,
        count: w.totalCount,
        repos: w.repos,
      };
    }
    if (inspectedIdx !== null) {
      const d = days[inspectedIdx];
      if (!d) return null;
      return {
        anchorIdx: inspectedIdx,
        dateLabel: d.date,
        count: d.count,
        repos: d.repos,
      };
    }
    return null;
  }, [previewRange, inspectedIdx, days]);

  const lockedPayload = useMemo(
    () => (lockedRange ? buildChronoWindow(days, lockedRange[0], lockedRange[1]) : null),
    [lockedRange, days],
  );

  const headerStatus = tooltipPayload
    ? `${tooltipPayload.dateLabel} · ${tooltipPayload.count} ${tooltipPayload.count === 1 ? 'ship' : 'ships'}`
    : lockedPayload
      ? `${lockedPayload.startDate === lockedPayload.endDate ? lockedPayload.startDate : `${lockedPayload.startDate}..${lockedPayload.endDate}`} · ${lockedPayload.totalCount} ships`
      : `${totalCount} ships · ${activeDays}d`;

  const tooltipLeftPct = tooltipPayload
    ? Math.max(22, Math.min(78, ((tooltipPayload.anchorIdx + 0.5) / DAY_COUNT) * 100))
    : 50;

  return (
    <div className={`relative w-full min-w-0 max-w-full ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="eyebrow shrink-0">90d chrono-pulse</span>
          {lockedRange && (
            <button
              type="button"
              onClick={() => {
                playTick();
                commitWindow(null);
              }}
              className="mono inline-flex h-[18px] shrink-0 cursor-pointer items-center rounded border border-hairline-strong bg-elevated px-1.5 text-[9.5px] tracking-wider text-hot-ink uppercase transition-colors hover:bg-hover"
              aria-label="Clear selected chrono window"
            >
              Clear
            </button>
          )}
        </div>
        <span className="mono truncate text-[10.5px] tracking-wider text-dim">{headerStatus}</span>
      </div>

      {/* Interactive SVG Waveform & Scrubber */}
      <div className="relative w-full">
        {tooltipPayload && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute bottom-[calc(100%+6px)] z-30 max-w-[min(280px,96%)] -translate-x-1/2 rounded-lg border border-hairline-strong bg-elevated px-2.5 py-1.5 shadow-lg"
            style={{ left: `${tooltipLeftPct.toFixed(1)}%` }}
          >
            <div className="mono flex items-center justify-between gap-3 text-[10px] tracking-wider whitespace-nowrap">
              <span className="text-ink">{tooltipPayload.dateLabel}</span>
              <span className="text-hot-ink">
                {tooltipPayload.count} {tooltipPayload.count === 1 ? 'COMMIT' : 'COMMITS'}
              </span>
            </div>
            <div className="mono mt-0.5 truncate text-[9.5px] tracking-wide text-mute">
              {formatRepoSummary(tooltipPayload.repos, 3)}
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          tabIndex={0}
          role="group"
          aria-label={`90-day Chrono-Pulse commit timeline: ${totalCount} commits across ${activeDays} active days. Use arrow keys to scrub and Enter to filter.`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            if (!dragState) {
              setHoverIdx(null);
              onHoverDay?.(null);
            }
          }}
          className="block h-11 w-full cursor-crosshair touch-none select-none rounded-md text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {/* Midline & baseline guide rails */}
          <line
            x1={0}
            y1={Math.round(BASELINE_Y - MAX_BAR_H * 0.5)}
            x2={VB_W}
            y2={Math.round(BASELINE_Y - MAX_BAR_H * 0.5)}
            stroke="currentColor"
            strokeOpacity={0.07}
            strokeWidth={0.75}
            shapeRendering="crispEdges"
          />
          <line
            x1={0}
            y1={BASELINE_Y}
            x2={VB_W}
            y2={BASELINE_Y}
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={0.75}
            shapeRendering="crispEdges"
          />

          {/* -90D / -60D / -30D / NOW vernier ticks */}
          {[0, 30, 60, 89].map((tickDay) => {
            const tx = tickDay * SLOT_W + 2;
            return (
              <line
                key={tickDay}
                x1={tx}
                y1={BASELINE_Y}
                x2={tx}
                y2={BASELINE_Y + 4}
                stroke="currentColor"
                strokeOpacity={0.34}
                strokeWidth={0.85}
                shapeRendering="crispEdges"
              />
            );
          })}

          {/* Locked or drag-preview sprint window band */}
          {displayRange && (
            <rect
              x={displayRange[0] * SLOT_W}
              y={1}
              width={(displayRange[1] - displayRange[0] + 1) * SLOT_W}
              height={BASELINE_Y - 1}
              fill="var(--led-hot, #FF4F00)"
              fillOpacity={0.14}
              stroke="var(--led-hot, #FF4F00)"
              strokeOpacity={0.55}
              strokeWidth={0.75}
              shapeRendering="crispEdges"
            />
          )}

          {/* Subtle 3-day momentum envelope behind bars */}
          {totalCount > 0 && momentumPath && (
            <path
              d={momentumPath}
              fill="none"
              stroke="var(--led-online, #10B981)"
              strokeOpacity={0.3}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          )}

          {/* 90 thermal velocity bars */}
          <g>
            {days.map((d, i) => {
              const inRange = !displayRange || (i >= displayRange[0] && i <= displayRange[1]);
              const tier = thermalTier(d.count, maxCount);
              const barH = d.count > 0 ? Math.max(4, Math.round((d.count / maxCount) * MAX_BAR_H)) : 2.5;
              const y = BASELINE_Y - barH;
              const fillOpacity =
                d.count === 0 ? (inRange ? 0.85 : 0.25) : inRange ? 0.96 : 0.24;

              return (
                <rect
                  key={d.date}
                  x={i * SLOT_W + 0.5}
                  y={y}
                  width={3}
                  height={barH}
                  fill={TIER_FILL[tier]}
                  fillOpacity={fillOpacity}
                  shapeRendering="crispEdges"
                />
              );
            })}
          </g>

          {/* Active hover / focus cursor needle */}
          {inspectedIdx !== null && (
            <g>
              <rect
                x={inspectedIdx * SLOT_W + 0.5}
                y={0}
                width={3}
                height={BASELINE_Y}
                fill="currentColor"
                fillOpacity={0.14}
                shapeRendering="crispEdges"
              />
              <rect
                x={inspectedIdx * SLOT_W + 0.5}
                y={0}
                width={3}
                height={2}
                fill="var(--led-hot, #FF4F00)"
                shapeRendering="crispEdges"
              />
            </g>
          )}
        </svg>
      </div>

      <div className="mono mt-1 flex items-center justify-between text-[9.5px] tracking-wider text-mute">
        <span>-90D</span>
        <span className="hidden sm:inline">-60D</span>
        <span className="hidden sm:inline">-30D</span>
        <span>NOW</span>
      </div>
    </div>
  );
}
