// SVG スパークライン（外部ライブラリなし）
let gid = 0;

export function sparkline(pts, base, w = 200, h = 44) {
  if (!pts || pts.length < 2) return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const ys = pts.map((p) => p[1]);
  let min = Math.min(...ys), max = Math.max(...ys);
  const hasBase = base != null && Number.isFinite(base);
  if (hasBase) { min = Math.min(min, base); max = Math.max(max, base); }
  const pad = 3;
  const span = max - min || 1;
  const x = (i) => (i / (pts.length - 1)) * w;
  const y = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const d = ys.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = ys.at(-1);
  const ref = hasBase ? base : ys[0];
  const col = last > ref ? 'var(--up)' : last < ref ? 'var(--down)' : 'var(--flat)';
  const id = `sg${++gid}`;
  const baseLine = hasBase
    ? `<line x1="0" x2="${w}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}" stroke="var(--muted)" stroke-width="0.8" stroke-dasharray="3 3" opacity=".6" vector-effect="non-scaling-stroke"/>`
    : '';
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/>
    </linearGradient></defs>
    ${baseLine}
    <path d="${d}L${w},${h}L0,${h}Z" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

// ドーナツチャート（構成比）
const DONUT_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

export function donut(parts, size = 140, thick = 22) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true"></svg>`;
  const r = (size - thick) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  const segs = parts.map((p, i) => {
    const len = (p.value / total) * c;
    const s = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${DONUT_COLORS[i % DONUT_COLORS.length]}" stroke-width="${thick}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    off += len;
    return s;
  });
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${segs.join('')}</svg>`;
}

export function donutColor(i) {
  return DONUT_COLORS[i % DONUT_COLORS.length];
}
