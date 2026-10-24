import { DISCLOSURE_URL, PLAN_VERSION } from '../../config/plan.ts';
import { t } from '../../i18n/index.ts';
import { getState, update } from '../../state/store.ts';
import { esc, icon, openSheet } from '../dom.ts';

let tipSeq = 0;

/**
 * Red, underlined "Disclaimer" button.
 * Hover-capable devices: hover/focus shows a short tooltip, click opens the full text.
 * Touch devices (no hover): a tap opens the full text as a bottom sheet.
 */
export function disclaimerButton(opts: { tipUp?: boolean } = {}): string {
  const id = `dtip-${++tipSeq}`;
  return `<span class="disclaimer-wrap${opts.tipUp ? ' tip-up' : ''}">
    <button type="button" class="disclaimer-link" data-action="disclaimer" aria-describedby="${id}">
      ${icon('info', 15)}${esc(t('disclaimer.label'))}
    </button>
    <span role="tooltip" id="${id}" class="disclaimer-tip">${esc(t('disclaimer.tooltip'))}</span>
  </span>`;
}

/** Grey line shown under every result. */
export function footnote(): string {
  return `<p class="footnote"><span>${esc(t('disclaimer.footnote'))}</span>${disclaimerButton({ tipUp: true })}</p>`;
}

export async function openDisclaimer(firstRun = false): Promise<void> {
  const body = `
    <div class="grid gap-3 text-ink-2">
      <p>${esc(t('disclaimer.p1'))}</p>
      <p>${esc(t('disclaimer.p2'))}</p>
      <p>${esc(t('disclaimer.p3'))}</p>
      <p class="font-semibold text-ink">${esc(t('disclaimer.p4'))}</p>
      <p class="hint">${esc(t('disclaimer.version', { version: PLAN_VERSION }))}</p>
      <p><a class="text-brand-ink underline font-semibold" href="${DISCLOSURE_URL}" target="_blank" rel="noopener noreferrer">${esc(t('disclaimer.link'))}</a></p>
    </div>`;
  await openSheet({
    title: t('disclaimer.title'),
    body,
    dismissible: !firstRun,
    actions: [{ label: firstRun ? t('disclaimer.accept') : t('disclaimer.close'), value: 'ok', kind: 'primary' }],
  });
  if (firstRun || !getState().disclaimerAccepted) update((s) => { s.disclaimerAccepted = true; }, 'disclaimerAccepted');
}
