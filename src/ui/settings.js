// 設定ダイアログ
import { PANEL_LAYOUT, SEARCH_ENGINES, NEWS_FEEDS } from '../core/config.js';
import { defaultWatchlists } from '../core/storage.js';
import { holidayDataStale } from '../core/market-calendar.js';
import { esc } from '../core/format.js';

const opt = (pairs, cur) => pairs.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`).join('');

export function openSettings(ctx) {
  const s = ctx.state.settings;
  const dlg = document.getElementById('settings');
  const label = (id) => PANEL_LAYOUT.find((p) => p.id === id)?.label || id;
  dlg.innerHTML = `<form method="dialog">
    <h3>設定</h3>
    <div class="set-grid">
      <label>騰落の色<select name="colorMode">${opt([['jp', '日本式（上昇=赤 / 下落=青）'], ['us', '海外式（上昇=緑 / 下落=赤）']], s.colorMode)}</select></label>
      <label>テーマ<select name="theme">${opt([['auto', 'OS の設定に合わせる'], ['light', 'ライト'], ['dark', 'ダーク']], s.theme)}</select></label>
      <label>自動更新（市場時間中）<select name="interval">${opt([[30, '30秒'], [60, '1分'], [300, '5分'], [900, '15分'], [0, 'しない']], s.interval)}</select></label>
      <label>市場時間外の更新<select name="offhours">${opt([[900, '15分'], [1800, '30分'], [3600, '1時間'], [0, 'しない']], s.offhours)}</select></label>
      <label>情報密度<select name="density">${opt([['normal', '標準'], ['compact', 'コンパクト']], s.density)}</select></label>
      <label>検索エンジン<select name="engine">${opt(Object.entries(SEARCH_ENGINES).map(([k, v]) => [k, v.label]), s.engine)}</select></label>
      <label>ニュースの提供元<select name="newsSrc">${opt(Object.entries(NEWS_FEEDS).map(([k, v]) => [k, v.label]), s.newsSrc)}</select></label>
      <label>ポートフォリオの金額<select name="hideAmounts">${opt([['false', '表示する'], ['true', '隠す（****）']], s.hideAmounts)}</select></label>
    </div>
    <fieldset class="panels-set">
      <legend>表示するパネルと順番</legend>
      <ol id="panelList">${s.panels.map((p, i) => `<li data-id="${p.id}">
        <label class="chk"><input type="checkbox" ${p.visible ? 'checked' : ''}> ${esc(label(p.id))}</label>
        <span><button type="button" class="mini" data-mv="-1" ${i === 0 ? 'disabled' : ''} aria-label="上へ">↑</button><button type="button" class="mini" data-mv="1" ${i === s.panels.length - 1 ? 'disabled' : ''} aria-label="下へ">↓</button></span>
      </li>`).join('')}</ol>
    </fieldset>
    <button id="resetWatch" type="button" class="ghost">ウォッチリストを初期値に戻す</button>
    ${holidayDataStale() ? '<p class="warn-text">祝日データの収録期間を過ぎています。拡張の更新が必要です（土日のみで判定中）。</p>' : ''}
    <p class="note">データ: Yahoo Finance（非公式・遅延あり）、財務省 国債金利情報、NHK・Yahoo!ニュース RSS。TOPIX 等は連動 ETF の値で代用しています。<br>
    本拡張は情報提供を目的としたもので、投資勧誘や投資助言ではありません。表示されるデータは遅延・誤りを含む場合があります。投資判断はご自身の責任で行ってください。<br>
    ショートカット: <kbd>/</kbd> 検索　<kbd>r</kbd> 更新　<kbd>1</kbd>〜<kbd>6</kbd> 期間　<kbd>h</kbd> 金額の表示切替</p>
    <menu><button value="close">閉じる</button></menu>
  </form>`;

  const form = dlg.querySelector('form');
  form.addEventListener('change', async (e) => {
    const s = ctx.state.settings; // 保存時の変更通知で差し替わることがあるため毎回参照する
    const t = e.target;
    if (t.name) {
      const v = t.value;
      s[t.name] = ['interval', 'offhours'].includes(t.name) ? Number(v) : t.name === 'hideAmounts' ? v === 'true' : v;
    } else if (t.type === 'checkbox') {
      const id = t.closest('li').dataset.id;
      s.panels.find((p) => p.id === id).visible = t.checked;
    }
    await ctx.saveSettings();
    ctx.applySettings();
  });
  form.querySelector('#panelList').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-mv]');
    if (!b) return;
    const s = ctx.state.settings;
    const id = b.closest('li').dataset.id;
    const i = s.panels.findIndex((p) => p.id === id);
    const j = i + Number(b.dataset.mv);
    if (j < 0 || j >= s.panels.length) return;
    [s.panels[i], s.panels[j]] = [s.panels[j], s.panels[i]];
    await ctx.saveSettings();
    ctx.applySettings();
    openSettings(ctx); // 並びを再描画
  });
  form.querySelector('#resetWatch').addEventListener('click', async () => {
    if (!confirm('ウォッチリストを初期状態に戻します。追加したリストと銘柄は消えます。よろしいですか？')) return;
    ctx.state.watchlists = defaultWatchlists();
    ctx.ui.activeList = 'main';
    await ctx.saveWatchlists();
    ctx.requestRefresh();
    dlg.close();
  });
  if (!dlg.open) dlg.showModal();
}
