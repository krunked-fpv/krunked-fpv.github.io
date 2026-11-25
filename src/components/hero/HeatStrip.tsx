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

type RangeMode = '14d' | '30d' | '90d';

const FULL_DAYS = 90;
const MONTH_DAYS = 30;
const SPRINT_DAYS = 14;
const VB_W = 360;
const VB_H = 42;
const BASELINE_Y = 36;
const MAX_BAR_H = 31;

const TIER_FILL = [
  'var(--heat-0, rgba(255,255,255,0.09))',
  'var(--heat-1, #10B981)',
  'var(--heat-2, #F59E0B)',
  'var(--heat-3, #FF4F00)',
] as const;

const RANGE_OPTIONS: readonly { id: RangeMode; label: string }[] = [
  { id: '14d', label: '14D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
];

/**
 * Interactive 14D / 30D / 90D Chrono-Pulse Thermal Telemetry Waveform & Sprint-Window Scrubber.
 * Automatically focuses on 14D when trailing sprint activity is concentrated in the last two weeks,
 * with instant zoom to 30D or full 90D history. Maps visible slice indices back to exact 90-day
 * ChronoDay indices for buildChronoWindow so scrubbing, range lock, and tooltips stay exact.
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

  const [userRangeMode, setUserRangeMode] = useState<RangeMode | null>(null);

  const allDays = useMemo(
    () => normalizeChronoDays(daysProp ?? storeDays, FULL_DAYS),
    [daysProp, storeDays],
  );
  const activeWindow = windowProp !== undefined ? windowProp : storeWindow;

  const sprint14Days = useMemo(() => allDays.slice(-SPRINT_DAYS), [allDays]);
  const month30Days = useMemo(() => allDays.slice(-MONTH_DAYS), [allDays]);

  // Smart default: focus 14D when recent velocity is concentrated in the trailing 14-day window
  const autoMode: RangeMode = useMemo(() => {
    const recent14Total = sprint14Days.reduce((a, d) => a + d.count, 0);
    const prior16Total = allDays.slice(-MONTH_DAYS, -SPRINT_DAYS).reduce((a, d) => a + d.count, 0);
    return recent14Total > 0 && prior16Total <= recent14Total * 0.05 ? '14d' : '30d';
  }, [allDays, sprint14Days]);

  const preferredMode = userRangeMode ?? autoMode;

  // Ensure an active locked ChronoWindow outside the currently selected slice stays visible
  const effectiveMode: RangeMode = useMemo(() => {
    if (!activeWindow) return preferredMode;
    if (preferredMode === '14d') {
      if (resolveChronoWindowRange(activeWindow, sprint14Days)) return '14d';
      if (resolveChronoWindowRange(activeWindow, month30Days)) return '30d';
      if (resolveChronoWindowRange(activeWindow, allDays)) return '90d';
    } else if (preferredMode === '30d') {
      if (resolveChronoWindowRange(activeWindow, month30Days)) return '30d';
      if (resolveChronoWindowRange(activeWindow, allDays)) return '90d';
    }
    return preferredMode;
  }, [activeWindow, preferredMode, sprint14Days, month30Days, allDays]);

  const days = effectiveMode === '14d' ? sprint14Days : effectiveMode === '30d' ? month30Days : allDays;
  const dayCount = days.length;
  const sliceOffset = FULL_DAYS - dayCount;

  const slotW = VB_W / dayCount;
  const barW = effectiveMode === '14d' ? 17.6 : effectiveMode === '30d' ? 8.2 : 2.9;
  const barOffset = (slotW - barW) / 2;
  const barRx = effectiveMode === '14d' ? 3 : effectiveMode === '30d' ? 1.8 : 1.15;

  const lockedRange = useMemo(
    () => resolveChronoWindowRange(activeWindow, days),
    [activeWindow, days],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState<number>(SPRINT_DAYS - 1);
  const [isFocused, setIsFocused] = useState(false);
  const [dragState, setDragState] = useState<{ anchor: number; current: number } | null>(null);
  const lastSoundIdxRef = useRef<number>(-1);

  const safeFocusIdx = Math.max(0, Math.min(dayCount - 1, focusIdx));

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

  const switchMode = (next: RangeMode) => {
    if (next === effectiveMode) return;
    playTick();
    setHoverIdx(null);
    setDragState(null);
    const nextCount = next === '14d' ? SPRINT_DAYS : next === '30d' ? MONTH_DAYS : FULL_DAYS;
    setFocusIdx(nextCount - 1);
    setUserRangeMode(next);
  };

  const maxCount = useMemo(() => Math.max(1, ...days.map((d) => d.count)), [days]);
  const totalCount = useMemo(() => days.reduce((a, d) => a + d.count, 0), [days]);
  const activeDays = useMemo(() => days.filter((d) => d.count > 0).length, [days]);
  const momentumPath = useMemo(() => buildMomentumPath(days, BASELINE_Y, MAX_BAR_H, slotW), [days, slotW]);

  const previewRange: [number, number] | null = dragState
    ? [Math.min(dragState.anchor, dragState.current), Math.max(dragState.anchor, dragState.current)]
    : null;
  const displayRange = previewRange ?? lockedRange;

  const clientXToIndex = useCallback(
    (clientX: number): number => {
      const el = svgRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      if (!rect.width) return 0;
      const ratio = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(dayCount - 1, Math.floor(ratio * dayCount)));
    },
    [dayCount],
  );

  const toggleOrLockRange = useCallback(
    (startIdx: number, endIdx: number) => {
      const a = Math.min(startIdx, endIdx);
      const b = Math.max(startIdx, endIdx);
      const isSameSingle =
        a === b && lockedRange !== null && lockedRange[0] === a && lockedRange[1] === b;
      if (isSameSingle) {
        commitWindow(null);
      } else {
        commitWindow(buildChronoWindow(allDays, sliceOffset + a, sliceOffset + b));
      }
    },
    [commitWindow, allDays, sliceOffset, lockedRange],
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
      const nextIdx = Math.max(0, Math.min(dayCount - 1, safeFocusIdx + delta));
      if (nextIdx !== safeFocusIdx) {
        if (e.shiftKey) {
          const base = lockedRange ? lockedRange[0] : safeFocusIdx;
          commitWindow(buildChronoWindow(allDays, sliceOffset + base, sliceOffset + nextIdx));
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
      toggleOrLockRange(safeFocusIdx, safeFocusIdx);
      return;
    }
    if (e.key === 'Escape' && lockedRange) {
      e.preventDefault();
      playTick();
      commitWindow(null);
    }
  };

  // Active inspection readout (drag range > hovered/focused day > locked window > default summary)
  const inspectedIdx = hoverIdx !== null && hoverIdx < dayCount ? hoverIdx : isFocused ? safeFocusIdx : null;
  const tooltipPayload = useMemo(() => {
    if (previewRange) {
      const w = buildChronoWindow(allDays, sliceOffset + previewRange[0], sliceOffset + previewRange[1]);
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
  }, [previewRange, inspectedIdx, allDays, sliceOffset, days]);

  const lockedPayload = useMemo(
    () => (lockedRange ? buildChronoWindow(allDays, sliceOffset + lockedRange[0], sliceOffset + lockedRange[1]) : null),
    [lockedRange, allDays, sliceOffset],
  );

  const headerStatus = tooltipPayload
    ? `${tooltipPayload.dateLabel} · ${tooltipPayload.count} ${tooltipPayload.count === 1 ? 'ship' : 'ships'}`
    : lockedPayload
      ? `${lockedPayload.startDate === lockedPayload.endDate ? lockedPayload.startDate : `${lockedPayload.startDate}..${lockedPayload.endDate}`} · ${lockedPayload.totalCount} ships`
      : `${totalCount} ships · ${activeDays}d`;

  const tooltipLeftPct = tooltipPayload
    ? Math.max(22, Math.min(78, ((tooltipPayload.anchorIdx + 0.5) / dayCount) * 100))
    : 50;

  const vernierTicks =
    effectiveMode === '14d' ? [0, 4, 9, 13] : effectiveMode === '30d' ? [0, 10, 20, 29] : [0, 30, 60, 89];
  const axisLabels =
    effectiveMode === '14d'
      ? ['-14D', '-10D', '-5D', 'NOW']
      : effectiveMode === '30d'
        ? ['-30D', '-20D', '-10D', 'NOW']
        : ['-90D', '-60D', '-30D', 'NOW'];

  return (
    <div className={`relative w-full min-w-0 max-w-full ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span className="eyebrow hidden shrink-0 min-[390px]:inline">Chrono-pulse</span>
          <span className="eyebrow shrink-0 min-[390px]:hidden">Pulse</span>

          {/* Crisp 14D | 30D | 90D range switcher */}
          <div
            role="group"
            aria-label="Chrono-pulse range"
            className="mono inline-flex shrink-0 items-center rounded-[6px] border border-hairline bg-chassis/60 p-[1.5px] text-[9.5px] font-medium tracking-[0.07em]"
          >
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => switchMode(opt.id)}
                aria-pressed={effectiveMode === opt.id}
                className={`cursor-pointer rounded-[4.5px] px-1.5 py-[1px] transition ${
                  effectiveMode === opt.id
                    ? 'bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--hairline-strong)]'
                    : 'text-mute hover:text-dim'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

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
          aria-label={`${dayCount}-day Chrono-Pulse commit timeline: ${totalCount} commits across ${activeDays} active days. Use arrow keys to scrub and Enter to filter.`}
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
          className="block h-[42px] w-full cursor-crosshair touch-none select-none rounded-md text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {/* Midline & baseline guide rails */}
          <line
            x1={0}
            y1={Math.round(BASELINE_Y - MAX_BAR_H * 0.5)}
            x2={VB_W}
            y2={Math.round(BASELINE_Y - MAX_BAR_H * 0.5)}
            stroke="currentColor"
            strokeOpacity={0.06}
            strokeWidth={0.75}
            shapeRendering="crispEdges"
          />
          <line
            x1={0}
            y1={BASELINE_Y}
            x2={VB_W}
            y2={BASELINE_Y}
            stroke="currentColor"
            strokeOpacity={0.18}
            strokeWidth={0.75}
            shapeRendering="crispEdges"
          />

          {/* Vernier axis ticks */}
          {vernierTicks.map((tickDay) => {
            const tx = tickDay * slotW + slotW * 0.5;
            return (
              <line
                key={tickDay}
                x1={tx}
                y1={BASELINE_Y}
                x2={tx}
                y2={BASELINE_Y + 4}
                stroke="currentColor"
                strokeOpacity={0.32}
                strokeWidth={0.85}
                shapeRendering="crispEdges"
              />
            );
          })}

          {/* Locked or drag-preview sprint window band */}
          {displayRange && (
            <rect
              x={displayRange[0] * slotW}
              y={1}
              width={(displayRange[1] - displayRange[0] + 1) * slotW}
              height={BASELINE_Y - 1}
              rx={2}
              fill="var(--led-hot, #FF4F00)"
              fillOpacity={0.14}
              stroke="var(--led-hot, #FF4F00)"
              strokeOpacity={0.55}
              strokeWidth={0.75}
            />
          )}

          {/* Subtle 3-day momentum envelope behind bars */}
          {totalCount > 0 && momentumPath && (
            <path
              d={momentumPath}
              fill="none"
              stroke="var(--led-online, #10B981)"
              strokeOpacity={0.28}
              strokeWidth={1.1}
              strokeLinejoin="round"
            />
          )}

          {/* Thermal velocity pill-cap bars */}
          <g>
            {days.map((d, i) => {
              const inRange = !displayRange || (i >= displayRange[0] && i <= displayRange[1]);
              const tier = thermalTier(d.count, maxCount);
              // Perceptual power curve keeps moderate sprint days vibrant alongside massive spike days
              const scaled = d.count > 0 ? Math.pow(d.count / maxCount, 0.54) : 0;
              const barH = d.count > 0 ? Math.max(5, Math.round(scaled * MAX_BAR_H)) : 2.5;
              const y = BASELINE_Y - barH;
              const isHovered = inspectedIdx === i;
              const fillOpacity =
                d.count === 0
                  ? inRange
                    ? 0.72
                    : 0.2
                  : isHovered
                    ? 1
                    : inRange
                      ? 0.95
                      : 0.24;

              return (
                <rect
                  key={d.date}
                  x={i * slotW + barOffset}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={d.count > 0 ? barRx : 1}
                  fill={TIER_FILL[tier]}
                  fillOpacity={fillOpacity}
                />
              );
            })}
          </g>

          {/* Active hover / focus cursor needle */}
          {inspectedIdx !== null && (
            <g>
              <rect
                x={inspectedIdx * slotW + barOffset}
                y={0}
                width={barW}
                height={BASELINE_Y}
                rx={1.5}
                fill="currentColor"
                fillOpacity={0.11}
              />
              <rect
                x={inspectedIdx * slotW + barOffset}
                y={0}
                width={barW}
                height={2.2}
                rx={1}
                fill="var(--led-hot, #FF4F00)"
              />
            </g>
          )}
        </svg>
      </div>

      <div className="mono mt-1 flex items-center justify-between text-[9.5px] tracking-wider text-mute">
        <span>{axisLabels[0]}</span>
        <span className="hidden sm:inline">{axisLabels[1]}</span>
        <span className="hidden sm:inline">{axisLabels[2]}</span>
        <span>{axisLabels[3]}</span>
      </div>
    </div>
  );
}
