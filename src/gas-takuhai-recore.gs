/**
 * 宅配買取 見積書 → RECORE 入力ツール用の読み取り口（読むだけ。見積書には一切書き込まない）
 * GAS プロジェクト名：「宅配見積書 読み取り（RECORE入力用）」
 * デプロイ：ウェブアプリ／実行ユーザー＝自分／アクセス＝全員
 * KEY＝合言葉（ツール側で初回に1回だけ入力。公開リポジトリには入れない）
 *
 * ?key=..&action=list            → お客様タブの一覧
 * ?key=..&action=get&sheet=タブ名 → そのタブの明細（カード名・金額・数量・状態・備考）。査定金額の列があるタブは price＝査定金額、applied＝お申込時の金額
 */
var SS_ID = '1BBESQZWxdsij1q8hIk_klPgw6RbYL4MonIV6CyKXWz8';
var KEY = '__KEY__';
var SKIP = /^(原本|原本 のコピー|申込一覧（サイト）|広告集計（サイト）)$/;

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    if (p.key !== KEY) throw new Error('合言葉が違います');
    if (p.action === 'list') out = { ok: true, tabs: listTabs_() };
    else if (p.action === 'get') out = { ok: true, tab: getTab_(p.sheet) };
    else throw new Error('action がありません');
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function listTabs_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  return ss.getSheets().map(function (sh, i) {
    return { title: sh.getName(), gid: sh.getSheetId(), idx: i };
  }).filter(function (t) { return !SKIP.test(t.title); });
}

function getTab_(title) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(String(title || ''));
  if (!sh) throw new Error('タブが見つかりません：' + title);
  var n = Math.min(sh.getMaxRows(), 400);
  var vals = sh.getRange(1, 1, n, 8).getDisplayValues();
  var raw = sh.getRange(1, 1, n, 8).getValues();
  // 新レイアウト（2026/11/15〜）：C お申込時の金額 / D 査定金額 / E 数量 / F 小計 / G 状態 / H 備考
  var nw = String(vals[0][3]).trim() === '査定金額';
  var C = nw ? { price: 3, applied: 2, qty: 4, sub: 5, state: 6, note: 7, totalLabel: 4 } : { price: 2, applied: -1, qty: 3, sub: 4, state: 5, note: 6, totalLabel: 3 };
  var rows = [], total = null;
  for (var r = 1; r < vals.length; r++) {
    var v = vals[r], w = raw[r];
    if (String(v[C.totalLabel]).trim() === '計') { total = toNum_(w[C.sub], v[C.sub]); break; }
    var name = String(v[1] || '').trim();
    if (!name) continue;
    rows.push({
      no: String(v[0] || '').trim(),
      name: name,
      price: toNum_(w[C.price], v[C.price]),
      applied: C.applied >= 0 ? toNum_(w[C.applied], v[C.applied]) : null,
      qty: toNum_(w[C.qty], v[C.qty]),
      state: String(v[C.state] || '').trim(),
      note: String(v[C.note] || '').trim()
    });
  }
  return { title: sh.getName(), gid: sh.getSheetId(), layout: nw ? 'satei' : 'old', rows: rows, total: total };
}

function toNum_(raw, disp) {
  if (typeof raw === 'number') return raw;
  var s = String(disp || raw || '').replace(/[¥￥,，\s円]/g, '');
  if (s === '') return null;
  var n = Number(s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }));
  return isNaN(n) ? null : n;
}
