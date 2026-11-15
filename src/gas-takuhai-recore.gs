/**
 * 宅配買取 見積書 → RECORE 入力ツール用の読み取り口（読むだけ。見積書には一切書き込まない）
 * GAS プロジェクト名：「宅配見積書 読み取り（RECORE入力用）」
 * デプロイ：ウェブアプリ／実行ユーザー＝自分／アクセス＝全員
 * KEY＝合言葉（ツール側で初回に1回だけ入力。公開リポジトリには入れない）
 *
 * ?key=..&action=list            → お客様タブの一覧
 * ?key=..&action=get&sheet=タブ名 → そのタブの明細（カード名・金額・数量・状態・備考）
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
  var vals = sh.getRange(1, 1, Math.min(sh.getMaxRows(), 80), 7).getDisplayValues();
  var raw = sh.getRange(1, 1, Math.min(sh.getMaxRows(), 80), 7).getValues();
  var rows = [], total = null;
  for (var r = 1; r < vals.length; r++) {
    var v = vals[r], w = raw[r];
    if (String(v[3]).trim() === '計') { total = toNum_(w[4], v[4]); break; }
    var name = String(v[1] || '').trim();
    if (!name) continue;
    rows.push({
      no: String(v[0] || '').trim(),
      name: name,
      price: toNum_(w[2], v[2]),
      qty: toNum_(w[3], v[3]),
      state: String(v[5] || '').trim(),
      note: String(v[6] || '').trim()
    });
  }
  return { title: sh.getName(), gid: sh.getSheetId(), rows: rows, total: total };
}

function toNum_(raw, disp) {
  if (typeof raw === 'number') return raw;
  var s = String(disp || raw || '').replace(/[¥￥,，\s円]/g, '');
  if (s === '') return null;
  var n = Number(s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }));
  return isNaN(n) ? null : n;
}
