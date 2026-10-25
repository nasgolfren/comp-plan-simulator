import { t } from '../../i18n/index.ts';
import { esc, icon } from '../dom.ts';

// Which help panels are open (memory only), so they stay open when a table re-renders.
const open = new Set<string>();

/** "Table help" button for a table header; its chevron turns when the panel opens. */
export function helpButton(id: string): string {
  const on = open.has(id);
  return `<button type="button" class="btn btn-sm" data-table-help="${id}" aria-expanded="${on}" aria-controls="${id}">
    ${icon('info', 15)}${esc(t('common.tableHelp'))}${icon('chevron', 14, 'help-chev')}</button>`;
}

/** The legend the button opens: one short explanation per column. */
export function helpPanel(id: string, items: { term: string; text: string }[]): string {
  return `<dl class="col-legend panel-quiet mb-3" id="${id}" ${open.has(id) ? '' : 'hidden'}>
    ${items.map((i) => `<div><dt>${esc(i.term)}</dt><dd>${esc(i.text)}</dd></div>`).join('')}</dl>`;
}

/** Toggle a help panel from a click anywhere; returns true when the click was on a help button. */
export function handleHelpClick(target: HTMLElement): boolean {
  const btn = target.closest<HTMLElement>('[data-table-help]');
  if (!btn) return false;
  const id = btn.dataset.tableHelp!;
  if (open.has(id)) open.delete(id); else open.add(id);
  btn.setAttribute('aria-expanded', String(open.has(id)));
  const panel = document.getElementById(id);
  if (panel) panel.hidden = !open.has(id);
  return true;
}
