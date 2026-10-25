import { t } from '../../i18n/index.ts';
import { exportJson, getState, importJson, resetAll, update } from '../../state/store.ts';
import type { Lang } from '../../state/store.ts';
import { confirmSheet, esc, icon, toast } from '../dom.ts';
import { flag } from '../flags.ts';
import { PLAN_ORDER, handleProfileClick, planCard, pointsBox, refreshProfile, roleBlock } from './welcome.ts';
import type { View } from './view.ts';

/**
 * Left: Partner and Member tiles, each with its "since" date. Right: the membership choice
 * and the Reward Points estimate. Re-rendered when the selection changes.
 */
function youBody(): string {
  const p = getState().profile;
  return `
    <section class="panel grid gap-4 content-start" aria-labelledby="you-h">
      <h2 id="you-h">${esc(t('prof.you'))}</h2>
      ${roleBlock('partner', p.isPartner, true)}
      ${roleBlock('member', p.isMember, true)}
    </section>

    <section class="panel grid gap-4 content-start" aria-labelledby="plan-h">
      <h2 id="plan-h">${esc(t('prof.plan'))}</h2>
      ${p.isMember ? `
      <div class="grid gap-3" role="radiogroup" aria-labelledby="plan-h">
        ${PLAN_ORDER.map((plan) => planCard(plan, p.memberPlan === plan, true)).join('')}
      </div>
      ${pointsBox()}` : `<p class="hint">${esc(t('prof.planMemberOnly'))}</p>`}
    </section>`;
}

function body(): string {
  const s = getState();
  const seg = (action: string, current: string, items: { v: string; label: string; pre?: string }[], label: string) =>
    `<div class="seg" role="group" aria-label="${esc(label)}">${items.map((i) => `<button type="button" data-action="${action}" data-v="${i.v}" aria-pressed="${current === i.v}">${i.pre ?? ''} ${esc(i.label)}</button>`).join('')}</div>`;
  return `
  <header class="mb-6"><h1>${esc(t('prof.title'))}</h1></header>
  <div id="you" class="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start mb-4">${youBody()}</div>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
    <section class="panel grid gap-4" aria-labelledby="disp-h">
      <h2 id="disp-h">${esc(t('prof.display'))}</h2>
      <div class="grid gap-2"><p class="field-label">${esc(t('top.language'))}</p>
        ${seg('lang', s.lang, [{ v: 'en', label: 'English', pre: flag('en') }, { v: 'es', label: 'Español', pre: flag('es') }], t('top.language'))}</div>
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
      const el = e.target as HTMLElement;
      if (handleProfileClick(el)) return;

      const btn = el.closest<HTMLElement>('button[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'lang') update((s) => { s.lang = btn.dataset.v as Lang; }, 'lang');
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
    const you = root.querySelector<HTMLElement>('#you');
    if (you) refreshProfile(root, you, changed, youBody);
  },
};
