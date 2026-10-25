import { hierarchy, tree } from 'd3-hierarchy';
import { rankById } from '../../config/plan.ts';
import type { RankId } from '../../config/plan.ts';
import type { NodeSummary } from '../../engine/team.ts';
import type { PartnerNode } from '../../engine/types.ts';
import { money, t } from '../../i18n/index.ts';
import { esc, icon } from '../dom.ts';

const W = 176; // node card size
const H = 74;
const GAP_X = 20;
const GAP_Y = 46;
const PAD = 12;

interface Item { id: string; name: string; rank: RankId; volume: number; below: number; root?: boolean; children: Item[] }

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The organization as a top-down tree: you at the top, each Partner as a card with their
 * computed rank and team volume. Clicking a Partner card edits it (data-edit carries the id).
 */
export function structureSvg(team: PartnerNode[], sums: Map<string, NodeSummary>, you: { rank: RankId; volume: number }): string {
  const toItem = (n: PartnerNode): Item => {
    const s = sums.get(n.id)!;
    return { id: n.id, name: n.name, rank: s.rank, volume: s.teamActivation + s.teamRecurring, below: s.size, children: n.children.map(toItem) };
  };
  const rootItem: Item = { id: 'you', name: t('team.you'), rank: you.rank, volume: you.volume, below: 0, root: true, children: team.map(toItem) };
  const root = tree<Item>().nodeSize([W + GAP_X, H + GAP_Y])(hierarchy(rootItem, (d) => d.children));

  const nodes = root.descendants();
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x));
  const maxY = Math.max(...nodes.map((n) => n.y));
  const width = maxX - minX + W + PAD * 2;
  const height = maxY + H + PAD * 2;
  // d3 gives each card's centre; shift so the leftmost card's left edge sits at PAD.
  const ox = (x: number) => x - minX + PAD + W / 2; // card centre x
  const oy = (y: number) => y + PAD; // card top y

  const links = root.links().map(({ source, target }) => {
    const x1 = ox(source.x), y1 = oy(source.y) + H, x2 = ox(target.x), y2 = oy(target.y);
    const ym = y1 + GAP_Y / 2;
    return `<path d="M${x1} ${y1}V${ym}H${x2}V${y2}" fill="none" stroke="var(--line-strong)" stroke-width="1.5"/>`;
  }).join('');

  const cards = nodes.map((n) => {
    const d = n.data;
    const x = ox(n.x) - W / 2, y = oy(n.y);
    const rank = d.rank === 'none' ? t('rank.none') : rankById(d.rank).short;
    const label = d.root ? esc(d.name) : esc(short(d.name, 20));
    return `<g class="tree-node${d.root ? ' is-root' : ''}" ${d.root ? '' : `data-edit="${esc(d.id)}" tabindex="0" role="button" aria-label="${esc(t('team.edit'))}: ${esc(d.name)}"`} transform="translate(${x} ${y})">
      <rect width="${W}" height="${H}" rx="14"/>
      <text x="14" y="25" class="tree-name">${label}</text>
      <text x="14" y="46" class="tree-rank">${esc(rank)}</text>
      <text x="14" y="63" class="tree-meta">${esc(money(d.volume))}${d.below ? ` · ${esc(t('team.below', { n: d.below }))}` : ''}</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(t('team.structureTitle'))}">${links}${cards}</svg>`;
}

/**
 * Full-screen view of the structure with pan (drag) and zoom (wheel, buttons, fit).
 * It opens fitted to the screen. Clicking a Partner card calls `onEdit`; the tree is
 * redrawn afterwards with `render`, keeping the current zoom and position.
 */
export function openStructure(render: () => string, onEdit: (id: string) => Promise<void>): void {
  const d = document.createElement('dialog');
  d.className = 'structure-dialog';
  d.setAttribute('aria-label', t('team.structureTitle'));
  d.innerHTML = `
    <div class="structure-bar">
      <h2>${esc(t('team.structureTitle'))}</h2>
      <p class="hint hidden sm:block">${esc(t('team.structureHint'))}</p>
      <div class="ml-auto flex items-center gap-1.5">
        <button type="button" class="btn btn-sm icon-btn" data-zoom="out" aria-label="${esc(t('team.zoomOut'))}">${icon('minus', 16)}</button>
        <button type="button" class="btn btn-sm" data-zoom="fit">${esc(t('team.zoomFit'))}</button>
        <button type="button" class="btn btn-sm icon-btn" data-zoom="in" aria-label="${esc(t('team.zoomIn'))}">${icon('plus', 16)}</button>
        <button type="button" class="btn btn-sm btn-primary ml-2" data-close>${icon('x', 16)}${esc(t('disclaimer.close'))}</button>
      </div>
    </div>
    <div class="structure-viewport"><div class="structure-canvas">${render()}</div></div>`;
  document.body.appendChild(d);

  const viewport = d.querySelector<HTMLElement>('.structure-viewport')!;
  const canvas = d.querySelector<HTMLElement>('.structure-canvas')!;
  let scale = 1, x = 0, y = 0;
  const apply = () => { canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };
  const size = () => {
    const svg = canvas.querySelector('svg')!;
    return { w: Number(svg.getAttribute('width')), h: Number(svg.getAttribute('height')) };
  };
  const fit = () => {
    const { w, h } = size();
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    scale = Math.min(1, (vw - 32) / w, (vh - 32) / h);
    x = (vw - w * scale) / 2;
    y = Math.max(16, (vh - h * scale) / 2);
    apply();
  };
  /** Zoom by `k` around a point of the viewport (default: its centre). */
  const zoom = (k: number, px = viewport.clientWidth / 2, py = viewport.clientHeight / 2) => {
    const next = Math.min(2.5, Math.max(0.15, scale * k));
    x = px - ((px - x) * next) / scale;
    y = py - ((py - y) * next) / scale;
    scale = next;
    apply();
  };

  // Drag to pan. A drag that moved isn't a click, so it doesn't open a Partner.
  let drag: { sx: number; sy: number; x: number; y: number; moved: boolean } | null = null;
  viewport.addEventListener('pointerdown', (e) => {
    drag = { sx: e.clientX, sy: e.clientY, x, y, moved: false };
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; viewport.classList.add('is-dragging'); }
    if (drag.moved) { x = drag.x + dx; y = drag.y + dy; apply(); }
  });
  const endDrag = async (e: PointerEvent) => {
    if (!drag) return;
    const wasClick = !drag.moved;
    drag = null;
    viewport.classList.remove('is-dragging');
    if (!wasClick) return;
    const card = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest<SVGGElement>('[data-edit]');
    if (card) await edit(card.dataset.edit!);
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', () => { drag = null; viewport.classList.remove('is-dragging'); });
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  const edit = async (id: string) => {
    await onEdit(id);
    canvas.innerHTML = render();
    apply();
  };
  d.addEventListener('keydown', async (e) => {
    const card = (e.target as Element).closest<SVGGElement>('[data-edit]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); await edit(card.dataset.edit!); }
  });
  d.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-zoom], [data-close]');
    if (!b) return;
    if (b.dataset.close !== undefined) d.close();
    else if (b.dataset.zoom === 'fit') fit();
    else zoom(b.dataset.zoom === 'in' ? 1.25 : 0.8);
  });
  d.addEventListener('close', () => d.remove());
  d.showModal();
  fit();
}
