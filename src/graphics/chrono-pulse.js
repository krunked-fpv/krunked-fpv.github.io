/**
 * Interactive 90-Day Chrono-Pulse Thermal Telemetry Timeline & Sprint-Window Scrubber.
 * Zero external dependencies; Node.js import safe; pure DOM node construction.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY_COUNT = 90;
const VB_WIDTH = DAY_COUNT * 4; // 360 units (3u bar + 1u gap)
const VB_HEIGHT = 32;
const BASELINE_Y = 29;
const MAX_BAR_H = 25;

function padIsoDateUtc(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function addUtcDays(isoDate, deltaDays) {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
  return padIsoDateUtc(parsed);
}

function normalizeDays90(days90) {
  const raw = Array.isArray(days90) ? days90.slice(-DAY_COUNT) : [];
  const todayIso = padIsoDateUtc(new Date());

  const normalized = raw.map((entry, idx) => {
    const totalCommits = Math.max(0, Math.round(Number(entry?.totalCommits) || 0));
    const slugs = Array.isArray(entry?.activeRepoSlugs)
      ? entry.activeRepoSlugs.map((s) => String(s)).filter(Boolean)
      : [];
    const fallbackDate = addUtcDays(todayIso, -(raw.length - 1 - idx));
    return {
      date: typeof entry?.date === 'string' && entry.date ? entry.date : fallbackDate,
      totalCommits,
      activeRepoSlugs: slugs,
    };
  });

  if (normalized.length === DAY_COUNT) return normalized;

  const anchorDate = normalized.length > 0 ? normalized[0].date : addUtcDays(todayIso, 1);
  const padCount = DAY_COUNT - normalized.length;
  const padded = [];
  for (let i = padCount; i >= 1; i--) {
    padded.push({
      date: addUtcDays(anchorDate, -i),
      totalCommits: 0,
      activeRepoSlugs: [],
    });
  }
  return padded.concat(normalized);
}

function resolveWindowRange(activeWindow, days) {
  if (!activeWindow) return null;

  if (
    Number.isInteger(activeWindow.startIdx) &&
    Number.isInteger(activeWindow.endIdx) &&
    activeWindow.startIdx >= 0 &&
    activeWindow.endIdx < days.length
  ) {
    const a = Math.min(activeWindow.startIdx, activeWindow.endIdx);
    const b = Math.max(activeWindow.startIdx, activeWindow.endIdx);
    return [a, b];
  }

  const startDate = activeWindow.startDate;
  const endDate = activeWindow.endDate || startDate;
  if (!startDate) return null;

  let startIdx = days.findIndex((d) => d.date >= startDate);
  let endIdx = -1;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].date <= endDate) {
      endIdx = i;
      break;
    }
  }
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return null;
  return [startIdx, endIdx];
}

function buildWindowPayload(days, range) {
  if (!range) return null;
  const [startIdx, endIdx] = range;
  const slugSet = new Set();
  let totalCommits = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const day = days[i];
    totalCommits += day.totalCommits;
    for (const slug of day.activeRepoSlugs) slugSet.add(slug);
  }
  return {
    startDate: days[startIdx].date,
    endDate: days[endIdx].date,
    startIdx,
    endIdx,
    totalCommits,
    slugs: Array.from(slugSet),
  };
}

function getThermalColor(commits, maxCommits) {
  if (commits <= 0) return 'var(--ink-muted, #8590A2)';
  const ratio = maxCommits > 0 ? commits / maxCommits : 1;
  if (ratio >= 0.6 || commits >= 5) return 'var(--led-hot, #FF4F00)';
  if (ratio >= 0.25 || commits >= 2) return 'var(--led-active, #F59E0B)';
  return 'var(--led-online, #10B981)';
}

function formatSlugSummary(slugs) {
  if (!slugs || slugs.length === 0) return 'NO ACTIVE REPOS';
  if (slugs.length <= 3) return slugs.join(', ');
  return `${slugs.slice(0, 3).join(', ')} +${slugs.length - 3}`;
}

/**
 * Mounts an interactive 90-bar Chrono-Pulse SVG timeline and floating tooltip.
 * @param {HTMLElement} containerEl
 * @param {object} [options]
 * @returns {{ update: (next?: { days90?: Array, activeWindow?: object|null }) => void, destroy: () => void }}
 */
export function mountChronoPulse(containerEl, options = {}) {
  if (!containerEl || typeof document === 'undefined') {
    return { update() {}, destroy() {} };
  }

  let days = normalizeDays90(options?.days90);
  let lockedRange = resolveWindowRange(options?.activeWindow, days);
  const onHoverDay = typeof options?.onHoverDay === 'function' ? options.onHoverDay : null;
  const onSelectWindow =
    typeof options?.onSelectWindow === 'function' ? options.onSelectWindow : null;
  const onTickSound = typeof options?.onTickSound === 'function' ? options.onTickSound : null;

  containerEl.classList.add('chrono-strip');
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    if (window.getComputedStyle(containerEl).position === 'static') {
      containerEl.style.position = 'relative';
    }
  } else if (!containerEl.style.position) {
    containerEl.style.position = 'relative';
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'chrono-strip__svg');
  svg.setAttribute('viewBox', `0 0 ${VB_WIDTH} ${VB_HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', '90-day Chrono-Pulse commit timeline');
  svg.style.display = 'block';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.cursor = 'crosshair';
  svg.style.touchAction = 'none';
  svg.style.userSelect = 'none';

  const windowBand = document.createElementNS(SVG_NS, 'rect');
  windowBand.setAttribute('class', 'chrono-strip__window');
  windowBand.setAttribute('y', '1');
  windowBand.setAttribute('height', String(BASELINE_Y - 1));
  windowBand.setAttribute('fill', 'var(--led-hot, #FF4F00)');
  windowBand.setAttribute('fill-opacity', '0.14');
  windowBand.setAttribute('stroke', 'var(--led-hot, #FF4F00)');
  windowBand.setAttribute('stroke-opacity', '0.55');
  windowBand.setAttribute('stroke-width', '0.75');
  windowBand.setAttribute('hidden', 'hidden');
  windowBand.style.display = 'none';
  svg.appendChild(windowBand);

  const baseline = document.createElementNS(SVG_NS, 'line');
  baseline.setAttribute('x1', '0');
  baseline.setAttribute('y1', String(BASELINE_Y));
  baseline.setAttribute('x2', String(VB_WIDTH));
  baseline.setAttribute('y2', String(BASELINE_Y));
  baseline.setAttribute('stroke', 'currentColor');
  baseline.setAttribute('stroke-opacity', '0.18');
  baseline.setAttribute('stroke-width', '0.75');
  svg.appendChild(baseline);

  for (const tickDay of [0, 30, 60, 89]) {
    const tx = tickDay * 4 + 2;
    const tick = document.createElementNS(SVG_NS, 'line');
    tick.setAttribute('x1', String(tx));
    tick.setAttribute('y1', String(BASELINE_Y));
    tick.setAttribute('x2', String(tx));
    tick.setAttribute('y2', String(BASELINE_Y + 2.5));
    tick.setAttribute('stroke', 'currentColor');
    tick.setAttribute('stroke-opacity', '0.3');
    tick.setAttribute('stroke-width', '0.75');
    svg.appendChild(tick);
  }

  const barsGroup = document.createElementNS(SVG_NS, 'g');
  const barNodes = [];
  for (let i = 0; i < DAY_COUNT; i++) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(i * 4 + 0.5));
    rect.setAttribute('width', '3');
    rect.setAttribute('shape-rendering', 'crispEdges');
    barNodes.push(rect);
    barsGroup.appendChild(rect);
  }
  svg.appendChild(barsGroup);

  const hoverCursor = document.createElementNS(SVG_NS, 'rect');
  hoverCursor.setAttribute('class', 'chrono-strip__cursor');
  hoverCursor.setAttribute('y', '0');
  hoverCursor.setAttribute('width', '3');
  hoverCursor.setAttribute('height', String(BASELINE_Y));
  hoverCursor.setAttribute('fill', 'currentColor');
  hoverCursor.setAttribute('fill-opacity', '0.12');
  hoverCursor.style.display = 'none';
  svg.appendChild(hoverCursor);

  const tooltip = document.createElement('div');
  tooltip.className = 'chrono-tooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('aria-live', 'polite');
  tooltip.style.position = 'absolute';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.zIndex = '40';

  const ttDate = document.createElement('span');
  ttDate.className = 'chrono-tooltip__date';
  const ttCommits = document.createElement('span');
  ttCommits.className = 'chrono-tooltip__commits';
  const ttSlugs = document.createElement('span');
  ttSlugs.className = 'chrono-tooltip__slugs';
  tooltip.append(ttDate, ttCommits, ttSlugs);

  containerEl.replaceChildren(svg, tooltip);

  let isDragging = false;
  let anchorIdx = 0;
  let dragIdx = 0;
  let lastHoverIdx = -1;
  let focusIdx = DAY_COUNT - 1;

  function renderBars(previewRange = null) {
    const activeRange = previewRange || lockedRange;
    const maxCommits = Math.max(1, ...days.map((d) => d.totalCommits));

    if (activeRange) {
      const [s, e] = activeRange;
      windowBand.setAttribute('x', String(s * 4));
      windowBand.setAttribute('width', String((e - s + 1) * 4));
      windowBand.removeAttribute('hidden');
      windowBand.style.display = '';
    } else {
      windowBand.setAttribute('hidden', 'hidden');
      windowBand.style.display = 'none';
    }

    for (let i = 0; i < DAY_COUNT; i++) {
      const day = days[i];
      const rect = barNodes[i];
      const inRange = !activeRange || (i >= activeRange[0] && i <= activeRange[1]);

      if (day.totalCommits === 0) {
        rect.setAttribute('y', String(BASELINE_Y - 2));
        rect.setAttribute('height', '2');
        rect.setAttribute('fill', 'var(--ink-muted, #8590A2)');
        rect.setAttribute('fill-opacity', inRange ? '0.26' : '0.1');
      } else {
        const h = Math.max(4, Math.round((day.totalCommits / maxCommits) * MAX_BAR_H));
        rect.setAttribute('y', String(BASELINE_Y - h));
        rect.setAttribute('height', String(h));
        rect.setAttribute('fill', getThermalColor(day.totalCommits, maxCommits));
        rect.setAttribute('fill-opacity', inRange ? '0.95' : '0.22');
      }
    }
  }

  function positionTooltipAtIndex(idx) {
    const pct = ((idx + 0.5) / DAY_COUNT) * 100;
    const clampedPct = Math.max(12, Math.min(88, pct));
    tooltip.style.left = `${clampedPct.toFixed(2)}%`;
    tooltip.style.top = 'calc(100% + 6px)';
    tooltip.style.transform = 'translateX(-50%)';
  }

  function showDayTooltip(idx) {
    const day = days[idx];
    if (!day) return;
    ttDate.textContent = day.date;
    ttCommits.textContent = `${day.totalCommits} ${day.totalCommits === 1 ? 'COMMIT' : 'COMMITS'}`;
    ttSlugs.textContent = formatSlugSummary(day.activeRepoSlugs);
    tooltip.hidden = false;
    positionTooltipAtIndex(idx);

    hoverCursor.setAttribute('x', String(idx * 4 + 0.5));
    hoverCursor.style.display = '';
  }

  function showRangeTooltip(range) {
    const payload = buildWindowPayload(days, range);
    if (!payload) return;
    const midIdx = Math.round((range[0] + range[1]) / 2);
    ttDate.textContent =
      payload.startDate === payload.endDate
        ? payload.startDate
        : `${payload.startDate} .. ${payload.endDate}`;
    ttCommits.textContent = `${payload.totalCommits} ${payload.totalCommits === 1 ? 'COMMIT' : 'COMMITS'}`;
    ttSlugs.textContent = formatSlugSummary(payload.slugs);
    tooltip.hidden = false;
    positionTooltipAtIndex(midIdx);

    hoverCursor.setAttribute('x', String(range[1] * 4 + 0.5));
    hoverCursor.style.display = '';
  }

  function hideTooltip() {
    tooltip.hidden = true;
    hoverCursor.style.display = 'none';
  }

  function clientXToIndex(clientX) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(DAY_COUNT - 1, Math.floor(ratio * DAY_COUNT)));
  }

  function handlePointerDown(e) {
    if (e.button !== 0) return;
    const idx = clientXToIndex(e.clientX);
    isDragging = true;
    anchorIdx = idx;
    dragIdx = idx;
    focusIdx = idx;
    if (svg.setPointerCapture) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic events without active pointerId.
      }
    }
    const preview = [idx, idx];
    renderBars(preview);
    showDayTooltip(idx);
    onTickSound?.();
  }

  function handlePointerMove(e) {
    const idx = clientXToIndex(e.clientX);
    if (isDragging) {
      if (idx !== dragIdx) {
        dragIdx = idx;
        focusIdx = idx;
        onTickSound?.();
      }
      const preview = [Math.min(anchorIdx, dragIdx), Math.max(anchorIdx, dragIdx)];
      renderBars(preview);
      if (preview[0] === preview[1]) showDayTooltip(preview[0]);
      else showRangeTooltip(preview);
      return;
    }

    if (idx !== lastHoverIdx) {
      lastHoverIdx = idx;
      focusIdx = idx;
      onTickSound?.();
      onHoverDay?.(days[idx]);
    }
    showDayTooltip(idx);
  }

  function commitRange(range) {
    const [startIdx, endIdx] = range;
    const isSameSingleDay =
      startIdx === endIdx &&
      lockedRange !== null &&
      lockedRange[0] === startIdx &&
      lockedRange[1] === endIdx;

    if (isSameSingleDay) {
      lockedRange = null;
      renderBars(null);
      onSelectWindow?.(null);
      return;
    }

    lockedRange = [startIdx, endIdx];
    renderBars(null);
    onSelectWindow?.(buildWindowPayload(days, lockedRange));
  }

  function handlePointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    if (svg.releasePointerCapture) {
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic events.
      }
    }
    if (e.type === 'pointercancel') {
      renderBars(null);
      hideTooltip();
      return;
    }
    const finalRange = [Math.min(anchorIdx, dragIdx), Math.max(anchorIdx, dragIdx)];
    commitRange(finalRange);
  }

  function handlePointerLeave() {
    if (isDragging) return;
    lastHoverIdx = -1;
    hideTooltip();
    onHoverDay?.(null);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      const nextIdx = Math.max(0, Math.min(DAY_COUNT - 1, focusIdx + delta));
      if (nextIdx !== focusIdx) {
        if (e.shiftKey) {
          const base = lockedRange ? lockedRange[0] : focusIdx;
          const range = [Math.min(base, nextIdx), Math.max(base, nextIdx)];
          lockedRange = range;
          renderBars(null);
          showRangeTooltip(range);
          onSelectWindow?.(buildWindowPayload(days, range));
        } else {
          showDayTooltip(nextIdx);
          onHoverDay?.(days[nextIdx]);
        }
        focusIdx = nextIdx;
        onTickSound?.();
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTickSound?.();
      commitRange([focusIdx, focusIdx]);
      return;
    }

    if (e.key === 'Escape') {
      if (lockedRange !== null) {
        e.preventDefault();
        lockedRange = null;
        renderBars(null);
        hideTooltip();
        onSelectWindow?.(null);
        onHoverDay?.(null);
      }
    }
  }

  function handleBlur() {
    if (!isDragging) {
      hideTooltip();
      onHoverDay?.(null);
    }
  }

  svg.addEventListener('pointerdown', handlePointerDown);
  svg.addEventListener('pointermove', handlePointerMove);
  svg.addEventListener('pointerup', handlePointerUp);
  svg.addEventListener('pointercancel', handlePointerUp);
  svg.addEventListener('pointerleave', handlePointerLeave);
  svg.addEventListener('keydown', handleKeyDown);
  svg.addEventListener('blur', handleBlur);

  renderBars(null);

  return {
    update(next = {}) {
      if (!next || typeof next !== 'object') return;
      if ('days90' in next) {
        days = normalizeDays90(next.days90);
      }
      if ('activeWindow' in next) {
        lockedRange = resolveWindowRange(next.activeWindow, days);
      }
      renderBars(null);
    },
    destroy() {
      svg.removeEventListener('pointerdown', handlePointerDown);
      svg.removeEventListener('pointermove', handlePointerMove);
      svg.removeEventListener('pointerup', handlePointerUp);
      svg.removeEventListener('pointercancel', handlePointerUp);
      svg.removeEventListener('pointerleave', handlePointerLeave);
      svg.removeEventListener('keydown', handleKeyDown);
      svg.removeEventListener('blur', handleBlur);
      containerEl.replaceChildren();
    },
  };
}
