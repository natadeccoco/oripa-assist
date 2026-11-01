/**
 * オリパ作成アシスト専用（2026/10/31〜）
 *  ・スタッフの手直しの学習（action=learn）… 記録先はスプレッドシート「オリパ承認履歴」の「オリパ学習」タブ
 *  ・店舗オリパシートへの書き出し（action=oripatabs / oripasheet）
 * ほかのツールのGAS（オリパ本部承認など）とは別のプロジェクトにして、上書きで消えないようにしている。
 * 店舗オリパシートを足すときは、スクリプト プロパティ ORIPA_SHEETS に {"柏":"シートID", ...} を入れる。
 */
var P = PropertiesService.getScriptProperties();
var LEARN_BOOK = '1z6wyeti5dCLpo78bbuT-WUa_5PpSSdRuI6boRHig5EE'; // オリパ承認履歴
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'learn') return json({ ok: true, scores: learnScores() });
    if (p.action === 'oripatabs') return json(oripaTabs(String(p.store || '')));
    return json({ ok: true, app: 'オリパ作成アシスト' });
  } catch (err) { return json({ ok: false, error: String(err && err.message || err) }); }
}
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action === 'learn') return json(learnPost(d));
    if (d.action === 'oripasheet') return json(oripaWrite(d));
    if (d.action === 'tiktoksheet') return json(tiktokWrite(d));
    return json({ ok: false, error: 'unknown action' });
  } catch (err) { return json({ ok: false, error: String(err && err.message || err) }); }
}
/** 最初に1回だけ実行して、権限を許可する（シートが読めるか確かめる） */
function setupCheck() { Logger.log(SpreadsheetApp.openById(LEARN_BOOK).getName()); Logger.log(oripaTabs('津田沼').name); Logger.log(SpreadsheetApp.openById(TIKTOK_BOOK).getName()); }

/* ---------- 店舗オリパシートへの書き出し（オリパ作成アシスト）：店舗ごとのスプレッドシート（スクリプト プロパティ ORIPA_SHEETS に {"津田沼":"シートID"}）の指定タブに、ほかのオリパと同じ形でブロックを足す ---------- */
function oripaSheets() { var o = { '津田沼': '1ViS8Der6dWCMNi8Z6mx35MAybv11BDI6JTa6sC2YlZc' }; try { var x = JSON.parse(P.getProperty('ORIPA_SHEETS') || '{}'); Object.keys(x).forEach(function (k) { o[k] = x[k]; }); } catch (e) { } return o; } // 店舗名 → 店舗オリパシートのID（ほかの店はスクリプト プロパティ ORIPA_SHEETS で足せる）
function oripaTabs(store) {
  var id = oripaSheets()[store]; if (!id) return { ok: false, error: store + '店の店舗オリパシートがまだ登録されていません（本部に連絡してください）' };
  var ss = SpreadsheetApp.openById(id);
  return { ok: true, name: ss.getName(), tabs: ss.getSheets().map(function (s) { return s.getName(); }) };
}
function oripaWrite(d) {
  var id = oripaSheets()[d.store]; if (!id) return { ok: false, error: d.store + '店の店舗オリパシートがまだ登録されていません' };
  var ss = SpreadsheetApp.openById(id), sh, fresh = false;
  if (d.newTab) { // 新しいタブを作って書き出す（同じ名前があれば（2）（3）…を付ける）
    var base0 = String(d.newTab).replace(/[\[\]\*\?\/\\:]/g, ' ').trim().slice(0, 90) || 'オリパ', nm = base0, k = 2;
    while (ss.getSheetByName(nm)) nm = base0 + '（' + (k++) + '）';
    sh = ss.insertSheet(nm, 0); fresh = true; // いちばん左に作る
  } else sh = ss.getSheetByName(String(d.tab || ''));
  if (!sh) return { ok: false, error: 'タブ「' + d.tab + '」が見つかりません' };
  var lr = sh.getLastRow(), vals = lr ? sh.getRange(1, 1, lr, 7).getDisplayValues() : [];
  var last = 0, vol = 0, blocks = 0, cond = fresh && !!d.withCond;
  vals.forEach(function (r, i) {
    if (r.some(function (c) { return String(c).trim() !== ''; })) last = i + 1;
    var a = String(r[0]); if (a.indexOf('円') >= 0 && r[1] === 'ラストワン') { blocks++; var m = a.match(/Vol\.?\s*(\d+)|第\s*(\d+)\s*弾/); if (m) vol = Math.max(vol, Number(m[1] || m[2])); }
    if (r[1] === 'ラストワン' && /^[ＡＢＣＤA-D][-－]?$/.test(String(r[3]).trim())) cond = true;
    if (String(r[3]).trim() === '状態') cond = true;
  });
  var now = new Date(), ymd = Utilities.formatDate(now, 'Asia/Tokyo', 'yy.M.d');
  var title = d.store + d.price + '円　' + (d.label ? d.label + '　' : '') + d.init + '口' + (fresh ? '' : '　Vol.' + (Math.max(vol, blocks) + 1)) + '（' + ymd + '）';
  var s = last ? last + 3 : 3, rows = [], C = cond ? 1 : 0;
  if (fresh) sh.getRange(2, 1, 1, 6 + C).setValues([cond ? ['', '', '商品', '状態', '原価', '個数', '合計'] : ['', '', '商品', '原価', '個数', '合計']]);
  var items = (d.rows || []).slice();
  var lastOne = items.filter(function (r) { return r.role === 'ラストワン'; });
  var others = items.filter(function (r) { return r.role !== 'ラストワン'; });
  var list = lastOne.concat(others);
  if (d.fillerN > 0) { list.push({ name: '下枠', cond: '', cost: Math.round(d.fillerCost), n: 1 }); if (d.fillerN > 1) list.push({ name: '', cond: '', cost: '', n: d.fillerN - 1, rest: true }); }
  list.forEach(function (r, i) {
    var row = s + i, a = i === 0 ? title : '', b = i === 0 && lastOne.length ? 'ラストワン' : '';
    var cells = [a, b, r.name || ''];
    if (cond) cells.push(r.cond || '');
    cells.push(r.cost === '' ? '' : Math.round(Number(r.cost) || 0), Number(r.n) || 0);
    cells.push(cond ? '=E' + row + '*F' + row : '=D' + row + '*E' + row);
    rows.push(cells);
  });
  var end = s + list.length - 1, f0 = lastOne.length ? s + 1 : s;
  var L = cond ? 'F' : 'E', S = cond ? 'G' : 'F', base = end + 1;
  var foot = [['販売口数', '=SUM(' + L + f0 + ':' + L + end + ')'], ['販売単価', Number(d.price) || 0], ['売上', '=' + L + base + '*' + L + (base + 1)],
    ['原価', '=SUM(' + S + s + ':' + S + end + ')'], ['粗利益', '=' + L + (base + 2) + '-' + L + (base + 3)], ['粗利益率', '=' + L + (base + 4) + '/' + L + (base + 2)]];
  var w = 6 + C;
  sh.getRange(s, 1, rows.length, w).setValues(rows);
  var fr = foot.map(function (f) { var r = []; for (var k = 0; k < w - 2; k++) r.push(''); r[w - 3] = f[0]; r.push(f[1]); return r.slice(0, w - 1); });
  sh.getRange(base, 1, fr.length, w - 1).setValues(fr);
  sh.getRange(base + 5, w - 1).setNumberFormat('0.0%');
  return { ok: true, tab: sh.getName(), row: s, title: title, url: ss.getUrl() + '#gid=' + sh.getSheetId() + '&range=A' + s };
}

/* ---------- オリパの学習：スタッフが提案から外した・足した・残したものを数え、次の提案に生かす ---------- */
function learnSheet() {
  var ss = SpreadsheetApp.openById(LEARN_BOOK), sh = ss.getSheetByName('オリパ学習');
  if (!sh) { sh = ss.insertSheet('オリパ学習'); sh.appendRow(['日時', '店舗', '価格帯', '値段', '結果', '商品キー', '商品名', 'メモ']); sh.setFrozenRows(1); }
  return sh;
}
function learnScores() {
  var c = CacheService.getScriptCache(), v = c.get('learn1'); if (v) return JSON.parse(v);
  var sh = learnSheet(), n = sh.getLastRow(), out = {};
  if (n > 1) sh.getRange(2, 1, n - 1, 6).getValues().forEach(function (r) {
    var b = String(r[2]), k = String(r[5]), w = r[4] === '足した' ? 1 : r[4] === '外した' ? -1 : r[4] === '残した' ? 0.2 : 0;
    if (!b || !k || !w) return; out[b] = out[b] || {}; out[b][k] = Math.round(((out[b][k] || 0) + w) * 10) / 10;
  });
  try { c.put('learn1', JSON.stringify(out), 600); } catch (e) { }
  return out;
}

/* オリパ作成アシスト：一時保存のとき、最初の提案から外した・足したものを記録 */
function learnPost(d) {
  var lr = (d.rows || []).slice(0, 80); if (!lr.length) return { ok: true };
  var now = new Date();
  learnSheet().getRange(learnSheet().getLastRow() + 1, 1, lr.length, 8).setValues(lr.map(function (r) { return [now, String(d.store || ''), String(d.base || ''), Number(d.price) || '', String(r.r || ''), String(r.k || ''), String(r.name || ''), '']; }));
  CacheService.getScriptCache().remove('learn1');
  return { ok: true };
}

/* ---------- 全店オリパ：「TikTokオリパシート」のいちばん左に、日付のタブを作って書き出す ---------- */
var TIKTOK_BOOK = '1khTu7sDwIdup4OxbnYO-X02cCYXa3wORWYTD2zmTJ1o'; // TikTokオリパシート
var TIKTOK_TPL = '千葉中央店　3000円オリパ'; // 見た目の元にするタブ
function tiktokWrite(d) {
  var ss = SpreadsheetApp.openById(TIKTOK_BOOK);
  var base0 = String(d.tab || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy.M.d')).replace(/[\[\]\*\?\/\\:]/g, '.'), nm = base0, k = 2;
  while (ss.getSheetByName(nm)) nm = base0 + '（' + (k++) + '）';
  var tpl = ss.getSheetByName(TIKTOK_TPL) || ss.getSheets()[0]; // ほかのタブと同じ見た目にするため、いつものタブを元にして作る
  var sh = ss.insertSheet(nm, 0, { template: tpl });
  var mr = sh.getMaxRows(), mc = sh.getMaxColumns();
  sh.getRange(1, 1, 1, mc).clearContent();
  if (mr > 1) sh.getRange(2, 1, mr - 1, mc).clearContent().clearDataValidations().clearFormat();
  var yen = '[$¥-411]#,##0', yen2 = '¥#,##0;[Red]-¥#,##0';
  var items = (d.rows || []).slice();
  var lastOne = items.filter(function (r) { return r.role === 'ラストワン'; }), others = items.filter(function (r) { return r.role !== 'ラストワン'; });
  var list = lastOne.map(function (r) { return { name: '【ラストワン】' + r.name, cond: r.cond, cost: r.cost, n: r.n, store: r.store }; }).concat(others);
  if (d.fillerN > 0) list.push({ name: '下枠', cond: '', cost: Math.round((Number(d.fillerCost) || 0) / d.fillerN), n: d.fillerN, store: d.fillerStore || '' });
  var out = [[String(d.title || ('TikTok' + d.price)), '商品名', '状態', '原価', '個数', '総額', '店舗', '到着チェック']];
  list.forEach(function (r, i) { var row = i + 2; out.push(['', r.name || '', r.cond || '', Math.round(Number(r.cost) || 0), Number(r.n) || 0, '=D' + row + '*E' + row, r.store || '', false]); });
  var end = list.length + 1;
  sh.getRange(1, 1, out.length, 8).setValues(out);
  sh.getRange(2, 4, list.length, 1).setNumberFormat(yen); sh.getRange(2, 6, list.length, 1).setNumberFormat(yen);
  sh.getRange(2, 8, list.length, 1).insertCheckboxes();
  sh.getRange(2, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('販売日を入力（例: 2026/10/30）').build()).setNumberFormat('"販売日 "yyyy/mm/dd');
  var b = end + 1;
  var foot = [['原価合計', '=SUM(F2:F' + end + ')'], ['販売口数', '=SUM(E' + (2 + lastOne.length) + ':E' + end + ')'] /* ラストワン賞の行は口数に入れない */, ['販売単価', Number(d.price) || 0], ['売上', '=F' + (b + 1) + '*F' + (b + 2)],
    ['手数料(7%)', '=F' + (b + 3) + '*0.07'], ['利益', '=F' + (b + 3) + '-F' + b + '-F' + (b + 4)], ['粗利益率', '=IFERROR(F' + (b + 5) + '/F' + (b + 3) + ',0)']];
  sh.getRange(b, 5, foot.length, 2).setValues(foot);
  sh.getRange(b, 6, foot.length, 1).setNumberFormat(yen2); sh.getRange(b + 1, 6).setNumberFormat('0'); sh.getRange(b + 6, 6).setNumberFormat('0.00%');
  var res = { ok: true, tab: sh.getName(), url: ss.getUrl() + '#gid=' + sh.getSheetId() };
  if (d.origin && d.origin.length) { try { var o = originWrite(d, sh.getName()); res.originUrl = o.url; res.originTab = o.tab; } catch (e) { res.originError = String(e && e.message || e); } }
  return res;
}

/* ---------- 全店オリパ：どの店舗から来たカードかの一覧（ドライブ「ツール」フォルダの「全店オリパ カードの出どころ一覧」） ---------- */
var ORIGIN_BOOK = '1s5mlyERzuB-szuulJ0M9xl6VhGnOsovi86_vGNGugow';
var STORE_ORDER = ['柏', '津田沼', '松戸', '横浜', '中野', '町田', '千葉中央', '通販', 'お台場'];
var ROLE_ORDER = ['TOP', '大当たり', '中当たり', '当たり', '小当たり', 'ラストワン', '下枠'];
function originWrite(d, tabName) {
  var ss = SpreadsheetApp.openById(ORIGIN_BOOK), yen = '[$¥-411]#,##0';
  var rows = (d.origin || []).slice().sort(function (a, b) {
    var sa = STORE_ORDER.indexOf(a.store), sb = STORE_ORDER.indexOf(b.store); sa = sa < 0 ? 99 : sa; sb = sb < 0 ? 99 : sb;
    return sa - sb || String(a.store).localeCompare(String(b.store)) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || (b.cost || 0) - (a.cost || 0);
  });
  var title = String(d.title || ('TikTok' + d.price)), day = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  // 1) オリパごとのタブ（いちばん左）：店舗ごとにまとめる
  var nm = String(tabName || day).slice(0, 90), k = 2, base0 = nm; while (ss.getSheetByName(nm)) nm = base0 + '（' + (k++) + '）';
  var sh = ss.insertSheet(nm, 0);
  var out = [[title + '　' + d.price + '円×' + d.init + '口（' + day + '）', '', '', '', '', '', '', '', ''], ['店舗', '区分', '商品名', '状態', '個数', '原価', '総額', 'マスタ', '到着チェック']];
  var cur = null, blocks = [];
  rows.forEach(function (r) {
    if (r.store !== cur) { cur = r.store; blocks.push(out.length + 1); }
    var row = out.length + 1;
    out.push([r.store || '?', r.role || '', r.name || '', r.cond || '', Number(r.n) || 0, Math.round(Number(r.cost) || 0), '=E' + row + '*F' + row, Math.round(Number(r.sell) || 0), false]);
  });
  sh.getRange(1, 1, out.length, 9).setValues(out);
  var n = rows.length;
  if (n) { sh.getRange(3, 6, n, 3).setNumberFormat(yen); sh.getRange(3, 9, n, 1).insertCheckboxes(); }
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13); sh.getRange(2, 1, 1, 9).setFontWeight('bold').setBackground('#f3f1ea'); sh.setFrozenRows(2);
  blocks.forEach(function (r, i) { if (i % 2 === 0) return; var end = (blocks[i + 1] || out.length + 1) - 1; sh.getRange(r, 1, end - r + 1, 9).setBackground('#fbfaf6'); });
  // 店舗ごとの合計（右側）
  var stores = []; rows.forEach(function (r) { if (stores.indexOf(r.store) < 0) stores.push(r.store); });
  var sum = [['店舗', '点数', '原価計']].concat(stores.map(function (st) { return [st, '=SUMIF(A3:A' + (n + 2) + ',"' + st + '",E3:E' + (n + 2) + ')', '=SUMPRODUCT((A3:A' + (n + 2) + '="' + st + '")*G3:G' + (n + 2) + ')']; }));
  sh.getRange(2, 11, sum.length, 3).setValues(sum); sh.getRange(2, 11, 1, 3).setFontWeight('bold').setBackground('#f3f1ea'); sh.getRange(3, 13, stores.length, 1).setNumberFormat(yen);
  sh.setColumnWidth(3, 320);
  // 2) すべての履歴（あとで店舗やカード名で探せるように）
  var all = ss.getSheetByName('すべての履歴');
  if (!all) { all = ss.insertSheet('すべての履歴'); all.appendRow(['日付', 'オリパ', '店舗', '区分', '商品名', '状態', '個数', '原価', 'マスタ']); all.setFrozenRows(1); all.getRange(1, 1, 1, 9).setFontWeight('bold'); }
  var deflt = ss.getSheetByName('シート1'); if (deflt && deflt.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(deflt);
  if (n) all.getRange(all.getLastRow() + 1, 1, n, 9).setValues(rows.map(function (r) { return [day, title + ' ' + d.price + '円×' + d.init + '口', r.store || '', r.role || '', r.name || '', r.cond || '', Number(r.n) || 0, Math.round(Number(r.cost) || 0), Math.round(Number(r.sell) || 0)]; }));
  return { tab: sh.getName(), url: ss.getUrl() + '#gid=' + sh.getSheetId() };
}
