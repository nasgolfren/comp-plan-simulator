import { RANKS, WEEKLY_MATCHING, rankById } from '../../config/plan.ts';
import { weeklyMatchingBonus } from '../../engine/calc.ts';
import { money, t } from '../../i18n/index.ts';
import { getState, newLeg, update, uid } from '../../state/store.ts';
import { esc, icon, toast } from '../dom.ts';
import { money$, numField, numInput, pct, planTrio, selectField, textInput, toggle } from '../fields.ts';
import { footnote } from '../components/disclaimer.ts';
import { costsAndNet, currentMonth, incomeLines, noteHtml, productionTable, rankName } from '../components/results.ts';
import type { View } from './view.ts';

// The one-week matching checker is a scratch tool, kept in memory only.
const week = { personal: 0, directs: [{ production: 0, dab: 0, mab: 0 }, { production: 0, dab: 0, mab: 0 }] };

function legsSection(): string {
  const legs = getState().month.legs;
  const rankOpts = RANKS.map((r) => ({ value: r.id, label: r.id === 'none' ? t('rank.none') : r.name }));
  return `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-1">
      <div><h2>${esc(t('calc.teams'))}</h2><p class="hint mt-0.5">${esc(t('calc.teamsHint'))}</p></div>
      <button type="button" class="btn btn-sm" data-action="add-leg">${icon('plus', 15)}${esc(t('calc.addTeam'))}</button>
    </div>
    ${legs.length === 0 ? `<p class="panel-quiet mt-3 text-sm text-ink-2">${esc(t('calc.noTeams'))}</p>` : ''}
    <div class="grid gap-3 mt-3">
      ${legs.map((l, i) => `
        <fieldset class="panel-quiet grid gap-3">
          <legend class="sr-only">${esc(l.label)}</legend>
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex-1 min-w-[9rem]">${textInput(`month.legs.${i}.label`, t('leg.name'))}</div>
            <span class="pill pill-warn hidden" data-capped="${l.id}">${icon('alert', 12)}${esc(t('leg.capped'))}</span>
            <button type="button" class="btn btn-ghost btn-sm icon-btn btn-danger" data-action="remove-leg" data-id="${l.id}" aria-label="${esc(t('leg.remove'))}: ${esc(l.label)}">${icon('trash', 16)}</button>
          </div>
          <div class="grid gap-3 sm:grid-cols-3 items-end">
            ${selectField(t('leg.rank'), `month.legs.${i}.rank`, rankOpts)}
            ${numField(t('leg.other'), `month.legs.${i}.otherActivationVolume`, money$)}
            ${numField(t('leg.recurring'), `month.legs.${i}.recurringVolume`, money$)}
          </div>
          <div><p class="field-label mb-1.5">${esc(t('leg.head'))}</p>${planTrio(`month.legs.${i}.headActivations`)}</div>
        </fieldset>`).join('')}
    </div>`;
}

function qualitySection(): string {
  const m = getState().month;
  const auto = m.matchingWeeks === 'auto';
  return `
    <h2 class="mb-3">${esc(t('calc.quality'))}</h2>
    <div class="grid gap-4 sm:grid-cols-2">
      ${numField(t('calc.newShare'), 'month.newMemberShare', { ...pct, hint: t('calc.newShareHint') })}
      ${numField(t('calc.qbi'), 'month.qbi', { ...pct, hint: t('calc.qbiHint') })}
    </div>
    <div class="mt-4 grid gap-2">
      <p class="field-label">${esc(t('calc.matching'))}</p>
      <div class="seg w-full sm:w-auto [&>button]:flex-1" role="group" aria-label="${esc(t('calc.matching'))}">
        <button type="button" data-action="matching-auto" aria-pressed="${auto}">${esc(t('calc.matchingAuto'))}</button>
        <button type="button" data-action="matching-manual" aria-pressed="${!auto}">${esc(t('calc.matchingManual'))}</button>
      </div>
      ${auto ? '' : `<div class="max-w-40">${numInput('month.matchingWeeks', pct)}</div>`}
    </div>
    <div class="mt-4">${toggle(t('calc.longWindow'), 'month.minActivationsLongWindow')}</div>`;
}

function resultsPanel(): string {
  const r = currentMonth();
  return `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="eyebrow">${esc(t('calc.rank'))}</p>
        <p class="font-display text-2xl font-bold text-brand-ink leading-tight">${esc(rankName(r.qpRank === 'none' ? 'none' : r.paidRank))}</p>
        ${r.qpRank !== 'none' && r.qpRank !== r.paidRank ? `<p class="hint">${esc(t('calc.qpRankNote', { rank: rankById(r.qpRank).name }))}</p>` : ''}
      </div>
      ${r.qpRank !== 'none' ? `<span class="pill ${r.tlbStatus === 'full' ? 'pill-good' : r.tlbStatus === 'partial' ? 'pill-warn' : 'pill-muted'}">${esc(t(`tlb.${r.tlbStatus}`))}</span>` : ''}
    </div>
    ${r.notes.length ? `<div class="grid gap-2 mt-4">${r.notes.map(noteHtml).join('')}</div>` : ''}
    <div class="mt-4">${incomeLines(r)}</div>
    ${costsAndNet(r)}
    <details class="mt-4">
      <summary class="cursor-pointer text-sm font-semibold text-brand-ink">${esc(t('calc.production'))}</summary>
      <div class="mt-2">${productionTable(r)}</div>
    </details>
    <div class="flex flex-wrap items-center justify-between gap-3 mt-5">
      ${footnote()}
      <button type="button" class="btn btn-sm" data-action="save-scenario">${icon('save', 15)}${esc(t('calc.saveScenario'))}</button>
    </div>`;
}

function weeklySection(): string {
  return `
    <h2>${esc(t('weekly.title'))}</h2>
    <p class="hint mt-0.5 mb-4">${esc(t('weekly.intro'))}</p>
    <div class="grid gap-4">
      <div class="field max-w-72"><label for="wk-personal">${esc(t('weekly.personal'))}</label>
        <div class="input-wrap"><span class="affix">$</span><input id="wk-personal" type="number" min="0" step="50" inputmode="decimal" data-week="personal" value="${week.personal}"></div></div>
      ${week.directs.map((d, i) => `
        <fieldset class="panel-quiet">
          <legend class="field-label px-1">${esc(t('weekly.direct', { n: i + 1 }))}</legend>
          <div class="grid gap-3 grid-cols-3">
            ${(['production', 'dab', 'mab'] as const).map((k) => `<div class="field"><label for="wk-${i}-${k}" class="!font-medium">${esc(t(`weekly.${k}`))}</label>
              <div class="input-wrap"><span class="affix">$</span><input id="wk-${i}-${k}" type="number" min="0" step="10" inputmode="decimal" data-week="${i}.${k}" value="${d[k]}"></div></div>`).join('')}
          </div>
        </fieldset>`).join('')}
      <div><button type="button" class="btn btn-sm" data-action="week-add">${icon('plus', 15)}${esc(t('weekly.add'))}</button></div>
      <div id="week-result" aria-live="polite">${weeklyResult()}</div>
    </div>`;
}

function weeklyResult(): string {
  const team = week.directs.reduce((s, d) => s + d.production, 0);
  const r = weeklyMatchingBonus({ personalProduction: week.personal, directs: week.directs.map((d) => ({ production: d.production, dabPaid: d.dab, mabPaid: d.mab })) });
  return `<div class="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
      <span class="font-display font-bold">${esc(t('weekly.result'))}</span>
      <span class="font-display font-bold text-2xl num">${money(r.amount)}</span>
    </div>
    <p class="text-sm mt-1 ${r.qualified ? 'text-good' : 'text-ink-2'}">${esc(r.qualified
      ? t('weekly.ok', { personal: money(week.personal), team: money(team) })
      : t('weekly.no', { pMin: money(WEEKLY_MATCHING.personalMin), tMin: money(WEEKLY_MATCHING.teamMin), personal: money(week.personal), team: money(team) }))}</p>`;
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
      <section class="panel">
        <h2>${esc(t('calc.personal'))}</h2>
        <p class="hint mt-0.5 mb-3">${esc(t('calc.personalHint'))}</p>
        ${planTrio('month.personalActivations')}
        <h2 class="mt-6">${esc(t('calc.paying'))}</h2>
        <p class="hint mt-0.5 mb-3">${esc(t('calc.payingHint'))}</p>
        ${planTrio('month.personalPayingMembers')}
      </section>
      <section class="panel" id="calc-legs">${legsSection()}</section>
      <section class="panel" id="calc-quality">${qualitySection()}</section>
      <section class="panel" id="calc-weekly">${weeklySection()}</section>
    </div>
    <aside class="panel lg:sticky lg:top-20" aria-labelledby="calc-res-h" id="calc-results-wrap">
      <h2 id="calc-res-h" class="sr-only">${esc(t('calc.result'))}</h2>
      <div id="calc-results" aria-live="polite">${resultsPanel()}</div>
    </aside>
  </div>
  <div class="h-16 lg:hidden" aria-hidden="true"></div>
  <div id="calc-mini" class="lg:hidden fixed inset-x-0 z-20 bg-surface border-t border-line shadow-[0_-6px_20px_rgb(7_21_35/0.08)]" style="bottom:calc(56px + env(safe-area-inset-bottom))">${miniBar()}</div>`;
}

function refreshCapped(root: HTMLElement): void {
  const r = currentMonth();
  const capped = new Set(r.nextRank?.cappedLegIds ?? []);
  root.querySelectorAll<HTMLElement>('[data-capped]').forEach((el) => el.classList.toggle('hidden', !capped.has(el.dataset.capped!)));
}

export const calculatorView: View = {
  render: body,
  mount(root) {
    refreshCapped(root);
    root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'add-leg') {
        update((s) => { s.month.legs.push(newLeg(s.month.legs.length + 1)); }, 'legs');
        root.querySelector('#calc-legs')!.innerHTML = legsSection();
        refreshCapped(root);
        const inputs = root.querySelectorAll<HTMLInputElement>('#calc-legs input[data-kind="text"]');
        inputs[inputs.length - 1]?.focus();
      } else if (a === 'remove-leg') {
        update((s) => { s.month.legs = s.month.legs.filter((l) => l.id !== btn.dataset.id); }, 'legs');
        root.querySelector('#calc-legs')!.innerHTML = legsSection();
        refreshCapped(root);
      } else if (a === 'matching-auto' || a === 'matching-manual') {
        update((s) => { s.month.matchingWeeks = a === 'matching-auto' ? 'auto' : 1; }, 'month.matchingWeeks');
        root.querySelector('#calc-quality')!.innerHTML = qualitySection();
      } else if (a === 'week-add') {
        week.directs.push({ production: 0, dab: 0, mab: 0 });
        root.querySelector('#calc-weekly')!.innerHTML = weeklySection();
      } else if (a === 'see-result') {
        root.querySelector('#calc-results-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (a === 'save-scenario') {
        update((s) => {
          s.scenarios.push({
            id: uid(), name: t('scen.defaultName', { n: s.scenarios.length + 1 }), createdAt: new Date().toISOString(),
            month: structuredClone(s.month), sim: structuredClone(s.sim),
          });
        }, 'scenarios');
        toast(t('calc.saved'));
      }
    });
    root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const key = el.dataset.week;
      if (!key) return;
      const v = Math.max(0, Number(el.value) || 0);
      if (key === 'personal') week.personal = v;
      else {
        const [i, k] = key.split('.');
        week.directs[Number(i)][k as 'production' | 'dab' | 'mab'] = v;
      }
      root.querySelector('#week-result')!.innerHTML = weeklyResult();
    });
  },
  update(root, changed) {
    if (changed === 'scenarios') return;
    const res = root.querySelector<HTMLElement>('#calc-results');
    if (res) {
      // keep expanded explanations open while the user types
      const open = Array.from(res.querySelectorAll('details')).map((d) => d.open);
      res.innerHTML = resultsPanel();
      res.querySelectorAll('details').forEach((d, i) => { if (open[i]) d.open = true; });
    }
    refreshCapped(root);
    const mini = root.querySelector('#calc-mini');
    if (mini) mini.innerHTML = miniBar();
  },
};
