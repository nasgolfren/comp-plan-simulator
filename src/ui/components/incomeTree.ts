import { hierarchy, tree } from 'd3-hierarchy';
import { MEMBER_PLANS, rankById } from '../../config/plan.ts';
import type { RankId } from '../../config/plan.ts';
import type { IncomeBreakdown } from '../../engine/breakdown.ts';
import type { NodeSummary } from '../../engine/team.ts';
import type { PartnerNode, PlanCounts } from '../../engine/types.ts';
import { money, t } from '../../i18n/index.ts';
import { esc } from '../dom.ts';

const W = 236; // card size
const H = 104;
const GAP_X = 22;
const GAP_Y = 52;
const PAD = 12;

type Kind = 'you' | 'own' | 'leg' | 'partner';
interface Card {
  id: string;
  kind: Kind;
  title: string;
  /** Big number on the card. */
  amount: string;
  /** Up to two small lines under it. */
  lines: string[];
  warn?: string;
  editId?: string;
  children: Card[];
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const rankLabel = (r: RankId) => (r === 'none' ? '' : ` · ${rankById(r).short}`);
/** "3 Classic + 1 Premium · $1,100", or '' when there are none. */
const countsLine = (c: PlanCounts, volume: string) => {
  const items = MEMBER_PLANS.filter((p) => c[p] > 0).map((p) => `${c[p]} ${t(`plans.${p}`)}`);
  return items.length ? `${items.join(' + ')} · ${volume}` : '';
};

/** "DAB $90 · MAB $60", leaving out parts that are $0. */
const parts = (items: [string, number][]) => items.filter(([, v]) => v > 0.004).map(([k, v]) => `${k} ${money(v)}`).join(' · ');

/**
 * Your income as a tree: you at the top with the rank bonuses, then your own activations, your
 * own paying members and each direct team with what it brings you. Partners deeper in a team
 * show their production, since their part reaches you through the team.
 */
export function incomeTreeSvg(b: IncomeBreakdown, team: PartnerNode[], sums: Map<string, NodeSummary>): string {
  const r = b.result;
  const per = t('common.perMonth');
  const partnerCard = (n: PartnerNode): Card => {
    const s = sums.get(n.id)!;
    return {
      id: n.id, kind: 'partner', editId: n.id,
      title: `${short(n.name, 18)}${rankLabel(s.rank)}`,
      amount: money(s.teamActivation + s.teamRecurring),
      lines: [t('income.production')], children: n.children.map(partnerCard),
    };
  };
  const legCards = b.legs.map((l): Card => {
    const n = team.find((x) => x.id === l.id)!;
    const s = sums.get(l.id)!;
    return {
      id: l.id, kind: 'leg', editId: l.id,
      title: `${short(n.name, 18)}${rankLabel(s.rank)}`,
      amount: `${money(l.total)} ${per}`,
      lines: [parts([[t('cal.short.matching'), l.matching], [t('cal.short.recurring'), l.recurring], [t('cal.short.bbb'), l.bbb]]) || t('income.nothingYet'),
        t('income.legProduction', { amount: money(l.production) })],
      warn: l.recurringOverLimit > 0 ? t('income.overLimit', { amount: money(l.recurringOverLimit) }) : undefined,
      children: n.children.map(partnerCard),
    };
  });
  const root: Card = {
    id: 'you', kind: 'you', title: t('team.you') + rankLabel(r.qpRank === 'none' ? 'none' : r.paidRank),
    amount: `${money(r.gross)} ${per}`,
    lines: [parts([[t('cal.short.tlb'), b.rank.tlb], [t('cal.short.fastStart'), b.rank.fastStart]]) || t('income.noRankBonus'),
      t('income.netLine', { net: money(r.net) })],
    children: [
      { id: 'own', kind: 'own', title: t('income.ownActivations'), amount: `${money(b.activations.total)} ${per}`,
        lines: [
          countsLine(b.activations.counts, money(b.activations.volume)) || t('income.noneYet'),
          parts([[t('cal.short.dab'), b.activations.dab], [t('cal.short.mab'), b.activations.mab], [t('cal.short.bbb'), b.activations.bbb]]) || t('income.nothingYet'),
        ], children: [] },
      { id: 'paying', kind: 'own', title: t('income.ownPaying'), amount: `${money(b.paying.total)} ${per}`,
        lines: [
          countsLine(b.paying.counts, `${money(b.paying.volume)} ${per}`) || t('income.noneYet'),
          // Recurring Income is for rank leaders only, so say why paying members bring nothing yet.
          b.paying.total > 0 ? `${t('cal.short.recurring')} ${money(b.paying.recurring)}` : b.paying.volume > 0 && r.qpRank === 'none' ? t('income.recurringFromMd') : t('income.nothingYet'),
        ], children: [] },
      ...legCards,
    ],
  };

  const layout = tree<Card>().nodeSize([W + GAP_X, H + GAP_Y])(hierarchy(root, (d) => d.children));
  const nodes = layout.descendants();
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x));
  const maxY = Math.max(...nodes.map((n) => n.y));
  const width = maxX - minX + W + PAD * 2;
  const height = maxY + H + PAD * 2;
  const cx = (x: number) => x - minX + PAD + W / 2;
  const top = (y: number) => y + PAD;

  const links = layout.links().map(({ source, target }) => {
    const x1 = cx(source.x), y1 = top(source.y) + H, x2 = cx(target.x), y2 = top(target.y);
    return `<path d="M${x1} ${y1}V${y1 + GAP_Y / 2}H${x2}V${y2}" fill="none" stroke="var(--line-strong)" stroke-width="1.5"/>`;
  }).join('');

  const cards = nodes.map((n) => {
    const c = n.data;
    const x = cx(n.x) - W / 2, y = top(n.y);
    const lines = c.lines.slice(0, 2).map((l, i) => `<text x="14" y="${68 + i * 15}" class="tree-meta">${esc(short(l, 38))}</text>`).join('');
    return `<g class="tree-node income-${c.kind}" ${c.editId ? `data-edit="${esc(c.editId)}" tabindex="0" role="button" aria-label="${esc(t('team.edit'))}: ${esc(c.title)}"` : ''} transform="translate(${x} ${y})">
      <rect width="${W}" height="${H}" rx="14"/>
      <text x="14" y="23" class="tree-name">${esc(c.title)}</text>
      <text x="14" y="48" class="tree-amount">${esc(c.amount)}</text>
      ${lines}
      ${c.warn ? `<text x="${W - 12}" y="23" text-anchor="end" class="tree-warn">⚠<title>${esc(c.warn)}</title></text>` : ''}
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(t('income.treeTitle'))}">${links}${cards}</svg>`;
}
