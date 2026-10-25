import { DAB, MEMBER_PLANS, PLAN_PRICES, rankById } from '../../config/plan.ts';
import type { MemberPlan } from '../../config/plan.ts';
import { inMonth, toIso } from '../../engine/activity.ts';
import { activationVolume, recurringVolume } from '../../engine/calc.ts';
import { allActivations, allPaying, findNode, flattenTeam, monthActivity, removeNode, summarizeTeam } from '../../engine/team.ts';
import type { ActivationKind, PartnerNode, PlanCounts } from '../../engine/types.ts';
import { locale, money, t } from '../../i18n/index.ts';
import { getPath, getState, newActivation, newPartner, setPath, update } from '../../state/store.ts';
import { confirmSheet, esc, icon, openSheet } from '../dom.ts';
import { footnote } from '../components/disclaimer.ts';
import { costsAndNet, currentMonth, incomeLines, isMembershipFreeNote, membershipFreeBox, noteHtml, productionTable, rankName } from '../components/results.ts';
import { openStructure, structureSvg } from '../components/structure.ts';
import type { View } from './view.ts';

// Partners collapsed in the table (memory only).
const collapsed = new Set<string>();

function structureNow(): string {
  const r = currentMonth();
  const team = getState().month.team;
  return structureSvg(team, summarizeTeam(team, PLAN_PRICES), { rank: r.qpRank === 'none' ? 'none' : r.paidRank, volume: r.production.tav + r.production.rqp });
}

const counts = (c: PlanCounts) => MEMBER_PLANS.map((p) => (c[p] ? `<span class="count ${p}">${c[p]}</span>` : '<span class="count zero">0</span>')).join('');

function stepper(path: string, label: string): string {
  const v = Number(getPath(path)) || 0;
  return `<div class="stepper">
    <button type="button" data-step="${path}" data-d="-1" aria-label="${esc(label)} −1">${icon('minus', 14)}</button>
    <input type="number" min="0" step="1" inputmode="numeric" data-path="${path}" data-kind="num" value="${v}" aria-label="${esc(label)}">
    <button type="button" data-step="${path}" data-d="1" aria-label="${esc(label)} +1">${icon('plus', 14)}</button>
  </div>`;
}

const KINDS: ActivationKind[] = ['new', 'upgrade', 'reactivation'];
const HISTORY_ROWS = ['months1to2', 'months3to5', 'months6to11'] as const;

/** A row of −/+ steppers for the three plans, with the row's dollar total at the end. */
function planRow(base: string, label: string, total: string, totalKey: string): string {
  return `<tr>
    <th scope="row">${esc(label)}</th>
    ${MEMBER_PLANS.map((p) => `<td>${stepper(`${base}.${p}`, `${label}: ${t(`plans.${p}`)}`)}</td>`).join('')}
    <td class="num font-semibold" data-total="${totalKey}">${total}</td>
  </tr>`;
}
const planHead = (last: string) =>
  `<thead><tr><th></th>${MEMBER_PLANS.map((p) => `<th><span class="plan-dot ${p}"></span> ${esc(t(`plans.${p}`))}</th>`).join('')}<th>${esc(last)}</th></tr></thead>`;

/** Your dated activations this month, plus read-only rows for direct Partner-Members who joined this month. */
function logSection(): string {
  const month = getState().month;
  const log = month.activationLog;
  const today = new Date();
  const min = toIso(new Date(today.getFullYear(), today.getMonth(), 1));
  const max = toIso(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const fromPartners = allActivations(month, today).filter((e) => e.id.startsWith('pm-'));
  const counted = [...log.filter((e) => inMonth(e, today)), ...fromPartners];
  const production = counted.reduce((s, e) => s + PLAN_PRICES.activation[e.plan], 0);
  const dab = counted.reduce((s, e) => s + DAB[e.plan], 0);
  const dateFmt = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'numeric', year: 'numeric' });
  const sel = (path: string, value: string, opts: { v: string; label: string }[], label: string) =>
    `<div class="input-wrap !min-h-9"><select class="!h-9" data-path="${path}" data-kind="select" aria-label="${esc(label)}">${opts.map((o) => `<option value="${o.v}" ${o.v === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
  const addButton = (big: boolean) => `<button type="button" class="add-row${big ? ' is-big' : ''}" data-action="add-activation">${icon('plus', big ? 20 : 16)}${esc(t('calc.addActivation'))}</button>`;

  if (log.length === 0 && fromPartners.length === 0) return addButton(true);
  return `
    <div class="overflow-x-auto -mx-1 px-1">
      <table class="biz-table log-table">
        <thead><tr><th>${esc(t('calc.colDate'))}</th><th>${esc(t('calc.colPlan'))}</th><th>${esc(t('calc.colType'))}</th><th class="num">${esc(t('calc.colProduction'))}</th><th class="num">DAB</th><th><span class="sr-only">${esc(t('team.actions'))}</span></th></tr></thead>
        <tbody>${log.map((e, i) => {
          const ok = inMonth(e, today);
          return `<tr class="${ok ? '' : 'is-muted'}">
            <td><div class="input-wrap !min-h-9"><input class="!h-9" type="date" min="${min}" max="${max}" data-path="month.activationLog.${i}.date" data-kind="text" value="${esc(e.date)}" aria-label="${esc(t('calc.colDate'))}"></div>
              ${ok ? '' : `<span class="pill pill-warn mt-1">${icon('alert', 12)}${esc(t('calc.otherMonth'))}</span>`}</td>
            <td>${sel(`month.activationLog.${i}.plan`, e.plan, MEMBER_PLANS.map((p) => ({ v: p, label: t(`plans.${p}`) })), t('calc.colPlan'))}</td>
            <td>${sel(`month.activationLog.${i}.kind`, e.kind, KINDS.map((k) => ({ v: k, label: t(`calc.kind.${k}`) })), t('calc.colType'))}</td>
            <td class="num">${ok ? money(PLAN_PRICES.activation[e.plan]) : '—'}</td>
            <td class="num">${ok ? money(DAB[e.plan]) : '—'}</td>
            <td><span class="row-actions"><button type="button" class="btn btn-ghost btn-sm icon-btn btn-danger" data-action="remove-activation" data-id="${e.id}" aria-label="${esc(t('calc.removeActivation'))}">${icon('trash', 16)}</button></span></td>
          </tr>`;
        }).join('')}
        ${fromPartners.map((e) => {
          const partner = findNode(month.team, e.id.slice(3));
          return `<tr class="is-linked">
            <td class="text-ink-2 whitespace-nowrap">${esc(dateFmt.format(new Date(`${e.date}T00:00:00`)))}</td>
            <td class="font-semibold">${esc(t(`plans.${e.plan}`))}</td>
            <td><span class="pill pill-brand" title="${esc(t('calc.fromPartnerHint'))}">${icon('userPlus', 12)}${esc(t('calc.fromPartner', { name: partner?.name ?? '' }))}</span></td>
            <td class="num">${money(PLAN_PRICES.activation[e.plan])}</td>
            <td class="num">${money(DAB[e.plan])}</td>
            <td></td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><th scope="row" colspan="3">${esc(t('calc.activationsTotal', { n: counted.length }))} <span class="counts ml-2 align-middle">${counts(deriveCounts(counted))}</span></th>
          <td class="num">${money(production)}</td><td class="num">${money(dab)}</td><td></td></tr></tfoot>
      </table>
    </div>
    ${addButton(false)}`;
}

const deriveCounts = (entries: { plan: MemberPlan }[]): PlanCounts => {
  const c: PlanCounts = { starter: 0, classic: 0, premium: 0 };
  entries.forEach((e) => { c[e.plan] += 1; });
  return c;
};

/** What the calculation works out from your entries, shown so nothing is hidden. */
function derivedStrip(): string {
  const { activity: a } = monthActivity(getState().month, PLAN_PRICES);
  const r = currentMonth();
  const dateFmt = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'numeric' });
  const minMet = r.conditions.minActivations.met;
  const minRequired = r.conditions.minActivations.required;
  return `
    <p class="eyebrow mb-2">${esc(t('calc.derived'))}</p>
    <div class="flex flex-wrap gap-2">
      <span class="pill pill-muted">${esc(t('calc.dNew', { pct: Math.round(a.newShare * 100) }))}</span>
      <span class="pill pill-muted">${esc(t('calc.dQbi', { pct: Math.round(a.qbi * 100) }))}</span>
      <span class="pill ${!minRequired ? 'pill-muted' : minMet ? 'pill-good' : 'pill-bad'}">${esc(t(!minRequired ? 'calc.dMinNotRequired' : minMet ? 'calc.dMinMet' : 'calc.dMinNot'))}</span>
    </div>
    <div class="mt-3">
      <p class="text-sm text-ink-2">${esc(t('calc.dMatching', { n: a.weeks.filter((w) => w.qualifies).length, total: a.weeks.length }))}</p>
      <div class="flex flex-wrap gap-1.5 mt-1.5">${a.weeks.map((w) => `<span class="week-chip ${w.qualifies ? 'ok' : ''}" title="${esc(t('calc.weekDetail', { personal: money(w.personal), directs: money(w.directs) }))}">${w.qualifies ? icon('check', 12) : icon('x', 12)}${esc(dateFmt.format(w.start))}</span>`).join('')}</div>
      <p class="hint mt-1.5">${esc(t('calc.dMatchingHint'))}</p>
    </div>`;
}

/** Earlier months as plain numbers: Minimum Activations windows and QBI. */
function historySection(): string {
  const h = getState().month.history;
  const qbi = h.qbiNew > 0 ? Math.round(Math.min(1, h.qbiPaying / h.qbiNew) * 100) : 100;
  return `
    <p class="hint mb-3">${esc(t('hist.hint'))}</p>
    <div class="overflow-x-auto -mx-1 px-1">
      <table class="biz-table you-table">
        ${planHead(t('calc.colProduction'))}
        <tbody>${HISTORY_ROWS.map((k) => planRow(`month.history.${k}`, t(`hist.${k}`), money(activationVolume(h[k], PLAN_PRICES)), k)).join('')}</tbody>
      </table>
    </div>
    <div class="grid gap-4 sm:grid-cols-[1fr_1fr_auto] items-end mt-5">
      <div class="field"><span class="field-label">${esc(t('hist.qbiNew'))}</span>${stepper('month.history.qbiNew', t('hist.qbiNew'))}</div>
      <div class="field"><span class="field-label">${esc(t('hist.qbiPaying'))}</span>${stepper('month.history.qbiPaying', t('hist.qbiPaying'))}</div>
      <div><p class="eyebrow">QBI</p><p class="font-display text-2xl font-bold num" data-total="qbi">${qbi}%</p></div>
    </div>`;
}

/** Paying members you entered, plus your direct Partner-Members who joined before this month. */
function payingNote(): string {
  const m = getState().month;
  const linked = Object.values(allPaying(m)).reduce((a, b) => a + b, 0) - Object.values(m.personalPayingMembers).reduce((a, b) => a + b, 0);
  return linked > 0 ? `<p class="hint mt-2">${icon('userPlus', 12)} ${esc(t('calc.payingFromPartners', { n: linked }))}</p>` : '';
}

const payingTotal = () => `${money(recurringVolume(allPaying(getState().month), PLAN_PRICES))} ${t('common.perMonth')}`;

/** Your own Members: two separate cards (new this month / paying every month), then what's worked out. */
function youSection(): string {
  return `
    <div class="mb-4"><h2>${esc(t('calc.you'))}</h2><p class="hint mt-0.5">${esc(t('calc.youHint'))}</p></div>
    <div class="grid gap-4">
      <section class="sub-card" aria-labelledby="new-h">
        <div class="sub-card-head">
          <span class="sub-card-ic">${icon('plus', 16)}</span>
          <div><h3 id="new-h">${esc(t('calc.activations'))}</h3><p class="hint mt-0.5">${esc(t('calc.activationsHint'))}</p></div>
        </div>
        <div id="calc-log">${logSection()}</div>
      </section>
      <section class="sub-card" aria-labelledby="paying-h">
        <div class="sub-card-head">
          <span class="sub-card-ic">${icon('layers', 16)}</span>
          <div><h3 id="paying-h">${esc(t('calc.payingTitle'))}</h3><p class="hint mt-0.5">${esc(t('calc.payingHint'))}</p></div>
        </div>
        <div class="overflow-x-auto -mx-1 px-1">
          <table class="biz-table you-table">
            ${planHead(t('calc.colVolume'))}
            <tbody>${planRow('month.personalPayingMembers', t('calc.rowPaying'), payingTotal(), 'paying')}</tbody>
          </table>
        </div>
        <div id="calc-paying-note">${payingNote()}</div>
      </section>
    </div>
    <div id="calc-derived" class="mt-5 pt-4 border-t border-line">${derivedStrip()}</div>`;
}

/** Your organization as a tree table: one row per Partner, indented by level. */
function teamSection(): string {
  const s = getState();
  const team = s.month.team;
  const sums = summarizeTeam(team, PLAN_PRICES);
  const r = currentMonth();
  const capped = new Set(r.nextRank?.cappedLegIds ?? []);

  const rows: string[] = [];
  const walk = (nodes: PartnerNode[], level: number) => nodes.forEach((n) => {
    const sm = sums.get(n.id)!;
    const open = !collapsed.has(n.id);
    const leg = level === 0 ? `<span class="num">${money(sm.teamActivation + sm.teamRecurring)}</span>${capped.has(n.id) ? ` <span class="pill pill-warn !px-2" title="${esc(t('leg.capped'))}">${icon('alert', 12)}</span>` : ''}` : '<span class="text-muted">—</span>';
    rows.push(`<tr class="${level ? 'is-child' : ''}">
      <th scope="row"><span class="tree-cell" style="--lvl:${level}">
        ${n.children.length ? `<button type="button" class="tree-toggle" data-toggle="${n.id}" aria-expanded="${open}" aria-label="${esc(n.name)}">${icon('chevron', 14)}</button>` : '<span class="tree-toggle-spacer"></span>'}
        <span class="truncate">${esc(n.name)}</span>
        ${n.membership ? `<span class="pill pill-muted !px-2 !py-0.5 !text-[0.7rem]" title="${esc(t('team.isMember'))}"><span class="plan-dot ${n.membership.plan}"></span>${esc(t(`plans.${n.membership.plan}`))}</span>` : ''}
        ${sm.size ? `<span class="text-muted text-xs font-normal whitespace-nowrap">${esc(t('team.below', { n: sm.size }))}</span>` : ''}
      </span></th>
      <td><span class="pill ${sm.rank === 'none' ? 'pill-muted' : 'pill-brand'}">${esc(sm.rank === 'none' ? '—' : rankById(sm.rank).short)}</span></td>
      <td><span class="counts">${counts(sm.activations)}</span></td>
      <td><span class="counts">${counts(sm.paying)}</span></td>
      <td class="num">${money(sm.teamActivation)}</td>
      <td class="num">${money(sm.teamRecurring)}</td>
      <td class="whitespace-nowrap">${leg}</td>
      <td><span class="row-actions">
        <button type="button" class="btn btn-ghost btn-sm icon-btn" data-action="add-below" data-id="${n.id}" title="${esc(t('team.addBelow'))}" aria-label="${esc(t('team.addBelow'))}: ${esc(n.name)}">${icon('userPlus', 16)}</button>
        <button type="button" class="btn btn-ghost btn-sm icon-btn" data-action="edit" data-id="${n.id}" title="${esc(t('team.edit'))}" aria-label="${esc(t('team.edit'))}: ${esc(n.name)}">${icon('edit', 16)}</button>
        <button type="button" class="btn btn-ghost btn-sm icon-btn btn-danger" data-action="remove" data-id="${n.id}" title="${esc(t('team.remove'))}" aria-label="${esc(t('team.remove'))}: ${esc(n.name)}">${icon('trash', 16)}</button>
      </span></td>
    </tr>`);
    if (open) walk(n.children, level + 1);
  });
  walk(team, 0);

  const totalAct = team.reduce((a, n) => a + sums.get(n.id)!.teamActivation, 0);
  const totalRec = team.reduce((a, n) => a + sums.get(n.id)!.teamRecurring, 0);
  const people = team.reduce((a, n) => a + 1 + sums.get(n.id)!.size, 0);

  return `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
      <div><h2>${esc(t('team.title'))}</h2><p class="hint mt-0.5 max-w-[60ch]">${esc(t('team.hint'))}</p></div>
      ${team.length ? `<button type="button" class="btn btn-sm" data-action="structure">${icon('tree', 15)}${esc(t('team.showStructure'))}</button>` : ''}
    </div>
    ${team.length === 0 ? addPartner(true) : `
    <div class="overflow-x-auto -mx-1 px-1">
      <table class="biz-table team-table">
        <thead><tr>
          <th>${esc(t('team.colPartner'))}</th><th>${esc(t('team.colRank'))}</th>
          <th>${esc(t('team.colOwn'))}<span class="th-sub">S · C · P</span></th>
          <th>${esc(t('team.colPaying'))}<span class="th-sub">S · C · P</span></th>
          <th>${esc(t('team.colTeamVolume'))}</th><th>${esc(t('team.colMonthly'))}</th><th>${esc(t('team.colLeg'))}</th><th><span class="sr-only">${esc(t('team.actions'))}</span></th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
        <tfoot><tr>
          <th scope="row">${esc(t('team.total', { n: people }))}</th><td></td><td></td><td></td>
          <td class="num">${money(totalAct)}</td><td class="num">${money(totalRec)}</td><td></td><td></td>
        </tr></tfoot>
      </table>
    </div>
    ${addPartner(false)}`}`;
}

/** Same dashed "add" button as for activations: under the table, or big when the team is empty. */
const addPartner = (big: boolean) =>
  `<button type="button" class="add-row${big ? ' is-big' : ''}" data-action="add-direct">${icon('userPlus', big ? 20 : 16)}${esc(t('team.add'))}</button>`;

/** Add or edit a Partner in a dialog. `parentId` null = a direct Partner. */
async function partnerDialog(mode: { edit: PartnerNode } | { parentId: string | null }): Promise<void> {
  const s = getState();
  const editing = 'edit' in mode ? mode.edit : null;
  const parent = !editing && 'parentId' in mode && mode.parentId ? findNode(s.month.team, mode.parentId) : null;
  const count = flattenTeam(s.month.team).length;
  const draft: PartnerNode = editing ? structuredClone(editing) : newPartner(t('team.defaultName', { n: count + 1 }));
  const title = editing ? t('team.dialogEdit', { name: editing.name }) : parent ? t('team.dialogAddBelow', { name: parent.name }) : t('team.dialogAdd');

  const trio = (key: 'activations' | 'payingMembers') => `<div class="plan-trio">${MEMBER_PLANS.map((p) => `
    <div class="field"><label for="pd-${key}-${p}"><span class="plan-dot ${p}" aria-hidden="true"></span>${esc(t(`plans.${p}`))}</label>
      <div class="input-wrap"><input id="pd-${key}-${p}" type="number" min="0" step="1" inputmode="numeric" name="${key}.${p}" value="${draft[key][p]}"></div></div>`).join('')}</div>`;
  const money$In = (name: 'restActivationVolume' | 'restRecurringVolume', label: string) => `
    <div class="field"><label for="pd-${name}">${esc(label)}</label>
      <div class="input-wrap"><span class="affix">$</span><input id="pd-${name}" type="number" min="0" step="50" inputmode="decimal" name="${name}" value="${draft[name]}"></div></div>`;

  const mem = draft.membership;
  const sponsor = parent ? parent.name : editing ? t('team.theirSponsor') : t('team.you');
  const body = `<div class="grid gap-5">
    <div class="field"><label for="pd-name">${esc(t('team.name'))}</label>
      <div class="input-wrap"><input id="pd-name" type="text" name="name" value="${esc(draft.name)}" autocomplete="off"></div></div>
    <div class="panel-quiet grid gap-3">
      <label class="switch"><input type="checkbox" name="isMember" ${mem ? 'checked' : ''}><span>${esc(t('team.alsoMember'))}</span></label>
      <div class="grid gap-3 sm:grid-cols-2" data-member-fields ${mem ? '' : 'hidden'}>
        <div class="field"><label for="pd-mplan">${esc(t('team.memberPlan'))}</label>
          <div class="input-wrap"><select id="pd-mplan" name="memberPlan">${MEMBER_PLANS.map((p) => `<option value="${p}" ${(mem?.plan ?? 'premium') === p ? 'selected' : ''}>${esc(t(`plans.${p}`))}</option>`).join('')}</select></div></div>
        <div class="field"><label for="pd-msince">${esc(t('prof.memberSince'))}</label>
          <div class="input-wrap"><input id="pd-msince" type="date" name="memberSince" value="${esc(mem?.since ?? toIso(new Date()))}"></div></div>
      </div>
      <p class="hint">${esc(t('team.alsoMemberHint', { sponsor }))}</p>
    </div>
    <div><p class="field-label mb-1.5">${esc(t('team.ownActivations'))}</p>${trio('activations')}</div>
    <div><p class="field-label mb-1.5">${esc(t('team.payingMembers'))}</p>${trio('payingMembers')}</div>
    <details ${draft.restActivationVolume || draft.restRecurringVolume ? 'open' : ''}>
      <summary class="text-sm font-semibold text-brand-ink">${esc(t('team.rest'))}</summary>
      <p class="hint mt-1.5 mb-3">${esc(t('team.restHint'))}</p>
      <div class="grid gap-3 sm:grid-cols-2">${money$In('restActivationVolume', t('team.restActivation'))}${money$In('restRecurringVolume', t('team.restRecurring'))}</div>
    </details>
  </div>`;

  const read = (d: HTMLDialogElement) => {
    const val = (n: string) => d.querySelector<HTMLInputElement>(`[name="${n}"]`)!.value;
    const nonNeg = (n: string) => Math.max(0, Math.round(Number(val(n)) || 0));
    draft.name = val('name').trim() || draft.name;
    for (const p of MEMBER_PLANS) {
      draft.activations[p] = nonNeg(`activations.${p}`);
      draft.payingMembers[p] = nonNeg(`payingMembers.${p}`);
    }
    draft.restActivationVolume = nonNeg('restActivationVolume');
    draft.restRecurringVolume = nonNeg('restRecurringVolume');
    const isMember = d.querySelector<HTMLInputElement>('[name="isMember"]')!.checked;
    draft.membership = isMember ? { plan: val('memberPlan') as MemberPlan, since: val('memberSince') || toIso(new Date()) } : null;
  };

  const opened = openSheet({
    title, body,
    actions: [{ label: t('common.cancel'), value: 'cancel' }, { label: t('common.save'), value: 'save', kind: 'primary' }],
    onAction: (v, d) => { if (v === 'save') read(d); },
  });
  // The membership fields only show when "Also a Member" is on.
  const dlg = document.querySelector<HTMLDialogElement>('dialog.sheet[open]:last-of-type');
  dlg?.querySelector('[name="isMember"]')?.addEventListener('change', (e) => {
    dlg.querySelector<HTMLElement>('[data-member-fields]')!.hidden = !(e.target as HTMLInputElement).checked;
  });
  const choice = await opened;
  if (choice !== 'save') return;
  update((st) => {
    if (editing) Object.assign(findNode(st.month.team, editing.id)!, { ...draft, children: findNode(st.month.team, editing.id)!.children });
    else if (parent) { findNode(st.month.team, parent.id)!.children.push(draft); collapsed.delete(parent.id); }
    else st.month.team.push(draft);
  }, 'team');
}

function resultsPanel(): string {
  const r = currentMonth();
  const notes = r.notes.filter((n) => !isMembershipFreeNote(n)); // shown in its own box below
  return `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="eyebrow">${esc(t('calc.rank'))}</p>
        <p class="font-display text-2xl font-bold text-brand-ink leading-tight">${esc(rankName(r.qpRank === 'none' ? 'none' : r.paidRank))}</p>
        ${r.qpRank !== 'none' && r.qpRank !== r.paidRank ? `<p class="hint">${esc(t('calc.qpRankNote', { rank: rankById(r.qpRank).name }))}</p>` : ''}
      </div>
      ${r.qpRank !== 'none' ? `<span class="pill ${r.tlbStatus === 'full' ? 'pill-good' : r.tlbStatus === 'partial' ? 'pill-warn' : 'pill-muted'}">${esc(t(`tlb.${r.tlbStatus}`))}</span>` : ''}
    </div>
    ${notes.length ? `<div class="grid gap-2 mt-4">${notes.map(noteHtml).join('')}</div>` : ''}
    <div class="mt-4">${membershipFreeBox(r)}</div>
    <div class="mt-3">${incomeLines(r)}</div>
    ${costsAndNet(r)}
    <details class="mt-4">
      <summary class="cursor-pointer text-sm font-semibold text-brand-ink">${esc(t('calc.production'))}</summary>
      <div class="mt-2">${productionTable(r)}</div>
    </details>
    <div class="mt-5">${footnote()}</div>`;
}

function miniBar(): string {
  const r = currentMonth();
  return `<div class="flex items-center gap-3 px-4 py-2.5">
    <div class="min-w-0 flex-1">
      <p class="text-xs text-muted truncate">${esc(rankName(r.qpRank === 'none' ? 'none' : r.paidRank))}</p>
      <p class="font-display font-bold num ${r.net < 0 ? 'text-bad' : ''}">${esc(t('common.net'))}: ${money(r.net, { cents: true })}</p>
    </div>
    <button type="button" class="btn btn-sm btn-primary" data-action="see-result">${esc(t('calc.seeResult'))}</button>
  </div>`;
}

function body(): string {
  return `
  <header class="mb-6">
    <h1>${esc(t('calc.title'))}</h1>
    <p class="text-ink-2 mt-1">${esc(t('calc.intro'))}</p>
  </header>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px] items-start">
    <div class="grid grid-cols-1 gap-4 min-w-0">
      <section class="panel" id="calc-you">${youSection()}</section>
      <section class="panel" id="calc-team">${teamSection()}</section>
      <details class="panel fold">
        <summary><h2>${esc(t('hist.title'))}</h2>${icon('chevron', 18, 'chev')}</summary>
        <div id="calc-history" class="mt-3">${historySection()}</div>
      </details>
    </div>
    <aside class="panel lg:sticky lg:top-20" aria-labelledby="calc-res-h" id="calc-results-wrap">
      <h2 id="calc-res-h" class="sr-only">${esc(t('calc.result'))}</h2>
      <div id="calc-results" aria-live="polite">${resultsPanel()}</div>
    </aside>
  </div>
  <div class="h-16 lg:hidden" aria-hidden="true"></div>
  <div id="calc-mini" class="lg:hidden fixed inset-x-0 z-20 bg-surface border-t border-line shadow-[0_-6px_20px_rgb(7_21_35/0.08)]" style="bottom:calc(56px + env(safe-area-inset-bottom))">${miniBar()}</div>`;
}

function renderTeam(root: HTMLElement): void {
  const el = root.querySelector('#calc-team');
  if (el) el.innerHTML = teamSection();
}

export const calculatorView: View = {
  render: body,
  mount(root) {
    root.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const step = target.closest<HTMLElement>('[data-step]');
      if (step) {
        const path = step.dataset.step!;
        const next = Math.max(0, (Number(getPath(path)) || 0) + Number(step.dataset.d));
        setPath(path, next);
        const input = step.parentElement?.querySelector<HTMLInputElement>('input');
        if (input) input.value = String(next);
        return;
      }
      const toggleBtn = target.closest<HTMLElement>('[data-toggle]');
      if (toggleBtn) {
        const id = toggleBtn.dataset.toggle!;
        if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
        renderTeam(root);
        root.querySelector<HTMLElement>(`[data-toggle="${id}"]`)?.focus();
        return;
      }
      const btn = target.closest<HTMLElement>('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      const id = btn.dataset.id;
      if (a === 'add-direct') await partnerDialog({ parentId: null });
      else if (a === 'add-below' && id) await partnerDialog({ parentId: id });
      else if (a === 'edit' && id) {
        const n = findNode(getState().month.team, id);
        if (n) await partnerDialog({ edit: n });
      } else if (a === 'remove' && id) {
        const n = findNode(getState().month.team, id);
        if (!n) return;
        const below = summarizeTeam([n], PLAN_PRICES).get(n.id)!.size;
        const msg = below ? t('team.removeConfirmTree', { name: n.name, n: below }) : t('team.removeConfirm', { name: n.name });
        if (await confirmSheet(t('team.remove'), msg, t('team.remove'), t('common.cancel'), true)) {
          update((s) => { removeNode(s.month.team, id); }, 'team');
        }
      } else if (a === 'structure') {
        openStructure(structureNow, async (pid) => {
          const n = findNode(getState().month.team, pid);
          if (n) await partnerDialog({ edit: n });
        });
      } else if (a === 'add-activation') {
        update((s) => { s.month.activationLog.push(newActivation(toIso(new Date()))); }, 'log');
        const dates = root.querySelectorAll<HTMLInputElement>('#calc-log input[type="date"]');
        dates[dates.length - 1]?.focus();
      } else if (a === 'remove-activation' && id) {
        update((s) => { s.month.activationLog = s.month.activationLog.filter((x) => x.id !== id); }, 'log');
      } else if (a === 'see-result') {
        root.querySelector('#calc-results-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  },
  update(root, changed) {
    const res = root.querySelector<HTMLElement>('#calc-results');
    if (res) {
      // keep expanded explanations open while the user types
      const open = Array.from(res.querySelectorAll('details')).map((d) => d.open);
      res.innerHTML = resultsPanel();
      res.querySelectorAll('details').forEach((d, i) => { if (open[i]) d.open = true; });
    }
    const m = getState().month;
    // Partner-Members show up in your list too, so team edits refresh it as well.
    if (changed === 'log' || changed === 'team' || changed.startsWith('month.activationLog')) {
      // Re-render the list; selects and dates only fire on change, so put focus back where it was.
      const path = (document.activeElement as HTMLElement | null)?.dataset?.path;
      const log = root.querySelector('#calc-log');
      if (log) log.innerHTML = logSection();
      if (path) root.querySelector<HTMLElement>(`[data-path="${path}"]`)?.focus();
    }
    // Steppers: update the totals in place, so typing in a number box isn't interrupted.
    const paying = root.querySelector('[data-total="paying"]');
    if (paying) paying.textContent = payingTotal();
    const note = root.querySelector('#calc-paying-note');
    if (note) note.innerHTML = payingNote();
    HISTORY_ROWS.forEach((k) => {
      const cell = root.querySelector(`[data-total="${k}"]`);
      if (cell) cell.textContent = money(activationVolume(m.history[k], PLAN_PRICES));
    });
    const qbi = root.querySelector('[data-total="qbi"]');
    if (qbi) qbi.textContent = `${m.history.qbiNew > 0 ? Math.round(Math.min(1, m.history.qbiPaying / m.history.qbiNew) * 100) : 100}%`;
    const derived = root.querySelector('#calc-derived');
    if (derived) derived.innerHTML = derivedStrip();
    // Your volumes change your rank, and with it the per-team limit flags.
    if (changed === 'team' || !root.querySelector('#calc-team')?.contains(document.activeElement)) renderTeam(root);
    const mini = root.querySelector('#calc-mini');
    if (mini) mini.innerHTML = miniBar();
  },
};
