import { calcMonth } from '../../engine/calc.ts';
import { simulate } from '../../engine/simulate.ts';
import type { SimAssumptions } from '../../engine/simulate.ts';
import type { MonthInput } from '../../engine/types.ts';
import { locale, money, t } from '../../i18n/index.ts';
import { calcProfile, getState, resolvedPrices, shareLink, simOptions, uid, update } from '../../state/store.ts';
import { confirmSheet, esc, icon, toast } from '../dom.ts';
import { textInput } from '../fields.ts';
import { footnote } from '../components/disclaimer.ts';
import { rankName } from '../components/results.ts';
import type { View } from './view.ts';

function evaluate(month: MonthInput, sim: SimAssumptions) {
  const s = getState();
  const prices = resolvedPrices(s);
  const profile = calcProfile(s);
  const m = calcMonth(month, profile, prices);
  const run = simulate(sim, { ...profile, fastStartMonth: false }, prices, simOptions(s));
  const last = run[run.length - 1].result;
  return {
    calcNet: m.net,
    simNet: run.reduce((a, x) => a + x.result.net, 0),
    simLast: last.net,
    simRank: last.qpRank === 'none' ? 'none' : last.paidRank,
    months: run.length,
  };
}

function body(): string {
  const s = getState();
  const cols = [
    { name: t('goals.current'), ...evaluate(s.month, s.sim) },
    ...s.scenarios.map((sc) => ({ name: sc.name, ...evaluate(sc.month, sc.sim) })),
  ];
  const dateFmt = new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' });

  return `
  <header class="mb-6">
    <h1>${esc(t('scen.title'))}</h1>
    <p class="text-ink-2 mt-1 max-w-2xl">${esc(t('scen.intro'))}</p>
  </header>

  <section class="panel mb-4">
    <form class="flex flex-wrap items-end gap-3" data-form="save">
      <div class="field flex-1 min-w-52">
        <label for="scen-name">${esc(t('scen.name'))}</label>
        <div class="input-wrap"><input id="scen-name" type="text" maxlength="60" placeholder="${esc(t('scen.defaultName', { n: s.scenarios.length + 1 }))}"></div>
      </div>
      <button class="btn btn-primary" type="submit">${icon('save', 16)}${esc(t('scen.saveCurrent'))}</button>
    </form>
  </section>

  ${s.scenarios.length === 0 ? `<p class="panel-quiet text-ink-2 mb-4">${esc(t('scen.empty'))}</p>` : `
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 mb-4">
    ${s.scenarios.map((sc, i) => `
      <article class="panel grid gap-3">
        ${textInput(`scenarios.${i}.name`, t('scen.name'))}
        <p class="hint">${esc(t('scen.saved', { date: dateFmt.format(new Date(sc.createdAt)) }))}</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-primary" data-action="load" data-id="${sc.id}">${esc(t('scen.load'))}</button>
          <button type="button" class="btn btn-sm" data-action="share" data-id="${sc.id}">${icon('share', 14)}${esc(t('scen.share'))}</button>
          <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-id="${sc.id}" aria-label="${esc(t('common.delete'))}: ${esc(sc.name)}">${icon('trash', 14)}</button>
        </div>
      </article>`).join('')}
  </div>`}

  <section class="panel mb-4" aria-labelledby="cmp-h">
    <h2 id="cmp-h" class="mb-3">${esc(t('scen.compare'))}</h2>
    <div class="overflow-x-auto"><table class="data-table">
      <thead><tr><th></th>${cols.map((c) => `<th>${esc(c.name)}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><td>${esc(t('scen.calcNet'))}</td>${cols.map((c) => `<td>${money(c.calcNet)}</td>`).join('')}</tr>
        <tr><td>${esc(t('scen.simNet'))}</td>${cols.map((c) => `<td class="font-semibold">${money(c.simNet)} <span class="text-muted font-normal">· ${c.months}</span></td>`).join('')}</tr>
        <tr><td>${esc(t('scen.simLast'))}</td>${cols.map((c) => `<td>${money(c.simLast)}</td>`).join('')}</tr>
        <tr><td>${esc(t('scen.simRank'))}</td>${cols.map((c) => `<td>${esc(rankName(c.simRank, true))}</td>`).join('')}</tr>
      </tbody>
    </table></div>
  </section>
  ${footnote()}`;
}

export const scenariosView: View = {
  render: body,
  mount(root) {
    root.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = root.querySelector<HTMLInputElement>('#scen-name');
      update((s) => {
        s.scenarios.push({
          id: uid(), name: input?.value.trim() || t('scen.defaultName', { n: s.scenarios.length + 1 }),
          createdAt: new Date().toISOString(), month: structuredClone(s.month), sim: structuredClone(s.sim),
        });
      }, 'scenarios:list');
    });
    root.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn?.dataset.id) return;
      const sc = getState().scenarios.find((x) => x.id === btn.dataset.id);
      if (!sc) return;
      if (btn.dataset.action === 'load') {
        update((s) => { s.month = structuredClone(sc.month); s.sim = structuredClone(sc.sim); }, 'scenarios:list');
        toast(t('scen.loaded'));
      } else if (btn.dataset.action === 'share') {
        const link = shareLink(sc.name, sc.month, sc.sim);
        try { await navigator.clipboard.writeText(link); toast(t('common.copied')); }
        catch { window.prompt(t('scen.share'), link); }
      } else if (btn.dataset.action === 'delete') {
        if (await confirmSheet(t('scen.deleteConfirm', { name: sc.name }), '', t('common.delete'), t('common.cancel'), true)) {
          update((s) => { s.scenarios = s.scenarios.filter((x) => x.id !== sc.id); }, 'scenarios:list');
        }
      }
    });
  },
  update(root, changed) {
    // Renaming happens inside an input; don't replace it while typing.
    if (/^scenarios\.\d+\.name$/.test(changed)) return;
    root.innerHTML = body();
  },
};
