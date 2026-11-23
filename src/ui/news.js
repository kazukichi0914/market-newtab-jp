// 経済ニュース（見出しとリンクのみ）
import { NEWS_FEEDS, NEWS_STALE_DAYS } from '../core/config.js';
import { esc, fmtDateTimeShort, ago } from '../core/format.js';
import { isAllowedLink } from '../data/news.js';

export const newsTemplate = `
  <div class="panel-head">
    <h2 id="h-news">経済ニュース</h2>
    <div class="seg small" id="newsSeg" role="tablist" aria-label="ニュースの提供元">
      ${Object.entries(NEWS_FEEDS).map(([k, v]) => `<button data-src="${k}" role="tab">${v.label}</button>`).join('')}
    </div>
  </div>
  <ul class="news" id="news"></ul>
  <p class="hint" id="newsHint"></p>`;

export function hashLink(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function renderNews(ctx) {
  const src = ctx.state.settings.newsSrc;
  document.querySelectorAll('#newsSeg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.src === src);
    b.setAttribute('aria-selected', String(b.dataset.src === src));
  });
  const data = ctx.state.news[src];
  const el = document.getElementById('news');
  const hosts = NEWS_FEEDS[src]?.hosts;
  if (!data) { el.innerHTML = '<li class="skeleton">ニュースを取得中…</li>'; return; }
  const items = (data.items || []).filter((x) => isAllowedLink(x.link, hosts));
  el.innerHTML = items.map((x) => {
    const read = ctx.state.readNews.has(hashLink(x.link));
    return `<li class="${read ? 'read' : ''}"><a href="${esc(x.link)}" data-h="${hashLink(x.link)}">${esc(x.title)}<time>${x.date ? fmtDateTimeShort(x.date) : ''}</time></a></li>`;
  }).join('') || `<li class="skeleton">ニュースを取得できませんでした${data.error ? `（${esc(data.error)}）` : ''}</li>`;
  const newest = Math.max(0, ...items.map((x) => x.date || 0));
  const stale = newest && Date.now() - newest > NEWS_STALE_DAYS * 86400_000;
  const hint = document.getElementById('newsHint');
  hint.classList.toggle('warn-text', !!stale);
  hint.textContent = stale
    ? `このフィードは最新記事が${fmtDateTimeShort(newest)}で、更新が止まっている可能性があります。`
    : `出典: ${NEWS_FEEDS[src].label}　${data.ts ? `${ago(data.ts)}に取得` : ''}${data.error && items.length ? '（最新の取得に失敗）' : ''}`;
}

export function bindNews(ctx) {
  document.getElementById('newsSeg').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-src]');
    if (!b) return;
    ctx.state.settings.newsSrc = b.dataset.src;
    await ctx.saveSettings();
    renderNews(ctx);
    ctx.client.refreshNews(b.dataset.src).catch(() => {});
  });
  document.getElementById('news').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-h]');
    if (a) ctx.markRead(a.dataset.h);
  });
}
