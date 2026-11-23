// RSS の取得と解析。Service Worker には DOMParser が無いため、正規表現で item を取り出す。
import { NEWS_FEEDS } from '../core/config.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/<[^>]+>/g, '')
    .trim();
}

function tag(xml, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? decode(m[1]) : '';
}

/** RSS 2.0 / RDF のテキスト → 記事一覧（純粋関数・テスト対象） */
export function parseRss(xml, allowedHosts, limit = 30) {
  const items = [];
  const re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < limit) {
    const body = m[1];
    const title = tag(body, 'title');
    const link = tag(body, 'link');
    const date = tag(body, 'pubDate') || tag(body, 'dc:date');
    if (!title || !isAllowedLink(link, allowedHosts)) continue;
    const t = date ? Date.parse(date) : NaN;
    items.push({ title, link, date: Number.isFinite(t) ? t : null });
  }
  return items;
}

export function isAllowedLink(link, allowedHosts) {
  try {
    const u = new URL(link);
    return (u.protocol === 'https:' || u.protocol === 'http:') && (!allowedHosts || allowedHosts.includes(u.hostname));
  } catch (_) {
    return false;
  }
}

export async function fetchNews(src) {
  const feed = NEWS_FEEDS[src];
  if (!feed) throw new Error('不明なニュースソース');
  const res = await fetch(feed.url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseRss(await res.text(), feed.hosts);
  if (!items.length) throw new Error('記事がありません');
  return items;
}
