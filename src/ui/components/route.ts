import { RANKS, rankIndex } from '../../config/plan.ts';
import type { RankId } from '../../config/plan.ts';
import { t } from '../../i18n/index.ts';
import { esc } from '../dom.ts';

/**
 * The rank ladder drawn as a voyage route: every rank is a port on a wave-shaped line.
 * Ports already reached are solid, the current one carries the orange marker,
 * the rest of the route is dashed.
 */
export function rankRoute(current: RankId, next: RankId | null): string {
  const W = 1000, H = 140;
  const n = RANKS.length;
  const pts = RANKS.map((_, i) => ({
    x: 44 + ((W - 88) * i) / (n - 1),
    y: 72 + Math.sin(i * 0.95 + 0.4) * 24,
  }));
  const cur = Math.max(0, rankIndex(current));
  const curve = (from: number, to: number) => {
    let d = `M${pts[from].x},${pts[from].y}`;
    for (let i = from; i < to; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
    }
    return d;
  };
  const nextIdx = next ? rankIndex(next) : -1;
  const ports = RANKS.map((r, i) => {
    const p = pts[i];
    const passed = i < cur;
    const here = i === cur;
    const label = i === 0 ? t('rank.none') : r.short;
    const below = p.y + 32;
    if (here) {
      return `<g>
        <title>${esc(i === 0 ? t('rank.none') : r.name)}</title>
        <circle cx="${p.x}" cy="${p.y}" r="18" fill="var(--accent)" opacity="0.18"/>
        <circle cx="${p.x}" cy="${p.y}" r="10" fill="var(--accent)" stroke="var(--surface)" stroke-width="3"/>
        <text x="${p.x}" y="${p.y - 28}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--accent-ink)">${esc(t('dash.youAreHere'))}</text>
        <text x="${p.x}" y="${below}" text-anchor="middle" font-size="14" font-weight="700" font-family="var(--font-display)" fill="var(--ink)">${esc(label)}</text>
      </g>`;
    }
    const isNext = i === nextIdx;
    return `<g>
      <title>${esc(i === 0 ? t('rank.none') : `${r.name} — QP $${r.qp.toLocaleString('en-US')}`)}</title>
      <circle cx="${p.x}" cy="${p.y}" r="${isNext ? 8 : 6}" fill="${passed ? 'var(--brand)' : 'var(--surface)'}" stroke="${passed || isNext ? 'var(--brand)' : 'var(--line-strong)'}" stroke-width="${isNext ? 3 : 2}"/>
      <text x="${p.x}" y="${below}" text-anchor="middle" font-size="13" font-weight="${isNext ? 700 : 500}" fill="${passed || isNext ? 'var(--ink-2)' : 'var(--muted)'}">${esc(label)}</text>
    </g>`;
  }).join('');
  return `<div class="route-scroll" tabindex="0" aria-label="${esc(t('dash.route'))}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('dash.route'))}: ${esc(cur === 0 ? t('rank.none') : RANKS[cur].name)}">
      ${cur < n - 1 ? `<path d="${curve(cur, n - 1)}" fill="none" stroke="var(--line-strong)" stroke-width="2" stroke-dasharray="4 6"/>` : ''}
      ${cur > 0 ? `<path d="${curve(0, cur)}" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linecap="round"/>` : ''}
      ${ports}
    </svg>
  </div>`;
}
