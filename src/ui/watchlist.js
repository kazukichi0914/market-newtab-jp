// ウォッチリスト（複数リスト・ヒートマップ・並べ替え・CSV 入出力）
import { LIMITS, quoteUrl } from '../core/config.js';
import { fmt, signed, arrow, dir, stockDigits, esc, fmtVolume } from '../core/format.js';
import { displayName, codeOf, normalizeSymbol } from '../core/symbols.js';
import { sparkline } from './sparkline.js';
import { attachSuggest } from './suggest.js';
import { flashClass } from './panels.js';

export const watchTemplate = `
  <div class="panel-head">
    <h2 id="h-watch">ウォッチリスト</h2>
    <div class="wl-tabs" id="wlTabs" role="tablist" aria-label="ウォッチリスト"></div>
    <form id="addForm" class="add-form" autocomplete="off">
      <input id="addInput" placeholder="コード・銘柄名で追加（例: 6501 / トヨタ）" aria-label="銘柄を追加">
      <button type="submit">追加</button>
    </form>
    <details class="menu">
      <summary class="icon-btn small" title="リストの操作">⋯</summary>
      <div class="menu-body">
        <button type="button" data-act="newList">新しいリスト</button>
        <button type="button" data-act="renameList">リスト名を変更</button>
        <button type="button" data-act="deleteList">このリストを削除</button>
        <hr>
        <button type="button" data-act="export">CSV で書き出す</button>
        <button type="button" data-act="import">CSV を読み込む</button>
        <input type="file" id="csvFile" accept=".csv,text/csv" hidden>
      </div>
    </details>
  </div>
  <div class="heatmap" id="heatmap"></div>
  <div class="table-wrap">
    <table class="watch">
      <thead><tr>
        <th data-sort="code" class="sortable">銘柄</th>
        <th data-sort="price" class="sortable">現在値</th>
        <th>前日比</th>
        <th data-sort="pct" class="sortable">騰落率</th>
        <th>チャート</th>
        <th data-sort="volume" class="sortable">出来高</th>
        <th>52週レンジ</th>
        <th></th>
      </tr></thead>
      <tbody id="watchBody"></tbody>
    </table>
  </div>
  <p class="hint" id="watchHint"></p>`;

function activeList(ctx) {
  return ctx.state.watchlists.find((l) => l.id === ctx.ui.activeList) || ctx.state.watchlists[0];
}

function sortedSyms(ctx, list) {
  const { col, asc } = ctx.ui.sort;
  if (!col) return list.syms.slice();
  const val = (s) => {
    const q = ctx.getQuote(s);
    if (col === 'code') return codeOf(s);
    return q?.[col] ?? -Infinity;
  };
  return list.syms.slice().sort((a, b) => {
    const va = val(a), vb = val(b);
    const r = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return asc ? r : -r;
  });
}

export function renderWatch(ctx) {
  const list = activeList(ctx);
  document.getElementById('wlTabs').innerHTML = ctx.state.watchlists.map((l) => `<button role="tab" data-id="${esc(l.id)}" aria-selected="${l.id === list.id}" class="${l.id === list.id ? 'on' : ''}">${esc(l.name)}<small>${l.syms.length}</small></button>`).join('');

  document.querySelectorAll('.watch th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', ctx.ui.sort.col === th.dataset.sort);
    th.dataset.dir = ctx.ui.sort.col === th.dataset.sort ? (ctx.ui.sort.asc ? '▲' : '▼') : '';
  });

  const syms = sortedSyms(ctx, list);
  const draggable = !ctx.ui.sort.col;
  const base = (q) => (ctx.range === '1d' ? q.prev : q.rangeBase);

  document.getElementById('watchBody').innerHTML = syms.map((s) => {
    const q = ctx.getQuote(s);
    const err = ctx.getError(s);
    const nameCell = `<td class="name-cell"><span class="grip" aria-hidden="true">${draggable ? '⋮⋮' : ''}</span><a href="${quoteUrl(s)}">${esc(displayName(s, q))}</a><span class="code">${esc(codeOf(s))}</span>${err ? `<span class="badge warn" title="${esc(err)}">⚠</span>` : ''}</td>`;
    const del = `<td><button class="del" data-sym="${esc(s)}" title="削除" aria-label="${esc(displayName(s, q))}を削除">✕</button></td>`;
    if (!q) return `<tr data-sym="${esc(s)}" draggable="${draggable}">${nameCell}<td colspan="6" class="skeleton">${err ? '取得できません' : '取得中…'}</td>${del}</tr>`;
    const dg = /\.T$/.test(s) ? stockDigits(q.price) : 2;
    let r52 = '—';
    if (q.hi52 != null && q.lo52 != null && q.hi52 > q.lo52) {
      const p = Math.max(0, Math.min(1, (q.price - q.lo52) / (q.hi52 - q.lo52))) * 100;
      r52 = `<span class="range52" title="52週安値 ${fmt(q.lo52, dg)} / 高値 ${fmt(q.hi52, dg)}"><i style="left:calc(${p.toFixed(1)}% - 1px)"></i></span>`;
    }
    const fl = flashClass(`w:${s}`, q.price, ctx.flash);
    return `<tr data-sym="${esc(s)}" draggable="${draggable}" class="${fl}">
      ${nameCell}
      <td class="num">${fmt(q.price, dg)}</td>
      <td class="num ${dir(q.chg)}">${arrow(q.chg)}${signed(q.chg, dg)}</td>
      <td class="num ${dir(q.pct)}">${signed(q.pct)}%</td>
      <td>${sparkline(q.pts, base(q), 110, 26)}</td>
      <td class="num">${fmtVolume(q.volume)}</td>
      <td>${r52}</td>
      ${del}
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="skeleton">銘柄がありません。上の欄から追加してください。</td></tr>';

  document.getElementById('heatmap').innerHTML = syms.map((s) => {
    const q = ctx.getQuote(s);
    const pct = q?.pct ?? 0;
    const strength = Math.min(Math.abs(pct) / 3, 1); // ±3% で最大濃度
    const mix = Math.round(25 + strength * 70);
    const bg = !q || pct === 0 ? 'var(--line)' : `color-mix(in srgb, var(--${pct > 0 ? 'up' : 'down'}) ${mix}%, var(--panel-2))`;
    // 色が薄いタイルは白文字だと読みにくいので通常の文字色にする
    return `<a class="tile${!q || strength < 0.45 ? ' pale' : ''}" href="${quoteUrl(s)}" style="background:${bg}" title="${esc(displayName(s, q))} ${q ? `${signed(pct)}%` : ''}">
      <b>${esc(displayName(s, q))}</b>${q ? `${arrow(pct)}${signed(pct)}%` : '—'}
    </a>`;
  }).join('');

  document.getElementById('watchHint').textContent = draggable
    ? '行をドラッグして並べ替えできます。列名をクリックで並べ替え。'
    : '並べ替え表示中（ドラッグ不可）。もう一度列名をクリックすると元の順に戻ります。';
}

/* ---------- CSV ---------- */

export function toCsv(list) {
  return ['コード,銘柄名', ...list.syms.map((s) => `${codeOf(s)},"${displayName(s).replace(/"/g, '""')}"`)].join('\r\n');
}

export function parseCsv(text) {
  const syms = [];
  for (const line of text.split(/\r?\n/)) {
    const cell = line.split(',')[0]?.replace(/^"|"$/g, '').trim();
    if (!cell || cell === 'コード' || /^code$/i.test(cell)) continue;
    const s = normalizeSymbol(cell);
    if (s && !syms.includes(s)) syms.push(s);
  }
  return syms;
}

/* ---------- 操作 ---------- */

export function bindWatch(ctx) {
  const input = document.getElementById('addInput');
  const err = (m) => ctx.toast(m);

  const add = async (sym) => {
    const list = activeList(ctx);
    if (!sym) { err('銘柄コードを確認してください'); return; }
    if (list.syms.includes(sym)) { err('すでにリストにあります'); return; }
    if (list.syms.length >= LIMITS.perList) { err(`1つのリストは${LIMITS.perList}銘柄までです`); return; }
    input.value = '';
    input.disabled = true;
    try {
      await ctx.client.addSymbol(sym, ctx.range);
      const cur = activeList(ctx); // 待っている間に他のタブ等で差し替わっていても最新のリストに追加する
      if (!cur.syms.includes(sym)) cur.syms.push(sym);
      await ctx.saveWatchlists();
    } catch (e) {
      err(`「${codeOf(sym)}」を追加できません（${e.message}）`);
    } finally {
      input.disabled = false;
      input.focus();
    }
  };

  attachSuggest(input, (it) => add(it.sym));
  document.getElementById('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    add(normalizeSymbol(input.value));
  });

  document.getElementById('wlTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    ctx.ui.activeList = b.dataset.id;
    ctx.saveUi();
    renderWatch(ctx);
  });

  document.getElementById('watchBody').addEventListener('click', async (e) => {
    const b = e.target.closest('.del');
    if (!b) return;
    const list = activeList(ctx);
    list.syms = list.syms.filter((s) => s !== b.dataset.sym);
    await ctx.saveWatchlists();
  });

  document.querySelector('.watch thead').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    const s = ctx.ui.sort;
    // 降順 → 昇順 → 解除
    if (s.col !== col) { s.col = col; s.asc = col === 'code'; }
    else if (s.asc === (col === 'code')) s.asc = !s.asc;
    else { s.col = null; }
    renderWatch(ctx);
  });

  // ドラッグ&ドロップで並べ替え
  const body = document.getElementById('watchBody');
  let dragSym = null;
  body.addEventListener('dragstart', (e) => {
    const tr = e.target.closest('tr[data-sym]');
    if (!tr || tr.getAttribute('draggable') !== 'true') return;
    dragSym = tr.dataset.sym;
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  body.addEventListener('dragover', (e) => {
    if (!dragSym) return;
    e.preventDefault();
    const tr = e.target.closest('tr[data-sym]');
    body.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
    if (tr && tr.dataset.sym !== dragSym) tr.classList.add('drop-before');
  });
  body.addEventListener('drop', async (e) => {
    e.preventDefault();
    const tr = e.target.closest('tr[data-sym]');
    const list = activeList(ctx);
    if (dragSym && tr && tr.dataset.sym !== dragSym) {
      const syms = list.syms.filter((s) => s !== dragSym);
      syms.splice(syms.indexOf(tr.dataset.sym), 0, dragSym);
      list.syms = syms;
      await ctx.saveWatchlists();
    }
    dragSym = null;
  });
  body.addEventListener('dragend', () => {
    dragSym = null;
    body.querySelectorAll('.dragging,.drop-before').forEach((x) => x.classList.remove('dragging', 'drop-before'));
  });

  // リスト操作メニュー
  const menu = document.querySelector('#panel-watch details.menu');
  const fileInput = document.getElementById('csvFile');
  menu.addEventListener('click', async (e) => {
    const act = e.target.closest('button[data-act]')?.dataset.act;
    if (!act) return;
    menu.open = false;
    const lists = ctx.state.watchlists;
    const list = activeList(ctx);
    if (act === 'newList') {
      if (lists.length >= LIMITS.lists) { err(`リストは${LIMITS.lists}つまでです`); return; }
      const name = prompt('新しいリストの名前', `リスト${lists.length + 1}`)?.trim();
      if (!name) return;
      const id = `l${Date.now().toString(36)}`;
      lists.push({ id, name: name.slice(0, 20), syms: [] });
      ctx.ui.activeList = id;
      ctx.saveUi();
      await ctx.saveWatchlists();
    } else if (act === 'renameList') {
      const name = prompt('リスト名', list.name)?.trim();
      if (!name) return;
      list.name = name.slice(0, 20);
      await ctx.saveWatchlists();
    } else if (act === 'deleteList') {
      if (lists.length <= 1) { err('最後のリストは削除できません'); return; }
      if (!confirm(`「${list.name}」を削除しますか？（${list.syms.length}銘柄）`)) return;
      ctx.state.watchlists = lists.filter((l) => l.id !== list.id);
      ctx.ui.activeList = ctx.state.watchlists[0].id;
      ctx.saveUi();
      await ctx.saveWatchlists();
    } else if (act === 'export') {
      const blob = new Blob(['﻿' + toCsv(list)], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `watchlist-${list.name}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (act === 'import') {
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    const syms = parseCsv(await f.text());
    const list = activeList(ctx);
    const added = syms.filter((s) => !list.syms.includes(s)).slice(0, LIMITS.perList - list.syms.length);
    list.syms.push(...added);
    await ctx.saveWatchlists();
    ctx.toast(`${added.length}銘柄を追加しました${syms.length > added.length ? `（重複・上限で${syms.length - added.length}件スキップ）` : ''}`);
    ctx.requestRefresh();
  });
}
