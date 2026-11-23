// 簡易ポートフォリオ（評価額・損益・構成比）。データはこの端末の storage.local のみに保存する。
import { ACCOUNTS, LIMITS, quoteUrl } from '../core/config.js';
import { fmt, signed, dir, esc, stockDigits } from '../core/format.js';
import { displayName, codeOf, normalizeSymbol } from '../core/symbols.js';
import { evaluate, groupBy } from '../core/portfolio.js';
import { donut, donutColor } from './sparkline.js';
import { attachSuggest } from './suggest.js';

export const portfolioTemplate = `
  <div class="panel-head">
    <h2 id="h-portfolio">ポートフォリオ</h2>
    <div class="pf-tools">
      <div class="seg small" id="pfView" role="tablist" aria-label="構成比の分類">
        <button data-v="account">口座別</button><button data-v="sym">銘柄別</button>
      </div>
      <button class="icon-btn small" id="hideBtn" title="金額の表示/非表示（h）" aria-pressed="false">👁</button>
    </div>
  </div>
  <div class="pf-summary" id="pfSummary"></div>
  <div class="pf-body">
    <div class="pf-chart" id="pfChart"></div>
    <div class="table-wrap">
      <table class="watch pf">
        <thead><tr><th>銘柄</th><th>口座</th><th>株数</th><th>取得単価</th><th>現在値</th><th>評価額</th><th>評価損益</th><th>本日</th><th></th></tr></thead>
        <tbody id="pfBody"></tbody>
      </table>
    </div>
  </div>
  <form id="pfForm" class="add-form pf-form" autocomplete="off">
    <span class="sg-anchor"><input id="pfSym" placeholder="コード・銘柄名" aria-label="銘柄" required></span>
    <input id="pfQty" type="number" min="0" step="any" placeholder="株数" aria-label="株数" required>
    <input id="pfCost" type="number" min="0" step="any" placeholder="平均取得単価" aria-label="平均取得単価" required>
    <select id="pfAcc" aria-label="口座区分">${Object.entries(ACCOUNTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <button type="submit">保有を追加</button>
  </form>
  <p class="hint">参考値です。外貨建ては現在の為替で円換算し、税金・手数料は含みません。保有データはこの端末にのみ保存され、同期・送信されません。</p>`;

const MASK = '****';

export function renderPortfolio(ctx) {
  const hide = ctx.state.settings.hideAmounts;
  const btn = document.getElementById('hideBtn');
  btn.setAttribute('aria-pressed', String(hide));
  btn.textContent = hide ? '🙈' : '👁';
  document.querySelectorAll('#pfView button').forEach((b) => b.classList.toggle('on', b.dataset.v === ctx.ui.pfView));

  const holdings = ctx.state.portfolio;
  const { rows, total } = evaluate(holdings, ctx.getQuoteBySym);
  const yen = (n) => (hide ? MASK : n == null ? '—' : `${Math.round(n).toLocaleString('ja-JP')}`);
  const syen = (n) => (hide ? MASK : n == null ? '—' : `${signed(n, 0)}`);

  document.getElementById('pfSummary').innerHTML = holdings.length ? `
    <div><span>評価額</span><b class="num">${yen(total.value)}<small>円</small></b></div>
    <div><span>評価損益</span><b class="num ${dir(total.pl)}">${syen(total.pl)}<small>円</small></b><em class="${dir(total.pl)}">${signed(total.plPct)}%</em></div>
    <div><span>本日の損益</span><b class="num ${dir(total.day)}">${syen(total.day)}<small>円</small></b><em class="${dir(total.day)}">${signed(total.dayPct)}%</em></div>
    ${total.missing ? `<div class="warn-text">${total.missing}銘柄は価格未取得のため除外</div>` : ''}` : '';

  document.getElementById('pfBody').innerHTML = rows.map((r, i) => {
    const q = r.quote;
    const dg = /\.T$/.test(r.sym) ? stockDigits(q?.price) : 2;
    return `<tr>
      <td class="name-cell"><a href="${quoteUrl(r.sym)}">${esc(displayName(r.sym, q))}</a><span class="code">${esc(codeOf(r.sym))}</span></td>
      <td><span class="acc acc-${esc(r.account)}">${esc(ACCOUNTS[r.account] || r.account)}</span></td>
      <td class="num">${hide ? MASK : fmt(Number(r.qty), Number(r.qty) % 1 ? 2 : 0)}</td>
      <td class="num">${hide ? MASK : fmt(Number(r.cost), dg)}${r.currency !== 'JPY' ? `<small class="cur">${esc(r.currency)}</small>` : ''}</td>
      <td class="num">${q ? fmt(q.price, dg) : '—'}</td>
      <td class="num">${yen(r.value)}</td>
      <td class="num ${dir(r.pl)}">${syen(r.pl)}<small>${r.plPct != null ? `${signed(r.plPct)}%` : ''}</small></td>
      <td class="num ${dir(r.dayPl)}">${syen(r.dayPl)}</td>
      <td><button class="del" data-i="${i}" title="削除" aria-label="${esc(displayName(r.sym, q))}の保有を削除">✕</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="skeleton">保有銘柄はまだありません。下のフォームから追加できます。</td></tr>';

  const groups = ctx.ui.pfView === 'sym'
    ? groupBy(rows, (r) => displayName(r.sym, r.quote))
    : groupBy(rows, (r) => ACCOUNTS[r.account] || r.account);
  const top = groups.slice(0, 7);
  if (groups.length > 7) top.push({ key: 'その他', value: groups.slice(7).reduce((a, g) => a + g.value, 0) });
  const sum = top.reduce((a, g) => a + g.value, 0);
  document.getElementById('pfChart').innerHTML = top.length ? `${donut(top)}
    <ul class="legend">${top.map((g, i) => `<li><i style="background:${donutColor(i)}"></i>${esc(g.key)}<span class="num">${fmt((g.value / sum) * 100, 1)}%</span></li>`).join('')}</ul>` : '';
}

export function bindPortfolio(ctx) {
  const symIn = document.getElementById('pfSym');
  let picked = null;
  attachSuggest(symIn, (it) => { picked = it.sym; symIn.value = `${it.code} ${it.name}`; document.getElementById('pfQty').focus(); });
  symIn.addEventListener('input', () => { picked = null; });

  document.getElementById('pfForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ctx.state.portfolio.length >= LIMITS.holdings) { ctx.toast(`保有は${LIMITS.holdings}件までです`); return; }
    const sym = picked || normalizeSymbol(symIn.value.split(/\s/)[0]);
    const qty = Number(document.getElementById('pfQty').value);
    const cost = Number(document.getElementById('pfCost').value);
    const account = document.getElementById('pfAcc').value;
    if (!sym || !(qty > 0) || !(cost >= 0)) { ctx.toast('銘柄・株数・取得単価を確認してください'); return; }
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await ctx.client.addSymbol(sym, ctx.range);
      ctx.state.portfolio.push({ sym, qty, cost, account });
      await ctx.savePortfolio();
      e.target.reset();
      picked = null;
      ctx.requestRefresh(); // 外貨建てなら為替も取得
    } catch (err) {
      ctx.toast(`「${codeOf(sym)}」を追加できません（${err.message}）`);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('pfBody').addEventListener('click', async (e) => {
    const b = e.target.closest('.del');
    if (!b) return;
    const h = ctx.state.portfolio[Number(b.dataset.i)];
    if (!h || !confirm(`${displayName(h.sym)} の保有を削除しますか？`)) return;
    ctx.state.portfolio.splice(Number(b.dataset.i), 1);
    await ctx.savePortfolio();
  });

  document.getElementById('pfView').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    ctx.ui.pfView = b.dataset.v;
    ctx.saveUi();
    renderPortfolio(ctx);
  });

  document.getElementById('hideBtn').addEventListener('click', () => ctx.toggleHide());
}
