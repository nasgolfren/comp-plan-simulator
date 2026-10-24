import { MEMBER_PLANS } from '../config/plan.ts';
import { t } from '../i18n/index.ts';
import { getPath } from '../state/store.ts';
import { esc } from './dom.ts';

/**
 * Inputs carry data-path (where the value lives in the store) and data-kind
 * (how to read it). One delegated listener in main.ts writes them back.
 *   num   → number (empty = 0)
 *   num?  → number or null (empty = not set)
 *   pct   → shown as %, stored as 0–1
 *   bool  → checkbox
 *   text / select → string
 */
let seq = 0;
const nextId = () => `f${++seq}`;

export interface NumOpts {
  min?: number; max?: number; step?: number;
  prefix?: string; suffix?: string;
  kind?: 'num' | 'num?' | 'pct';
  hint?: string;
  missing?: boolean;
  id?: string;
}

export function numInput(path: string, o: NumOpts = {}): string {
  const kind = o.kind ?? 'num';
  const raw = getPath(path) as number | null;
  const value = raw === null || raw === undefined ? '' : kind === 'pct' ? round(raw * 100) : round(raw);
  return `<div class="input-wrap${o.missing ? ' is-missing' : ''}">
    ${o.prefix ? `<span class="affix">${esc(o.prefix)}</span>` : ''}
    <input id="${o.id ?? ''}" type="number" inputmode="decimal" data-path="${path}" data-kind="${kind}"
      value="${value}" ${o.min !== undefined ? `min="${o.min}"` : 'min="0"'} ${o.max !== undefined ? `max="${o.max}"` : ''}
      step="${o.step ?? (kind === 'pct' ? 1 : 1)}" ${kind === 'num?' ? `placeholder="${esc(t('prof.notSet'))}"` : ''}>
    ${o.suffix ? `<span class="affix">${esc(o.suffix)}</span>` : ''}
  </div>`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function numField(label: string, path: string, o: NumOpts = {}): string {
  const id = o.id ?? nextId();
  return `<div class="field">
    <label for="${id}">${esc(label)}</label>
    ${numInput(path, { ...o, id })}
    ${o.hint ? `<p class="hint">${esc(o.hint)}</p>` : ''}
  </div>`;
}

export const money$ = { prefix: '$', min: 0, step: 50 } as const;
export const pct = { kind: 'pct', suffix: '%', min: 0, max: 100, step: 1 } as const;

/** Three inputs for Starter / Classic / Premium counts. */
export function planTrio(pathPrefix: string, o: { step?: number } = {}): string {
  return `<div class="plan-trio">${MEMBER_PLANS.map((p) => {
    const id = nextId();
    return `<div class="field">
      <label for="${id}"><span class="plan-dot ${p}" aria-hidden="true"></span>${esc(t(`plans.${p}`))}</label>
      ${numInput(`${pathPrefix}.${p}`, { id, step: o.step ?? 1 })}
    </div>`;
  }).join('')}</div>`;
}

export function toggle(label: string, path: string): string {
  const checked = !!getPath(path);
  return `<label class="switch"><input type="checkbox" data-path="${path}" data-kind="bool" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;
}

export function selectField(label: string, path: string, options: { value: string; label: string }[], hint?: string, numeric = false): string {
  const id = nextId();
  const cur = String(getPath(path));
  return `<div class="field">
    <label for="${id}">${esc(label)}</label>
    <div class="input-wrap"><select id="${id}" data-path="${path}" data-kind="${numeric ? 'selnum' : 'select'}">
      ${options.map((o) => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select></div>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
  </div>`;
}

export function dateField(label: string, path: string, hint?: string): string {
  const id = nextId();
  return `<div class="field">
    <label for="${id}">${esc(label)}</label>
    <div class="input-wrap"><input id="${id}" type="date" data-path="${path}" data-kind="text" value="${esc(getPath(path) ?? '')}"></div>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
  </div>`;
}

export function textInput(path: string, label: string): string {
  return `<div class="input-wrap"><input type="text" aria-label="${esc(label)}" data-path="${path}" data-kind="text" value="${esc(getPath(path) ?? '')}"></div>`;
}

/** Read a bound input's value according to its data-kind. */
export function readInput(el: HTMLInputElement | HTMLSelectElement): unknown {
  const kind = el.dataset.kind;
  if (kind === 'bool') return (el as HTMLInputElement).checked;
  if (kind === 'text' || kind === 'select') return el.value;
  if (kind === 'selnum') return Number(el.value);
  const v = el.value.trim();
  if (v === '') return kind === 'num?' ? null : 0;
  const n = Number(v.replace(',', '.'));
  if (!Number.isFinite(n)) return kind === 'num?' ? null : 0;
  return kind === 'pct' ? n / 100 : n;
}
