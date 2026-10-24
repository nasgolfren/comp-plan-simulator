import { esc } from '../dom.ts';

/**
 * Small hand-built SVG charts, drawn at the container's real pixel width so text
 * stays legible on phones. Every chart has a hover/tap tooltip and a legend;
 * views also offer a table of the same numbers.
 */

export interface Series { key: string; label: string; color: string; values: number[] }
export interface StackedSpec { type: 'stacked'; labels: string[]; series: Series[]; line?: Series; format: (n: number) => string; height?: number }
export interface LineSpec { type: 'lines'; labels: string[]; series: Series[]; format: (n: number) => string; height?: number }
export interface DonutSpec { type: 'donut'; segments: { key: string; label: string; color: string; value: number }[]; format: (n: number) => string; center: string; centerSub: string }
export type ChartSpec = StackedSpec | LineSpec | DonutSpec;

const specs = new WeakMap<HTMLElement, ChartSpec>();
const ro = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver((entries) => entries.forEach((e) => {
    const el = e.target as HTMLElement;
    const spec = specs.get(el);
    if (spec && Math.abs((el.dataset.w ? Number(el.dataset.w) : 0) - el.clientWidth) > 4) draw(el, spec);
  }))
  : null;

export function mountChart(el: HTMLElement | null, spec: ChartSpec): void {
  if (!el) return;
  const fresh = !specs.has(el);
  specs.set(el, spec);
  draw(el, spec);
  if (fresh) {
    ro?.observe(el);
    attachTooltip(el);
  }
}

function draw(el: HTMLElement, spec: ChartSpec): void {
  const w = Math.max(280, el.clientWidth || 600);
  el.dataset.w = String(w);
  const svg = spec.type === 'donut' ? donut(spec) : spec.type === 'stacked' ? stacked(spec, w) : lines(spec, w);
  el.innerHTML = `${svg}<div class="tip" role="presentation"></div>`;
}

// ---------- scales ----------

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

const compact = (fmt: (n: number) => string) => (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return fmt(n / 1_000_000).replace(/\.0+(?=\D*$)/, '') + 'M';
  if (a >= 10_000) return fmt(Math.round(n / 1000)) + 'k';
  return fmt(n);
};

interface Frame { x0: number; x1: number; y0: number; y1: number; y: (v: number) => number; ticks: number[] }

function frame(w: number, h: number, min: number, max: number): Frame {
  const ticks = niceTicks(Math.min(0, min), Math.max(0, max));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const x0 = 56, x1 = w - 8, y0 = 12, y1 = h - 28;
  return { x0, x1, y0, y1, ticks, y: (v: number) => y1 - ((v - lo) / (hi - lo || 1)) * (y1 - y0) };
}

function axes(f: Frame, labels: string[], colX: (i: number) => number, fmt: (n: number) => string): string {
  const yLabels = f.ticks.map((v) => `
    <line x1="${f.x0}" x2="${f.x1}" y1="${f.y(v)}" y2="${f.y(v)}" stroke="var(--line)" stroke-width="1" ${v === 0 ? '' : 'stroke-dasharray="2 4"'}/>
    <text x="${f.x0 - 8}" y="${f.y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${esc(compact(fmt)(v))}</text>`).join('');
  const every = Math.ceil(labels.length / Math.max(2, Math.floor((f.x1 - f.x0) / 56)));
  const xLabels = labels.map((l, i) => i % every === 0
    ? `<text x="${colX(i)}" y="${f.y1 + 18}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(l)}</text>` : '').join('');
  return yLabels + xLabels;
}

function tipData(title: string, rows: { label: string; value: string; color?: string; strong?: boolean }[]): string {
  return esc(JSON.stringify({ title, rows }));
}

// ---------- stacked bars (+ optional line on the same $ axis) ----------

function stacked(s: StackedSpec, w: number): string {
  const h = s.height ?? 260;
  const n = s.labels.length;
  const totals = s.labels.map((_, i) => s.series.reduce((sum, ser) => sum + Math.max(0, ser.values[i] ?? 0), 0));
  const lineVals = s.line?.values ?? [];
  const f = frame(w, h, Math.min(0, ...lineVals), Math.max(1, ...totals, ...lineVals));
  const band = (f.x1 - f.x0) / n;
  const bw = Math.max(4, Math.min(36, band * 0.62));
  const colX = (i: number) => f.x0 + band * i + band / 2;
  let marks = '';
  s.labels.forEach((_, i) => {
    let acc = 0;
    const visible = s.series.filter((ser) => (ser.values[i] ?? 0) > 0);
    visible.forEach((ser, k) => {
      const v = ser.values[i];
      const yTop = f.y(acc + v), yBot = f.y(acc);
      const gap = k > 0 ? 1 : 0; // 2px surface gap between stacked fills (1px each side)
      const top = k === visible.length - 1;
      const hgt = Math.max(0, yBot - yTop - gap);
      marks += top
        ? `<path d="${roundedTop(colX(i) - bw / 2, yTop, bw, hgt, Math.min(4, hgt, bw / 2))}" fill="${ser.color}"/>`
        : `<rect x="${colX(i) - bw / 2}" y="${yTop}" width="${bw}" height="${hgt}" fill="${ser.color}"/>`;
      acc += v;
    });
  });
  let line = '';
  if (s.line) {
    const pts = s.line.values.map((v, i) => `${colX(i)},${f.y(v)}`).join(' ');
    line = `<polyline points="${pts}" fill="none" stroke="${s.line.color}" stroke-width="2" stroke-linejoin="round"/>`
      + s.line.values.map((v, i) => `<circle cx="${colX(i)}" cy="${f.y(v)}" r="3.5" fill="${s.line!.color}" stroke="var(--surface)" stroke-width="2"/>`).join('');
  }
  const hits = s.labels.map((label, i) => {
    const rows = s.series.filter((ser) => (ser.values[i] ?? 0) !== 0).map((ser) => ({ label: ser.label, value: s.format(ser.values[i]), color: ser.color }));
    if (s.line) rows.push({ label: s.line.label, value: s.format(s.line.values[i]), color: s.line.color, strong: true } as never);
    return `<rect class="hit" x="${f.x0 + band * i}" y="${f.y0}" width="${band}" height="${f.y1 - f.y0}" fill="transparent" data-tip="${tipData(label, rows)}" data-cx="${colX(i)}"/>`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
    ${axes(f, s.labels, colX, s.format)}
    <rect class="cross" x="0" y="${f.y0}" width="${band}" height="${f.y1 - f.y0}" fill="var(--brand)" opacity="0" />
    ${marks}${line}${hits}
  </svg>`;
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  r = Math.max(0, Math.min(r, h));
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// ---------- lines ----------

function lines(s: LineSpec, w: number): string {
  const h = s.height ?? 220;
  const all = s.series.flatMap((x) => x.values);
  const f = frame(w, h, Math.min(0, ...all), Math.max(1, ...all));
  const n = s.labels.length;
  const colX = (i: number) => f.x0 + (n === 1 ? (f.x1 - f.x0) / 2 : ((f.x1 - f.x0 - 12) * i) / (n - 1) + 6);
  const paths = s.series.map((ser) => `<polyline points="${ser.values.map((v, i) => `${colX(i)},${f.y(v)}`).join(' ')}" fill="none" stroke="${ser.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const dots = s.series.map((ser) => ser.values.map((v, i) => `<circle class="dot" data-i="${i}" cx="${colX(i)}" cy="${f.y(v)}" r="4" fill="${ser.color}" stroke="var(--surface)" stroke-width="2" opacity="0"/>`).join('')).join('');
  const step = n > 1 ? colX(1) - colX(0) : f.x1 - f.x0;
  const hits = s.labels.map((label, i) => `<rect class="hit" x="${colX(i) - step / 2}" y="${f.y0}" width="${step}" height="${f.y1 - f.y0}" fill="transparent" data-i="${i}" data-cx="${colX(i)}"
    data-tip="${tipData(label, s.series.map((ser) => ({ label: ser.label, value: s.format(ser.values[i]), color: ser.color })))}"/>`).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
    ${axes(f, s.labels, colX, s.format)}
    <line class="crossline" x1="0" x2="0" y1="${f.y0}" y2="${f.y1}" stroke="var(--line-strong)" stroke-width="1" opacity="0"/>
    ${paths}${dots}${hits}
  </svg>`;
}

// ---------- donut ----------

function donut(s: DonutSpec): string {
  const size = 200, r = 82, sw = 26, c = size / 2;
  const total = s.segments.reduce((a, b) => a + Math.max(0, b.value), 0);
  let marks = '';
  if (total <= 0) {
    marks = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${sw}"/>`;
  } else {
    let a0 = -Math.PI / 2;
    const segs = s.segments.filter((x) => x.value > 0);
    segs.forEach((seg) => {
      const frac = seg.value / total;
      const gapA = segs.length > 1 ? 2 / r : 0; // 2px surface gap
      const a1 = a0 + frac * Math.PI * 2;
      const s0 = a0 + gapA / 2, s1 = Math.max(s0 + 0.001, a1 - gapA / 2);
      const large = s1 - s0 > Math.PI ? 1 : 0;
      const p = frac >= 0.9999
        ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${sw}"/>`
        : `<path d="M${c + r * Math.cos(s0)},${c + r * Math.sin(s0)} A${r},${r} 0 ${large} 1 ${c + r * Math.cos(s1)},${c + r * Math.sin(s1)}" fill="none" stroke="${seg.color}" stroke-width="${sw}"/>`;
      marks += p.replace(/^<(\w+)/, `<$1 class="hit" data-tip="${tipData(seg.label, [{ label: `${Math.round(frac * 100)}%`, value: s.format(seg.value), color: seg.color }])}"`);
      a0 = a1;
    });
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" style="max-width:${size}px;margin:auto">
    ${marks}
    <text x="${c}" y="${c - 2}" text-anchor="middle" font-family="var(--font-display)" font-weight="700" font-size="22" fill="var(--ink)">${esc(s.center)}</text>
    <text x="${c}" y="${c + 18}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(s.centerSub)}</text>
  </svg>`;
}

// ---------- tooltip ----------

function attachTooltip(el: HTMLElement): void {
  const show = (target: Element, clientX: number, clientY: number) => {
    const tip = el.querySelector<HTMLElement>('.tip');
    const raw = target.getAttribute('data-tip');
    if (!tip || !raw) return;
    const { title, rows } = JSON.parse(raw) as { title: string; rows: { label: string; value: string; color?: string; strong?: boolean }[] };
    tip.innerHTML = `<div class="font-semibold mb-1">${esc(title)}</div>${rows.map((r) => `
      <div class="row"><span class="inline-flex items-center gap-1.5">${r.color ? `<i style="width:8px;height:8px;border-radius:2px;background:${r.color};display:inline-block"></i>` : ''}${esc(r.label)}</span><span class="${r.strong ? 'font-bold' : ''}">${esc(r.value)}</span></div>`).join('')}`;
    tip.style.display = 'block';
    const box = el.getBoundingClientRect();
    let x = clientX - box.left + 14;
    if (x + tip.offsetWidth > box.width) x = clientX - box.left - tip.offsetWidth - 14;
    tip.style.left = `${Math.max(0, x)}px`;
    tip.style.top = `${Math.max(0, clientY - box.top - tip.offsetHeight - 8)}px`;
    // highlight
    const cx = target.getAttribute('data-cx');
    const cross = el.querySelector<SVGRectElement>('.cross');
    if (cross && cx) { cross.setAttribute('x', String(Number(target.getAttribute('x')))); cross.setAttribute('opacity', '0.07'); }
    const cl = el.querySelector<SVGLineElement>('.crossline');
    if (cl && cx) { cl.setAttribute('x1', cx); cl.setAttribute('x2', cx); cl.setAttribute('opacity', '1'); }
    const i = target.getAttribute('data-i');
    el.querySelectorAll<SVGCircleElement>('.dot').forEach((d) => d.setAttribute('opacity', d.getAttribute('data-i') === i ? '1' : '0'));
  };
  const hide = () => {
    const tip = el.querySelector<HTMLElement>('.tip');
    if (tip) tip.style.display = 'none';
    el.querySelector('.cross')?.setAttribute('opacity', '0');
    el.querySelector('.crossline')?.setAttribute('opacity', '0');
    el.querySelectorAll('.dot').forEach((d) => d.setAttribute('opacity', '0'));
  };
  el.addEventListener('pointermove', (e) => {
    const target = (e.target as Element).closest('[data-tip]');
    if (target) show(target, e.clientX, e.clientY); else hide();
  });
  el.addEventListener('pointerleave', hide);
}

export function legend(items: { label: string; color: string; line?: boolean }[]): string {
  return `<div class="legend">${items.map((i) => `<span><i class="${i.line ? 'line' : ''}" style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`;
}
