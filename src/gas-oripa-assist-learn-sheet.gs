/** オリパ作成アシスト用（学習・店舗オリパシートへの書き出し）。呼び出しはコード.gsの doGet / doPost にある action=learn / oripatabs / oripasheet から */
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
    sh = ss.insertSheet(nm, ss.getSheets().length); fresh = true;
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
  var ss = SpreadsheetApp.openById(prop('SHEET_ID')), sh = ss.getSheetByName('オリパ学習');
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
