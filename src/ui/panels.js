// 指数カード・為替などの行の描画
import { PANELS, RANGES, quoteUrl } from '../core/config.js';
import { fmt, signed, arrow, dir, autoDigits, esc, fmtTime } from '../core/format.js';
import { sparkline } from './sparkline.js';

const lastPrice = new Map(); // 値変化のフラッシュ用

export function flashClass(key, price, enabled) {
  const prev = lastPrice.get(key);
  lastPrice.set(key, price);
  if (!enabled || prev == null || price == null || prev === price) return '';
  return price > prev ? 'flash-up' : 'flash-down';
}

export function resetFlash() { lastPrice.clear(); }

function rangeNote(q, range) {
  if (range === '1d' || q.rangePct == null) return '';
  const label = RANGES.find((r) => r.id === range)?.label;
  return `<div class="sub">${label}騰落 <span class="${dir(q.rangePct)}">${arrow(q.rangePct)}${signed(q.rangePct)}%</span></div>`;
}

function badges(q, err) {
  let b = '';
  if (q?.proxy) b += `<span class="badge" title="${esc(q.proxy)}">代用</span>`;
  if (q?.daily) b += '<span class="badge" title="日次データ（前営業日比）">日次</span>';
  if (err) b += `<span class="badge warn" title="${esc(`更新失敗: ${err}（${fmtTime(q?.fetchedAt)} の値を表示中）`)}">⚠</span>`;
  return b;
}

function base(q, range) {
  return range === '1d' ? q.prev : q.rangeBase;
}

export function renderPanel(id, el, ctx) {
  const panel = PANELS[id];
  const html = panel.kind === 'cards' ? cards(panel.items, ctx) : rows(panel.items, ctx);
  el.innerHTML = html;
}

function cards(items, ctx) {
  return items.map((it) => {
    const q = ctx.getQuote(it.id);
    const err = ctx.getError(it.id);
    if (!q) {
      return `<div class="card"><div class="name">${esc(it.n)}${badges(null, err)}</div><div class="skeleton">${err ? `取得できません（${esc(err)}）` : '取得中…'}</div></div>`;
    }
    const dg = it.d ?? autoDigits(q.price);
    const fl = flashClass(it.id, q.price, ctx.flash);
    return `<a class="card ${fl}" href="${quoteUrl(q.sym)}" title="${esc(`${it.n}　データ時刻 ${fmtTime(q.time)}`)}">
      <div class="name">${esc(it.n)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}${badges(q, err)}</div>
      <div class="price num">${fmt(q.price, dg)}</div>
      <div class="chg num ${dir(q.chg)}">${arrow(q.chg)}${signed(q.chg, dg)}（${signed(q.pct)}%）</div>
      ${rangeNote(q, ctx.range)}
      ${sparkline(q.pts, base(q, ctx.range))}
      <div class="time">${fmtTime(q.time)}</div>
    </a>`;
  }).join('');
}

function rows(items, ctx) {
  return items.map((it) => {
    const q = ctx.getQuote(it.id);
    const err = ctx.getError(it.id);
    const name = `<div class="rname">${esc(it.n)}${badges(q, err)}<small>${esc(it.sub || '')}</small></div>`;
    if (!q) return `<div class="row">${name}<div class="skeleton">${err ? '取得できません' : '取得中…'}</div><div></div></div>`;
    const dg = it.d ?? autoDigits(q.price);
    const fl = flashClass(it.id, q.price, ctx.flash);
    return `<a class="row ${it.big ? 'big' : ''} ${fl}" href="${quoteUrl(q.sym)}" title="データ時刻 ${fmtTime(q.time)}">
      ${name}
      <div class="rval num">${fmt(q.price, dg)}<small class="${dir(q.chg)}">${arrow(q.chg)}${signed(q.chg, dg)}（${signed(q.pct)}%）</small></div>
      ${sparkline(q.pts, base(q, ctx.range), 90, 30)}
    </a>`;
  }).join('');
}
