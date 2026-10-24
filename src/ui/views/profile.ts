import { KNOWN_PRICES, MEMBER_PLANS } from '../../config/plan.ts';
import { t } from '../../i18n/index.ts';
import { exportJson, getState, importJson, resetAll, update } from '../../state/store.ts';
import type { Lang, Theme } from '../../state/store.ts';
import { confirmSheet, esc, icon, toast } from '../dom.ts';
import { dateField, numField, selectField, toggle } from '../fields.ts';
import type { View } from './view.ts';

function pricesTable(): string {
  const s = getState();
  return `<div class="grid gap-3">${MEMBER_PLANS.map((p) => `
    <fieldset class="panel-quiet grid gap-3 sm:grid-cols-[110px_1fr_1fr] sm:items-start">
      <legend class="sr-only">${esc(t(`plans.${p}`))}</legend>
      <p class="font-semibold inline-flex items-center gap-2 sm:pt-8" aria-hidden="true"><span class="plan-dot ${p}"></span>${esc(t(`plans.${p}`))}</p>
      ${(['activation', 'monthly'] as const).map((k) => {
        const known = KNOWN_PRICES[p][k];
        return numField(k === 'activation' ? t('prof.priceActivation') : t('prof.priceMonthly'), `prices.${k}.${p}`, {
          kind: 'num?', prefix: '$', step: 10, missing: s.prices[k][p] === null,
          hint: known !== null ? `${t('prof.fromGuide')}: $${known}` : undefined,
        });
      }).join('')}
    </fieldset>`).join('')}</div>`;
}

function body(): string {
  const s = getState();
  const seg = (action: string, current: string, items: { v: string; label: string; ic?: string }[], label: string) =>
    `<div class="seg" role="group" aria-label="${esc(label)}">${items.map((i) => `<button type="button" data-action="${action}" data-v="${i.v}" aria-pressed="${current === i.v}">${i.ic ? icon(i.ic, 14) : ''} ${esc(i.label)}</button>`).join('')}</div>`;
  return `
  <header class="mb-6"><h1>${esc(t('prof.title'))}</h1></header>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
    <section class="panel grid gap-5" aria-labelledby="you-h">
      <h2 id="you-h">${esc(t('prof.you'))}</h2>
      <div class="grid gap-3">
        ${toggle(t('prof.isMember'), 'profile.isMember')}
        ${toggle(t('prof.isPartner'), 'profile.isPartner')}
      </div>
      <div id="member-plan" class="${s.profile.isMember ? '' : 'hidden'}">
        ${selectField(t('prof.memberPlan'), 'profile.memberPlan', MEMBER_PLANS.map((p) => ({ value: p, label: t(`plans.${p}`) })))}
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        ${dateField(t('prof.partnerSince'), 'profile.partnerSince', t('prof.partnerSinceHint'))}
        ${dateField(t('prof.lastRenewal'), 'profile.lastRenewal', t('prof.lastRenewalHint'))}
      </div>
      ${numField(t('prof.tlbMonths'), 'profile.tlbMonths', { min: 0, step: 1 })}
    </section>

    <section class="panel grid gap-3" aria-labelledby="prices-h">
      <div><h2 id="prices-h">${esc(t('prof.prices'))}</h2><p class="hint mt-0.5">${esc(t('prof.pricesHint'))}</p></div>
      ${pricesTable()}
    </section>

    <section class="panel grid gap-4" aria-labelledby="disp-h">
      <h2 id="disp-h">${esc(t('prof.display'))}</h2>
      <div class="grid gap-2"><p class="field-label">${esc(t('top.language'))}</p>
        ${seg('lang', s.lang, [{ v: 'en', label: 'English' }, { v: 'es', label: 'Español' }], t('top.language'))}</div>
      <div class="grid gap-2"><p class="field-label">${esc(t('top.theme'))}</p>
        ${seg('theme', s.theme, [{ v: 'system', label: t('theme.system'), ic: 'monitor' }, { v: 'light', label: t('theme.light'), ic: 'sun' }, { v: 'dark', label: t('theme.dark'), ic: 'moon' }], t('top.theme'))}</div>
    </section>

    <section class="panel grid gap-4" aria-labelledby="data-h">
      <div><h2 id="data-h">${esc(t('prof.data'))}</h2><p class="hint mt-0.5">${esc(t('prof.dataHint'))}</p></div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn" data-action="export">${icon('download', 16)}${esc(t('prof.export'))}</button>
        <label class="btn cursor-pointer">${icon('upload', 16)}${esc(t('prof.import'))}<input type="file" accept="application/json,.json" class="sr-only" data-action="import"></label>
        <button type="button" class="btn btn-danger" data-action="reset">${icon('trash', 16)}${esc(t('prof.reset'))}</button>
      </div>
    </section>
  </div>`;
}

export const profileView: View = {
  render: body,
  mount(root) {
    root.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'lang') update((s) => { s.lang = btn.dataset.v as Lang; }, 'lang');
      else if (a === 'theme') update((s) => { s.theme = btn.dataset.v as Theme; }, 'theme');
      else if (a === 'export') {
        const blob = new Blob([exportJson()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `comp-plan-simulator-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (a === 'reset') {
        if (await confirmSheet(t('prof.reset'), t('prof.resetConfirm'), t('prof.reset'), t('common.cancel'), true)) {
          resetAll();
          toast(t('prof.resetDone'));
        }
      }
    });
    root.addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      if (input.dataset.action !== 'import' || !input.files?.[0]) return;
      try { importJson(await input.files[0].text()); toast(t('prof.imported')); }
      catch { toast(t('prof.importFail')); }
      input.value = '';
    });
  },
  update(root, changed) {
    if (changed === 'profile.isMember') root.querySelector('#member-plan')?.classList.toggle('hidden', !getState().profile.isMember);
    if (changed.startsWith('prices.')) {
      root.querySelectorAll<HTMLInputElement>('input[data-path^="prices."]').forEach((el) => {
        const [, k, p] = el.dataset.path!.split('.');
        el.closest('.input-wrap')?.classList.toggle('is-missing', getState().prices[k as 'activation' | 'monthly'][p as 'starter'] === null);
      });
    }
  },
};
