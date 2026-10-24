export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] => Array.from(root.querySelectorAll<T>(sel));

const paths: Record<string, string> = {
  dashboard: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  share: '<path d="M10 14a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-5.6-5.6l-1.2 1.1"/><path d="M14 10a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 5.6 5.6l1.1-1.1"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  minus: '<path d="M5 12h14"/>',
};

export function icon(name: keyof typeof paths | string, size = 18, cls = ''): string {
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
}

let toastTimer: number | undefined;
export function toast(message: string): void {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2400);
}

/** A <dialog> that is a centered modal on desktop and a bottom sheet on phones. */
export function openSheet(opts: {
  title: string;
  body: string;
  actions: { label: string; value: string; kind?: 'primary' | 'danger' | 'plain' }[];
  dismissible?: boolean;
  labelledBy?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'sheet';
    const titleId = `sheet-title-${Math.random().toString(36).slice(2, 7)}`;
    d.setAttribute('aria-labelledby', titleId);
    d.innerHTML = `
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-body">
        <h2 id="${titleId}" class="mb-3">${esc(opts.title)}</h2>
        ${opts.body}
      </div>
      <div class="sheet-actions">
        ${opts.actions.map((a) => `<button class="btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : ''}" value="${esc(a.value)}">${esc(a.label)}</button>`).join('')}
      </div>`;
    document.body.appendChild(d);
    const dismissible = opts.dismissible !== false;
    const finish = (v: string | null) => { d.close(); d.remove(); resolve(v); };
    d.addEventListener('cancel', (e) => { if (!dismissible) e.preventDefault(); else finish(null); });
    d.addEventListener('click', (e) => {
      if (e.target === d && dismissible) finish(null); // click on the backdrop
      const b = (e.target as HTMLElement).closest('button[value]') as HTMLButtonElement | null;
      if (b) finish(b.value);
    });
    d.showModal();
    (d.querySelector('.sheet-actions .btn-primary') as HTMLElement | null)?.focus();
  });
}

export async function confirmSheet(title: string, body: string, ok: string, cancel: string, danger = false): Promise<boolean> {
  const v = await openSheet({
    title, body: `<p class="text-ink-2">${esc(body)}</p>`,
    actions: [{ label: cancel, value: 'no' }, { label: ok, value: 'yes', kind: danger ? 'danger' : 'primary' }],
  });
  return v === 'yes';
}
