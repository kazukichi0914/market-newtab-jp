// 主要な経済イベント（手動で年次更新する）
// 出典: 日本銀行「金融政策決定会合等の日程」、FRB「Meeting calendars」（2026-11-12 改定版）
// 日程は各機関の都合で変更されることがある。time は日本時間（目安）。
// importance: 3 = 最重要, 2 = 重要, 1 = 参考

export const EVENTS_UPDATED = '2026-11-20';

export const EVENTS = [
  // 2026 年残り
  { date: '2026-12-09', time: '', region: 'US', title: 'FOMC（1日目）', importance: 2 },
  { date: '2026-12-10', time: '04:00', region: 'US', title: 'FOMC 政策金利発表', importance: 3 },
  { date: '2026-12-17', time: '', region: 'JP', title: '日銀 金融政策決定会合（1日目）', importance: 2 },
  { date: '2026-12-18', time: '昼頃', region: 'JP', title: '日銀 金融政策決定会合 結果発表', importance: 3 },
  { date: '2026-12-30', time: '', region: 'JP', title: '大納会', importance: 1 },

  // 2027 年 日銀
  { date: '2027-01-04', time: '', region: 'JP', title: '大発会', importance: 1 },
  { date: '2027-01-22', time: '昼頃', region: 'JP', title: '日銀 金融政策決定会合 結果発表（展望レポート）', importance: 3 },
  { date: '2027-03-18', time: '昼頃', region: 'JP', title: '日銀 金融政策決定会合 結果発表', importance: 3 },
  { date: '2027-04-28', time: '昼頃', region: 'JP', title: '日銀 金融政策決定会合 結果発表（展望レポート）', importance: 3 },
  { date: '2027-06-11', time: '昼頃', region: 'JP', title: '日銀 金融政策決定会合 結果発表', importance: 3 },
  { date: '2027-07-22', time: '昼頃', region: 'JP', title: '日銀 金融政策決定会合 結果発表（展望レポート）', importance: 3 },
  { date: '2027-09-22', time: '昼頃', region: 'JP', title: '日銀 金融政策決定会合 結果発表', importance: 3 },
  { date: '2027-10-29', time: '昼頃', region: 'JP', title: '日銀 金融政策決定会合 結果発表（展望レポート）', importance: 3 },
  { date: '2027-12-17', time: '昼頃', region: 'JP', title: '日銀 金融政策決定会合 結果発表', importance: 3 },

  // 2027 年 FOMC（発表は最終日の米東部 14:00 = 日本時間 翌 3:00〜4:00）
  { date: '2027-01-28', time: '04:00', region: 'US', title: 'FOMC 政策金利発表', importance: 3 },
  { date: '2027-03-18', time: '03:00', region: 'US', title: 'FOMC 政策金利発表', importance: 3 },
  { date: '2027-04-29', time: '03:00', region: 'US', title: 'FOMC 政策金利発表', importance: 3 },
  { date: '2027-06-10', time: '03:00', region: 'US', title: 'FOMC 政策金利発表', importance: 3 },
  { date: '2027-07-29', time: '03:00', region: 'US', title: 'FOMC 政策金利発表', importance: 3 },
  { date: '2027-09-16', time: '03:00', region: 'US', title: 'FOMC 政策金利発表', importance: 3 },
  { date: '2027-10-28', time: '03:00', region: 'US', title: 'FOMC（戦略討議・定例の政策発表なし）', importance: 1 },
  { date: '2027-11-18', time: '04:00', region: 'US', title: 'FOMC 政策金利発表', importance: 3 },
];
