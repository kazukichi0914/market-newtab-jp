// 銘柄名・コードのサジェスト（検索欄・ウォッチリスト追加・ポートフォリオ追加で共用）
import { searchLocal } from '../core/symbols.js';
import { esc } from '../core/format.js';
import { client } from './client.js';

/**
 * @param {HTMLInputElement} input
 * @param {(item:{sym:string,name:string,code:string})=>void} onPick
 */
export function attachSuggest(input, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'suggest';
  wrap.hidden = true;
  wrap.setAttribute('role', 'listbox');
  input.setAttribute('aria-autocomplete', 'list');
  input.parentElement.style.position ||= 'relative';
  input.insertAdjacentElement('afterend', wrap);

  let items = [];
  let active = -1;
  let timer = null;
  let seq = 0;

  const close = () => { wrap.hidden = true; active = -1; items = []; };
  const draw = () => {
    if (!items.length) { close(); return; }
    wrap.innerHTML = items.map((it, i) => `<div class="sg-item${i === active ? ' on' : ''}" role="option" data-i="${i}">
      <span class="sg-code">${esc(it.code)}</span><span class="sg-name">${esc(it.name)}</span>${it.exch ? `<span class="sg-ex">${esc(it.exch)}</span>` : ''}
    </div>`).join('');
    wrap.hidden = false;
  };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (!q) { close(); return; }
    items = searchLocal(q);
    active = -1;
    draw();
    // 辞書で足りない場合は Yahoo Finance の検索で補う（英字・2 文字以上）
    if (items.length < 3 && q.length >= 2) {
      const my = ++seq;
      timer = setTimeout(async () => {
        try {
          const remote = await client.search(q);
          if (my !== seq || input.value.trim() !== q) return;
          const seen = new Set(items.map((x) => x.sym));
          items = items.concat(remote.filter((x) => !seen.has(x.sym))).slice(0, 8);
          draw();
        } catch (_) { /* サジェストの失敗は無視 */ }
      }, 350);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (wrap.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(-1, active - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); }
    else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      const it = items[active];
      close();
      onPick(it);
    }
  });

  wrap.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.sg-item');
    if (!el) return;
    e.preventDefault();
    const it = items[Number(el.dataset.i)];
    close();
    onPick(it);
  });

  input.addEventListener('blur', () => setTimeout(close, 120));
  return { close };
}
