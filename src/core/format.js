// 数値・日時の書式

export function fmt(n, d = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function sign(n) {
  return n > 0 ? '+' : n < 0 ? '−' : '±';
}

// 符号付きの数値（マイナスは全角風の「−」で表示）
export function signed(n, d = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${sign(n)}${fmt(Math.abs(n), d)}`;
}

export function arrow(n) {
  return n > 0 ? '▲' : n < 0 ? '▼' : '';
}

export function dir(n) {
  if (n == null || !Number.isFinite(n)) return 'flat';
  return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
}

export function autoDigits(price) {
  if (price == null || !Number.isFinite(price)) return 2;
  const a = Math.abs(price);
  if (a >= 10000) return 0;
  if (a >= 1000) return 1;
  return 2;
}

export function stockDigits(price) {
  if (price == null) return 0;
  return Math.abs(price) >= 1000 ? 0 : 1;
}

export function fmtYen(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('ja-JP')}円`;
}

export function fmtVolume(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1e8) return `${fmt(n / 1e8, 1)}億`;
  if (n >= 1e4) return `${fmt(n / 1e4, 0)}万`;
  return fmt(n, 0);
}

const TZ = 'Asia/Tokyo';

export function fmtTime(ms, withSec = false) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('ja-JP', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit', second: withSec ? '2-digit' : undefined });
}

export function fmtDateTimeShort(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('ja-JP', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 「40秒前」「3分前」など
export function ago(ms, now = Date.now()) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

// 残り時間「2時間15分」
export function duration(ms) {
  if (ms == null || ms < 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}時間${m % 60 ? `${m % 60}分` : ''}`;
  return `${Math.floor(h / 24)}日`;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
