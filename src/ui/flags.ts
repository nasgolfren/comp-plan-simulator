import type { Lang } from '../state/store.ts';

let n = 0;

/** United Kingdom (English). Each call gets its own clip-path id. */
function uk(): string {
  const id = `flag-uk-${n++}`;
  return `<svg viewBox="0 0 60 30" preserveAspectRatio="none" aria-hidden="true">
    <clipPath id="${id}"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath>
    <rect width="60" height="30" fill="#012169"/>
    <path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/>
    <path d="M0,0L60,30M60,0L0,30" clip-path="url(#${id})" stroke="#C8102E" stroke-width="4"/>
    <path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/>
    <path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/>
  </svg>`;
}

/** Spain (Spanish), without the coat of arms. */
function es(): string {
  return `<svg viewBox="0 0 3 2" preserveAspectRatio="none" aria-hidden="true">
    <rect width="3" height="2" fill="#AA151B"/><rect y="0.5" width="3" height="1" fill="#F1BF00"/>
  </svg>`;
}

export function flag(lang: Lang): string {
  return `<span class="flag">${lang === 'en' ? uk() : es()}</span>`;
}
