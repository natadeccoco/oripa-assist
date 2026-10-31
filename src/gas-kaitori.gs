/**
 * 買取チェック（LINE WORKS）  ※「オリパ本部承認（LINE WORKS）」と同じGASプロジェクトに入れるファイル
 * 店舗のマイカ画面で動く「買取チェック」ツールから呼ばれる。
 *   GET  ?action=kprices  … 買取表スプレッドシートの全タブの価格（ツールが突き合わせに使う）
 *   GET  ?action=kconfig  … 承認ライン（店舗別・スタッフ別）
 *   GET  ?action=kstatus&id=… … 承認依頼の結果／&tx=マイカ取引ID … その買取の最新の依頼・確認
 *   POST {action:'kaitori', kind:'approval'|'confirm'|'check', …} … 承認依頼は店舗のグループへ（中身は1枚の画像）／警告の確認・最終チェックは記録だけ
 * LINE WORKSのボタン：postback 'kapprove:ID' / 'kreject:ID'（callback() から kaitoriCallback() に回す）
 * 履歴は「オリパ承認履歴」スプレッドシート（SHEET_ID）の「買取」タブ、設定は「買取設定」タブ。
 */
var KAITORI_SHEET_ID = '1gtUjjGDQvFAE2PR_QDe343wFHS48PbqcHuuLTmT-4YQ'; // ナタデココ買取表(MM/DD)
var K_SKIP_TABS = /バックアップ|^シート\d+$|最低保証/;
var K_COLS = ['依頼番号', '日時', '種類', '店舗', '依頼者', 'お客様', '買取合計', '承認ライン', '警告数', '内容', '警告', 'コメント', '状態', '判断した人', '判断日時', 'マイカ取引ID', '担当スタッフ', '明細データ', '差し戻し内容', '差し戻しキー'];
var K_DEFAULT_LINE = 50000;

function kBook() { return SpreadsheetApp.openById(prop('SHEET_ID')); }
function kSheet() {
  var ss = kBook(), sh = ss.getSheetByName('買取');
  if (!sh) { sh = ss.insertSheet('買取'); sh.appendRow(K_COLS); sh.setFrozenRows(1); }
  if (sh.getRange(1, 18).getValue() !== K_COLS[17]) sh.getRange(1, 18, 1, 3).setValues([K_COLS.slice(17, 20)]); // 差し戻し用の列（あとから追加）
  return sh;
}
function kSettingSheet() {
  var ss = kBook(), sh = ss.getSheetByName('買取設定');
  if (!sh) {
    sh = ss.insertSheet('買取設定');
    sh.getRange(1, 1, 1, 3).setValues([['【店舗の承認ライン】店舗', '買取合計がこの金額以上なら本部承認', 'メモ']]);
    var stores = ['千葉中央', '柏', '町田', '松戸', '中野', 'お台場', '津田沼', '横浜'];
    sh.getRange(2, 1, stores.length, 2).setValues(stores.map(function (s) { return [s, s === '柏' ? 30000 : 50000]; }));
    sh.getRange(1, 5, 1, 3).setValues([['【スタッフ別の承認ライン】スタッフの名前（ツールで選ぶ名前）', '承認ライン', 'メモ']]);
    sh.getRange(2, 5, 1, 3).setValues([['', 200000, '優秀なスタッフはここに名前を追加（例：200000）']]);
    sh.setFrozenRows(1); sh.autoResizeColumns(1, 7);
  }
  return sh;
}
function kNum(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').replace(/[¥￥,，円\s]/g, '');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/* ---------- 買取表の価格 ---------- */
function kPrices() {
  var ss = SpreadsheetApp.openById(KAITORI_SHEET_ID), out = [];
  ss.getSheets().forEach(function (sh) {
    var tab = sh.getName(); if (K_SKIP_TABS.test(tab)) return;
    var vals = sh.getDataRange().getDisplayValues(); if (vals.length < 2) return;
    var h = vals[0].map(function (x) { return String(x).replace(/\s/g, ''); });
    var col = function (names) { for (var i = 0; i < names.length; i++) { var k = h.indexOf(names[i]); if (k >= 0) return k; } return -1; };
    var cN = col(['カード名', 'ボックス名']), cP = col(['パック型番', 'パック']), cR = col(['レアリティ']), cM = col(['型番']);
    var cY = col(['ナタデココ買取価格', '買取価格（シュリンク有）', '買取価格(シュリンク有)', '買取価格']);
    var cY2 = col(['買取価格（シュリンク無）', '買取価格(シュリンク無)']);
    if (cN < 0 || cY < 0) return;
    var kind = /BOX/.test(tab) ? 'box' : /PSA/.test(tab) ? 'psa' : /強化/.test(tab) ? 'kyouka' : /汎用/.test(tab) ? 'hanyo' : 'card';
    for (var r = 1; r < vals.length; r++) {
      var v = vals[r], n = String(v[cN] || '').replace(/\s+/g, ' ').trim(); if (!n) continue;
      var y = kNum(v[cY]), y2 = cY2 >= 0 ? kNum(v[cY2]) : null;
      if (y == null && y2 == null) continue;
      var o = { t: tab, k: kind, n: n, y: y };
      if (cP >= 0 && v[cP] && v[cP] !== '-') o.p = String(v[cP]).trim();
      if (cR >= 0 && v[cR] && v[cR] !== '-') o.r = String(v[cR]).trim();
      if (cM >= 0 && v[cM] && v[cM] !== '-') o.m = String(v[cM]).trim();
      if (y2 != null) o.y2 = y2;
      out.push(o);
    }
  });
  return out;
}

function kConfig() {
  var vals = kSettingSheet().getDataRange().getValues(), stores = {}, staff = {}, types = {}, staffType = {};
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i];
    if (v[0] && kNum(v[1]) != null) stores[String(v[0]).trim()] = kNum(v[1]);
    if (String(v[4] || '').trim() && kNum(v[5]) != null) staff[String(v[4]).replace(/\s+/g, '')] = kNum(v[5]);
    if (String(v[8] || '').trim() && kNum(v[9]) != null) types[String(v[8]).trim()] = kNum(v[9]); // 【雇用区分の承認ライン】
    if (String(v[11] || '').trim() && String(v[12] || '').trim()) staffType[String(v[11]).replace(/\s+/g, '')] = String(v[12]).trim(); // 【スタッフの区分】
  }
  return { def: K_DEFAULT_LINE, stores: stores, staff: staff, types: types, staffType: staffType };
}

function kaitoriGet(p) {
  if (p.action === 'kreject') return kRejectPage(p); // 差し戻しの内容を書くページ（役員に個別に届くリンク）
  try {
    if (p.action === 'kprices') return json({ ok: true, at: new Date().toISOString(), rows: kPrices() });
    if (p.action === 'kconfig') return json({ ok: true, config: kConfig() });
    if (p.action === 'kstaff') return json(kStaff());
    if (p.action === 'ksnkr') { // 査定表の画像用：PSA10カードのスニダン直近の取引価格（最大6枚）
      var ns = JSON.parse(p.n || '[]').slice(0, 6);
      return json({ ok: true, r: ns.map(function (n) { try { return kIsPsa10(n) ? kSnkrPsa10(n) : null; } catch (e) { return { price: 0, why: '取得できませんでした' }; } }) });
    }
    if (p.action === 'kstatus' && p.tx) { // マイカの取引IDで、その買取の最新の承認依頼・警告の確認を返す（どのPCからでも同じ状態が見える）
      var vals = kSheet().getDataRange().getValues(), ap = null, cf = null;
      for (var i = vals.length - 1; i >= 1 && (!ap || !cf); i--) {
        if (String(vals[i][15]) !== String(p.tx)) continue;
        var v = vals[i], o = { id: v[0], status: v[12], by: v[13] || v[4], at: v[14] ? String(v[14]) : '', requester: v[4], fb: kParse(v[18]) };
        if (v[2] === '承認依頼' && !ap) ap = o; else if (v[2] === '警告の確認' && !cf) cf = o;
      }
      var ck = null, fs = kBook().getSheetByName('最終チェック');
      if (fs && fs.getLastRow() >= 2) { var fv = fs.getRange(2, 1, fs.getLastRow() - 1, 6).getValues(); for (var k = fv.length - 1; k >= 0; k--) if (String(fv[k][4]) === String(p.tx)) { ck = { id: fv[k][0], by: fv[k][5], at: fv[k][1] ? new Date(fv[k][1]).toISOString() : '' }; break; } }
      return json({ ok: true, approval: ap, confirm: cf, check: ck });
    }
    if (p.action === 'kstatus') {
      var row = kFind(p.id); if (!row) return json({ ok: false, error: '依頼が見つかりません' });
      return json({ ok: true, id: row.values[0], status: row.values[12], by: row.values[13], at: row.values[14] ? String(row.values[14]) : '', fb: kParse(row.values[18]) });
    }
    return json({ ok: false, error: '不明な操作です' });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }); }
}

function kFind(id) {
  if (!id) return null;
  var vals = kSheet().getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) if (vals[i][0] === id) return { r: i + 1, values: vals[i] };
  return null;
}
function kSplit(t) { var parts = []; t = String(t || ''); while (t.length > 1900) { var k = t.lastIndexOf('\n', 1900); if (k < 500) k = 1900; parts.push(t.slice(0, k)); t = t.slice(k).replace(/^\n/, ''); } if (t) parts.push(t); return parts; }

function kaitoriPost(d) {
  if (/^daily/.test(d.kind || '')) return kDaily(d); // 全店買取チェック（全店買取チェック.gs）
  if (d.kind === 'check') return kCheck(d);
  var ch = d.store === 'テスト' ? P.getProperty('K_WARN_CHANNEL') : CH[d.store]; // 店舗「テスト」は役員の買取警告グループ（動作確認用）
  if (!ch) return json({ ok: false, error: '店舗「' + d.store + '」のLINE WORKSグループが登録されていません' });
  if (!d.requester) return json({ ok: false, error: '名前を入れてください' });
  var approval = d.kind === 'approval';
  var lock = LockService.getScriptLock(), id; lock.waitLock(20000);
  try {
    if (approval && d.txId) { // 同じ買取（マイカの取引ID）に、承認待ち・承認済みの依頼があれば二重に送らない
      var vs = kSheet().getDataRange().getValues();
      for (var i = vs.length - 1; i >= 1; i--) {
        if (vs[i][2] === '承認依頼' && String(vs[i][15]) === String(d.txId) && (vs[i][12] === '承認待ち' || vs[i][12] === '承認'))
          return json({ ok: true, id: vs[i][0], dup: true, status: vs[i][12], by: vs[i][13] || '' });
      }
    }
    id = (approval ? 'K' : 'C') + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MMdd-HHmmss') + '-' + Math.floor(Math.random() * 90 + 10);
    kSheet().appendRow([id, new Date(), approval ? '承認依頼' : '警告の確認', d.store, d.requester, d.customer || '', Number(d.total) || 0, Number(d.line) || '', Number(d.warnCount) || 0,
      String(d.text || '').slice(0, 45000), String(d.warnText || '').slice(0, 45000), d.comment || '', approval ? '承認待ち' : '確認済み', approval ? '' : d.requester, approval ? '' : new Date(), d.txId || '', d.staff || '', approval ? kLinesJson(d.lines) : '', '', '']);
  } finally { lock.releaseLock(); }
  if (!approval) return json({ ok: true, id: id }); // 警告の確認は査定者向け：記録だけ残し、グループには送らない
  try { kLogLines(id, d); } catch (e) { console.error('査定ログ: ' + e); }
  var yen = function (n) { return Number(n || 0).toLocaleString() + '円'; };
  var head = '【買取承認依頼】' + d.store + '店　依頼者：' + d.requester + '\n' + (d.customer ? d.customer + ' 様　' : '') + yen(d.total) + (d.reason ? '（' + d.reason + '）' : '') + '\n依頼番号：' + id;
  var imgErr = '';
  var snk = ''; try { snk = kSnkrText(d.lines); } catch (e) { console.error('スニダン: ' + e); }
  send(ch, { type: 'text', text: (head + (d.comment ? '\nコメント：' + d.comment : '') + snk).slice(0, 1990) });
  var sentSheet = false;
  if (d.image) { try { send(ch, { type: 'image', fileId: uploadImage(d.image, 'kaitori_' + id + '.jpg') }); sentSheet = true; } catch (e) { imgErr = String(e.message || e); console.error(imgErr); } }
  if (!sentSheet && d.text) kSplit('［明細］\n' + d.text).forEach(function (x) { send(ch, { type: 'text', text: x }); });
  (d.images || []).slice(0, 10).forEach(function (b64, i) {
    try { send(ch, { type: 'image', fileId: uploadImage(b64, 'kaitori_' + id + '_photo' + (i + 1) + '.jpg') }); } catch (e) { imgErr = String(e.message || e); console.error(imgErr); }
  });
  send(ch, { type: 'button_template', contentText: '依頼番号 ' + id + '（' + d.store + '店・' + yen(d.total) + '）の買取を承認しますか？',
    actions: [{ type: 'message', label: '承認する', text: '承認する（' + id + '）', postback: 'kapprove:' + id },
              { type: 'message', label: '差し戻す', text: '差し戻す（' + id + '）', postback: 'kreject:' + id }] });
  return json({ ok: true, id: id, imageErr: imgErr });
}

function kaitoriCallback(ev, data) {
  var m = String(data).match(/^k(approve|reject):(.+)$/); if (!m) return;
  var userId = ev.source && ev.source.userId, ch = ev.source && ev.source.channelId;
  var approvers = (P.getProperty('LW_APPROVERS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  if (approvers.length && approvers.indexOf(userId) < 0) { if (ch) send(ch, { type: 'text', text: '承認・差し戻しができるのは役員だけです。' }); return; }
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var row = kFind(m[2]); if (!row) return;
    var name = userName(userId);
    if (row.values[12] !== '承認待ち') { if (ch) send(ch, { type: 'text', text: '依頼番号 ' + m[2] + ' はすでに「' + row.values[12] + '」です（' + row.values[13] + '）。' }); return; }
    if (m[1] === 'reject') { // 差し戻し：押したグループに「差し戻し内容を書く」ボタンを出し、カードごとの指示を書いてもらう
      var old = String(row.values[19] || '').split('|'), key = old[0] && old[1] === userId ? old[0] : Utilities.getUuid().replace(/-/g, '').slice(0, 16);
      if (key !== old[0]) kSheet().getRange(row.r, 20).setValue(key + '|' + userId);
      var url = WEBAPP_URL + '?action=kreject&id=' + encodeURIComponent(m[2]) + '&k=' + key;
      var msg = { type: 'button_template', contentText: '↩️ 依頼番号 ' + m[2] + '（' + row.values[3] + '店・' + Number(row.values[6] || 0).toLocaleString() + '円）を差し戻します。下のボタンから、どのカードをどうするか（価格・買取しない・状態・枚数）を書いてください。（' + name + '）',
        actions: [{ type: 'uri', label: '差し戻し内容を書く', uri: url }] };
      try { if (ch) send(ch, msg); else sendUser(userId, msg); }
      catch (e) { // ボタンを送れないときは、今までどおりすぐ差し戻す
        console.error('差し戻しボタン: ' + e);
        kSheet().getRange(row.r, 13, 1, 3).setValues([['差し戻し', name, new Date()]]);
        if (ch) send(ch, { type: 'text', text: '↩️ 買取を差し戻しました（依頼番号 ' + m[2] + '・' + name + '）\n直してほしい点をこのトークで伝えてください。' });
      }
      return;
    }
    var st = m[1] === 'approve' ? '承認' : '差し戻し';
    kSheet().getRange(row.r, 13, 1, 3).setValues([[st, name, new Date()]]);
    try { kSummary(); } catch (e) { console.error('査定集計: ' + e); }
    if (ch) send(ch, { type: 'text', text: (st === '承認' ? '✅ 買取を承認しました' : '↩️ 買取を差し戻しました') + '（依頼番号 ' + m[2] + '・' + name + '）' +
      (st === '承認' ? '' : '\n直してほしい点をこのトークで伝えてください。') });
  } finally { lock.releaseLock(); }
}

/* ---------- 出勤者（店舗やることリストの「出勤予定」「スタッフ」タブ）：最終チェックの名前の候補 ---------- */
var K_TODO_SHEET_ID = '1BbIlbu2ztwmp571SQQiXrX-gaDWlzA9Gx0gFRNio64Q';
var K_STORE_KEY = { chibachuo: '千葉中央', kashiwa: '柏', machida: '町田', matsudo: '松戸', nakano: '中野', odaiba: 'お台場', tsudanuma: '津田沼', yokohama: '横浜' };
function kStaff() {
  var day = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var c = CacheService.getScriptCache(), hit = c.get('kstaff_' + day); if (hit) return JSON.parse(hit);
  var ss = SpreadsheetApp.openById(K_TODO_SHEET_ID), today = {}, all = {};
  var add = function (m, k, n) { var s = K_STORE_KEY[k] || k; n = String(n || '').trim(); if (!n) return; (m[s] = m[s] || []); if (m[s].indexOf(n) < 0) m[s].push(n); };
  var sh = ss.getSheetByName('出勤予定');
  if (sh && sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (v) {
    var d = v[0] instanceof Date ? Utilities.formatDate(v[0], 'Asia/Tokyo', 'yyyy-MM-dd') : String(v[0]);
    if (d === day) add(today, v[1], v[2]);
  });
  var st = ss.getSheetByName('スタッフ');
  if (st && st.getLastRow() >= 2) st.getRange(2, 1, st.getLastRow() - 1, 3).getValues().forEach(function (v) {
    if (String(v[2]).trim() === 'FALSE' || String(v[2]).trim() === '無効') return; add(all, v[0], v[1]);
  });
  var out = { ok: true, day: day, today: today, all: all };
  try { c.put('kstaff_' + day, JSON.stringify(out), 600); } catch (e) { }
  return out;
}

/* ---------- 最終チェック（すべての買取で、査定した人が「確認しました」を押した記録） ---------- */
var K_CHK_COLS = ['記録番号', 'チェック日時', '店舗', '受付番号', 'マイカ取引ID', '査定者', 'お客様', '買取合計', '行数', '点数', '🚨', '⚠️', '本部承認', '枚数確認', 'タイミング', '警告', '明細'];
function kChkSheet() {
  var ss = kBook(), sh = ss.getSheetByName('最終チェック');
  if (!sh) { sh = ss.insertSheet('最終チェック'); sh.getRange(1, 1, 1, K_CHK_COLS.length).setValues([K_CHK_COLS]).setFontWeight('bold').setBackground('#efede7'); sh.setFrozenRows(1); }
  return sh;
}
function kCheck(d) {
  if (!d.requester) return json({ ok: false, error: '名前を入れてください' });
  if (!d.store) return json({ ok: false, error: '店舗がわかりません' });
  var id = 'F' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MMdd-HHmmss') + '-' + Math.floor(Math.random() * 90 + 10);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = kChkSheet();
    sh.appendRow([id, new Date(), d.store, d.reception || '', d.txId || '', d.requester, d.customer || '', Number(d.total) || 0, Number(d.rows) || 0, Number(d.points) || 0,
      Number(d.red) || 0, Number(d.yel) || 0, d.need ? '必要' : '不要', d.countChecked ? '確認済み' : '', d.paid ? '支払い後' : '支払い前',
      String(d.warnText || '').slice(0, 45000), String(d.text || '').slice(0, 45000)]);
    sh.getRange(sh.getLastRow(), 2).setNumberFormat('yyyy/MM/dd HH:mm'); sh.getRange(sh.getLastRow(), 8).setNumberFormat('#,##0"円"');
  } finally { lock.releaseLock(); }
  return json({ ok: true, id: id });
}

/* ---------- 差し戻し：カードごとの指示（価格・買取しない・状態・枚数）を画像付きで店舗に送る ---------- */
function kParse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function kLinesJson(lines) {
  var ls = (lines || []).map(function (q) { return { n: q.n, cond: q.cond || '', cnt: q.cnt, unit: q.unit, ref: q.ref || '', pid: q.pid || '', img: q.img || '' }; });
  var t = JSON.stringify(ls); if (t.length > 45000) { ls.forEach(function (q) { q.img = ''; }); t = JSON.stringify(ls).slice(0, 45000); }
  return t;
}
function sendUser(userId, content) {
  var r = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/bots/' + prop('LW_BOT_ID') + '/users/' + encodeURIComponent(userId) + '/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token() }, payload: JSON.stringify({ content: content })
  });
  if (r.getResponseCode() >= 300) throw new Error('個別に送れませんでした（' + r.getResponseCode() + '）: ' + r.getContentText());
}
function kRejectCheck(id, key) {
  var row = kFind(id); if (!row) throw new Error('依頼が見つかりません');
  var kk = String(row.values[19] || '').split('|');
  if (!key || kk[0] !== key) throw new Error('このリンクは使えません（新しいリンクをLINE WORKSで受け取ってください）');
  return { row: row, userId: kk[1] };
}
function kRejectPage(p) {
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var out = function (html) { return HtmlService.createHtmlOutput(html).setTitle('買取の差し戻し').addMetaTag('viewport', 'width=device-width, initial-scale=1'); };
  try {
    var c = kRejectCheck(p.id, p.k), v = c.row.values;
    if (v[12] !== '承認待ち') return out('<div style="font:16px sans-serif;padding:24px">依頼番号 ' + esc(v[0]) + ' はすでに「' + esc(v[12]) + '」です（' + esc(v[13]) + '）。</div>');
    var data = { id: v[0], k: p.k, store: v[3], requester: v[4], cust: v[5], total: v[6], lines: kParse(v[17]) || [], text: v[9], pin: !!P.getProperty('K_REJECT_PIN') };
    data.lines.forEach(function (q) { if (kIsPsa10(q.n)) { try { q.snk = kSnkrPsa10(q.n); } catch (e) { q.snk = null; } } });
    return out(K_REJECT_HTML.replace('__DATA__', JSON.stringify(data).replace(/</g, '\\u003c')));
  } catch (e) { return out('<div style="font:16px sans-serif;padding:24px">' + esc(e.message || e) + '</div>'); }
}
function kImgB64(u) { // ページで画像を描くために、マイカの商品画像を中継する
  if (!/^https:\/\/[^\/]*mycalinks\.(io|com)\//.test(u || '')) return null;
  try { var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true }); if (r.getResponseCode() >= 300) return null; var b = r.getBlob(); return 'data:' + (b.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(b.getBytes()); } catch (e) { return null; }
}
function kRejectSubmit(id, key, d) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var c, v, name;
  try {
    c = kRejectCheck(id, key); v = c.row.values;
    var pin = P.getProperty('K_REJECT_PIN'); if (pin && String(d.pin || '').trim() !== pin) throw new Error('暗証番号が違います（差し戻しは役員だけができます）');
    if (v[12] !== '承認待ち') throw new Error('依頼番号 ' + id + ' はすでに「' + v[12] + '」です');
    name = userName(c.userId);
    var fb = { by: name, at: new Date().toISOString(), comment: String(d.comment || '').slice(0, 2000), items: (d.items || []).slice(0, 80) };
    kSheet().getRange(c.row.r, 13, 1, 3).setValues([['差し戻し', name, new Date()]]);
    kSheet().getRange(c.row.r, 19, 1, 2).setValues([[JSON.stringify(fb).slice(0, 45000), '']]);
  } finally { lock.releaseLock(); }
  try { kSummary(); } catch (e) { console.error('査定集計: ' + e); }
  var test = v[3] === 'テスト', ch = test ? P.getProperty('K_WARN_CHANNEL') : CH[v[3]], yen = function (n) { return Number(n || 0).toLocaleString() + '円'; }; // 店舗「テスト」は役員の買取警告グループに送る（見た目の確認用）
  var nums = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  var txt = (test ? '【テスト】' : '') + '↩️ 買取を差し戻しました（依頼番号 ' + id + '・' + name + '）\n' + v[3] + '店　' + (v[5] ? v[5] + ' 様　' : '') + yen(v[6]) + '\n' +
    (fb.items.length ? '\n' + fb.items.map(function (it, k) { return (nums[k] || '・') + ' ' + it.n + (it.cond ? '《' + it.cond + '》' : '') + '\n　' + kFbText(it, yen); }).join('\n') : '') +
    (fb.comment ? '\n\nコメント：' + fb.comment : '') + '\n\nマイカを直したら、買取チェックで「更新」→ もう一度承認を依頼してください。';
  if (ch) {
    kSplit(txt).forEach(function (x) { send(ch, { type: 'text', text: x }); });
    if (d.image) try { send(ch, { type: 'image', fileId: uploadImage(d.image, 'kaitori_back_' + id + '.jpg') }); } catch (e) { console.error(e); }
    (d.photos || []).slice(0, 5).forEach(function (b, k) { try { send(ch, { type: 'image', fileId: uploadImage(b, 'kaitori_back_' + id + '_photo' + (k + 1) + '.jpg') }); } catch (e) { console.error(e); } });
  }
  return { ok: true };
}
function kFbText(it, yen) {
  var t = it.kind === 'price' ? '単価 ' + yen(it.unit) + ' → ' + yen(it.price) + ' に' : it.kind === 'none' ? '買取しない（お客様に返却）' : it.kind === 'cond' ? '状態を見直してください' : it.kind === 'count' ? '枚数を確認してください（今 ×' + it.cnt + '）' : '確認してください';
  return t + (it.memo ? '　' + it.memo : '');
}
var K_REJECT_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:"Hiragino Sans","Noto Sans JP",Meiryo,sans-serif;background:#f4f3ef;color:#1f1d1a;font-size:15px}
.hd{background:#1f1d1a;color:#fff;padding:12px 16px;position:sticky;top:0;z-index:2}.hd b{color:#e8c23a}.hd .s{font-size:12px;color:#ccc;margin-top:2px}
.w{padding:12px 12px 120px;max-width:720px;margin:0 auto}.sub{color:#6a655c;font-size:12.5px}
.c{background:#fff;border:1.5px solid #e2ded4;border-radius:12px;padding:10px;margin:8px 0;display:flex;gap:10px}.c.on{border-color:#c8102e;background:#fff7f8}
.c img{width:64px;height:90px;object-fit:contain;flex:none;background:#eee;border-radius:4px}.c .b{flex:1;min-width:0}.c .n{font-weight:700;font-size:14px}
.pill{display:inline-block;font-size:11px;background:#1f1d1a;color:#fff;border-radius:6px;padding:0 6px;margin-left:4px}
.k{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.k button{border:1.5px solid #d6d2c8;background:#fff;border-radius:999px;padding:5px 10px;font:inherit;font-size:13px;font-weight:700}
.k button.on{background:#c8102e;border-color:#c8102e;color:#fff}.x{margin-top:6px;display:none;gap:6px;flex-wrap:wrap}.c.on .x{display:flex}
input,textarea{font:inherit;font-size:15px;padding:7px 9px;border:1.5px solid #d6d2c8;border-radius:8px}input.p{width:120px}input.m{flex:1;min-width:160px}textarea{width:100%;box-sizing:border-box}
.ft{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #e2ded4;padding:10px 12px;display:flex;gap:8px;justify-content:center}
.btn{border:0;border-radius:10px;padding:12px 18px;font:inherit;font-weight:800;font-size:15px;background:#c8102e;color:#fff}.btn.g{background:#fff;color:#1f1d1a;border:1.5px solid #d6d2c8}
.msg{padding:30px 16px;font-size:16px;text-align:center}.err{color:#c8102e;font-weight:700}
</style></head><body><div class="hd"><b>買取の差し戻し</b><div class="s" id="hs"></div></div><div class="w" id="w"></div>
<div class="ft" id="ft"><button class="btn" id="go">差し戻す</button></div>
<script>
var D=__DATA__, ST={}, PH=[];
function yen(n){return Number(n||0).toLocaleString()+'円'}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
document.getElementById('hs').textContent=D.store+'店　'+(D.cust?D.cust+' 様　':'')+yen(D.total)+'　依頼番号 '+D.id+'　依頼者 '+D.requester;
var KINDS=[['price','この価格に'],['none','買取しない'],['cond','状態を見直し'],['count','枚数を確認'],['other','その他']];
function draw(){
  var h='<div class="sub" style="margin:4px 0 8px">直してほしいカードの指示を選んでください（複数OK）。何も選ばずにコメントだけでも差し戻せます。</div>';
  if(!D.lines.length) h+='<div class="sub">（この依頼にはカードの明細が保存されていません。コメントで指示してください）</div>';
  D.lines.forEach(function(q,i){var s=ST[i]||{};
    h+='<div class="c'+(s.kind?' on':'')+'" data-i="'+i+'">'+(q.img?'<img src="'+esc(q.img)+'">':'<img>')+'<div class="b"><div class="n">'+esc(q.n)+(q.cond?'<span class="pill">'+esc(q.cond)+'</span>':'')+'</div>'+
    '<div class="sub">×'+q.cnt+'　単価 <b>'+yen(q.unit)+'</b>'+(q.ref?'　買取表 '+yen(q.ref)+'（'+Math.round(q.unit/q.ref*100)+'%）':'')+'</div>'+
    (q.snk&&q.snk.price?'<div class="sub" style="color:#1f1d1a">スニダン PSA10 直近 <b>'+yen(q.snk.price)+'</b>（'+esc(q.snk.date)+'）　買取は '+Math.round(q.unit/q.snk.price*100)+'%'+(q.snk.url?'　<a href="'+esc(q.snk.url)+'" target="_blank">売買履歴</a>':'')+'</div>':q.snk===null||(q.snk&&!q.snk.price)?'<div class="sub">スニダン PSA10：見つかりませんでした</div>':'')+
    '<div class="k">'+KINDS.map(function(k){return '<button data-k="'+k[0]+'" class="'+(s.kind===k[0]?'on':'')+'">'+k[1]+'</button>'}).join('')+'</div>'+
    '<div class="x">'+(s.kind==='price'?'<input class="p" type="number" inputmode="numeric" placeholder="指示する単価" value="'+(s.price||'')+'">':'')+'<input class="m" placeholder="ひとこと（任意）" value="'+esc(s.memo||'')+'"></div></div></div>';
  });
  h+='<div style="margin-top:14px"><b>全体へのコメント</b><textarea id="cm" rows="3" placeholder="例：傷があるものは減額でお願いします">'+esc(ST.cm||'')+'</textarea></div>'+
    '<div style="margin-top:10px"><b>写真を添付（任意）</b><div><input type="file" id="ph" accept="image/*" multiple></div><div class="sub" id="phn">'+(PH.length?PH.length+'枚':'')+'</div></div>'+(D.pin?'<div style="margin-top:12px"><b>役員の暗証番号</b><div><input id="pin" type="password" inputmode="numeric" style="width:140px" value="'+esc(ST.pin||'')+'"></div><div class="sub">差し戻しは役員だけができます</div></div>':'')+'<div class="err" id="er"></div>';
  document.getElementById('w').innerHTML=h;
  document.querySelectorAll('.c').forEach(function(el){var i=+el.dataset.i;
    el.querySelectorAll('.k button').forEach(function(b){b.onclick=function(){var s=ST[i]=ST[i]||{};s.kind=s.kind===b.dataset.k?'':b.dataset.k;save();draw()}});
    var p=el.querySelector('input.p');if(p)p.oninput=function(){ST[i].price=this.value};
    var m=el.querySelector('input.m');if(m)m.oninput=function(){ST[i].memo=this.value};
  });
  document.getElementById('cm').oninput=function(){ST.cm=this.value};
  if(document.getElementById('pin'))document.getElementById('pin').oninput=function(){ST.pin=this.value};
  document.getElementById('ph').onchange=function(){var fs=Array.prototype.slice.call(this.files||[],0,5);PH=[];var n=fs.length;if(!n)return;fs.forEach(function(f){shrink(f,function(b){if(b)PH.push(b);if(--n===0)document.getElementById('phn').textContent=PH.length+'枚'})})};
}
function save(){document.querySelectorAll('.c').forEach(function(el){var i=+el.dataset.i,s=ST[i];if(!s)return;var p=el.querySelector('input.p'),m=el.querySelector('input.m');if(p)s.price=p.value;if(m)s.memo=m.value})}
function shrink(f,cb){var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){var k=Math.min(1,1400/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);cb(c.toDataURL('image/jpeg',.8).split(',')[1])};im.onerror=function(){cb('')};im.src=r.result};r.readAsDataURL(f)}
function items(){var out=[];D.lines.forEach(function(q,i){var s=ST[i];if(!s||!s.kind)return;out.push({i:i,n:q.n,cond:q.cond,pid:q.pid,cnt:q.cnt,unit:q.unit,ref:q.ref,img:q.img,kind:s.kind,price:s.kind==='price'?Number(s.price)||0:'',memo:(s.memo||'').trim()})});return out}
function txt(it){return it.kind==='price'?yen(it.unit)+' → '+yen(it.price)+' に':it.kind==='none'?'買取しない（返却）':it.kind==='cond'?'状態を見直し':it.kind==='count'?'枚数を確認（今 ×'+it.cnt+'）':'確認してください'}
function load(u){return new Promise(function(ok){if(!u)return ok(null);google.script.run.withSuccessHandler(function(d){if(!d)return ok(null);var im=new Image();im.onload=function(){ok(im)};im.onerror=function(){ok(null)};im.src=d}).withFailureHandler(function(){ok(null)}).kImgB64(u)})}
function sheet(its){return Promise.all(its.map(function(it){return load(it.img)})).then(function(ims){
  var COLS=Math.min(3,Math.max(1,its.length)),CW=300,CH=470,G=12,P=20,W=P*2+COLS*CW+(COLS-1)*G,rows=Math.ceil(its.length/COLS),HEAD=96,H=HEAD+P+rows*(CH+G)+(ST.cm?90:10);
  var cv=document.createElement('canvas');cv.width=W;cv.height=H;var c=cv.getContext('2d'),F='"Hiragino Sans","Noto Sans JP",Meiryo,sans-serif';
  function fit(s,w){if(c.measureText(s).width<=w)return s;while(s.length>1&&c.measureText(s+'…').width>w)s=s.slice(0,-1);return s+'…'}
  function wrap(s,w,max){var out=[];while(s&&out.length<max){var k=s.length;while(k>1&&c.measureText(s.slice(0,k)).width>w)k--;out.push(s.slice(0,k));s=s.slice(k)}if(s&&out.length)out[out.length-1]=fit(out[out.length-1]+s,w);return out}
  c.fillStyle='#f6f5f2';c.fillRect(0,0,W,H);c.fillStyle='#c8102e';c.fillRect(0,0,W,HEAD-8);c.textBaseline='top';
  c.fillStyle='#fff';c.font='bold 30px '+F;c.fillText(fit('↩ 差し戻し　'+D.store+'店　'+yen(D.total),W-P*2),P,14);c.font='bold 18px '+F;c.fillText(fit('依頼番号 '+D.id+'　直すカード '+its.length+'枚',W-P*2),P,56);
  its.forEach(function(it,k){var x=P+(k%COLS)*(CW+G),y=HEAD+P-8+Math.floor(k/COLS)*(CH+G);c.fillStyle='#fff';c.fillRect(x,y,CW,CH);c.strokeStyle='#c8102e';c.lineWidth=4;c.strokeRect(x+2,y+2,CW-4,CH-4);
    var im=ims[k],ih=250;if(im){var r=Math.min((CW-24)/im.width,ih/im.height),dw=im.width*r,dh=im.height*r;c.drawImage(im,x+(CW-dw)/2,y+12+(ih-dh)/2,dw,dh)}else{c.fillStyle='#eee';c.fillRect(x+12,y+12,CW-24,ih)}
    c.fillStyle='#c8102e';c.beginPath();c.arc(x+26,y+26,20,0,7);c.fill();c.fillStyle='#fff';c.font='bold 22px '+F;var nn=String(k+1);c.fillText(nn,x+26-c.measureText(nn).width/2,y+14);
    var ty=y+272;c.fillStyle='#1f1d1a';c.font='bold 16px '+F;wrap(it.n+(it.cond?'《'+it.cond+'》':''),CW-24,2).forEach(function(l,j){c.fillText(l,x+12,ty+j*20)});
    c.font='15px '+F;c.fillStyle='#555';c.fillText(fit('×'+it.cnt+'　単価 '+yen(it.unit)+(it.ref?'　買取表 '+yen(it.ref):''),CW-24),x+12,ty+46);
    c.fillStyle='#c8102e';c.fillRect(x+12,ty+72,CW-24,48);c.fillStyle='#fff';c.font='bold 22px '+F;c.fillText(fit(txt(it),CW-40),x+20,ty+84);
    if(it.memo){c.fillStyle='#1f1d1a';c.font='bold 15px '+F;wrap(it.memo,CW-24,3).forEach(function(l,j){c.fillText(l,x+12,ty+130+j*19)})}
  });
  if(ST.cm){c.fillStyle='#1f1d1a';c.font='bold 18px '+F;wrap('コメント：'+ST.cm,W-P*2,3).forEach(function(l,j){c.fillText(l,P,HEAD+P+rows*(CH+G)+j*24)})}
  return cv.toDataURL('image/jpeg',.86).split(',')[1];
})}
document.getElementById('go').onclick=function(){save();var b=this,its=items(),er=document.getElementById('er');ST.cm=(document.getElementById('cm').value||'').trim();
  var bad=its.filter(function(it){return it.kind==='price'&&!(it.price>0)});if(bad.length){er.textContent='「この価格に」の単価を入れてください';return}
  if(!its.length&&!ST.cm){er.textContent='カードの指示かコメントを入れてください';return}
  if(D.pin&&!(ST.pin||'').trim()){er.textContent='役員の暗証番号を入れてください';return}
  b.disabled=true;b.textContent='画像を作成中…';
  (its.length?sheet(its):Promise.resolve('')).then(function(img){b.textContent='送信中…';
    google.script.run.withSuccessHandler(function(){document.getElementById('w').innerHTML='<div class="msg">✅ 差し戻しを店舗に送りました。<br>このページは閉じて大丈夫です。</div>';document.getElementById('ft').style.display='none'})
      .withFailureHandler(function(e){b.disabled=false;b.textContent='差し戻す';er.textContent='送れませんでした：'+(e&&e.message||e)})
      .kRejectSubmit(D.id,D.k,{items:its.map(function(it){var o={};for(var x in it)if(x!=='img')o[x]=it[x];return o}),comment:ST.cm,image:img,photos:PH,pin:(ST.pin||'').trim()});
  });
};
draw();
</script></body></html>`;

/* ---------- スニダン：PSA10の直近の売買価格（売買履歴ページのいちばん上） ---------- */
function kIsPsa10(n) { return /PSA\s*10/i.test(String(n || '')); }
function kSnkrModel(n) { // 商品名の（sv2a 203/165 SAR）から「sv2a」「203」「165」
  var m = String(n || '').normalize('NFKC').match(/([A-Za-z][A-Za-z0-9\-]*)\s+(\d{1,3})\/(\d{1,3}|[A-Za-z\-]+)/);
  return m ? { set: m[1], no: m[2], tot: m[3] } : null;
}
function kSnkrFetch(u) {
  var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'ja' } });
  if (r.getResponseCode() >= 300) throw new Error('スニダン ' + r.getResponseCode());
  return r.getContentText();
}
function kSnkrPsa10(n) {
  var md = kSnkrModel(n); if (!md) return { price: 0, why: '型番がわかりません' };
  var key = 'snk3_' + (md.set + '_' + md.no + '_' + md.tot).toLowerCase(), c = CacheService.getScriptCache(), hit = c.get(key);
  if (hit) return JSON.parse(hit);
  var html = kSnkrFetch('https://snkrdunk.com/search?keywords=' + encodeURIComponent(md.set + ' ' + md.no + '/' + md.tot));
  var ids = [], re = /apparels\/(\d+)/g, mm; while ((mm = re.exec(html)) && ids.length < 4) if (ids.indexOf(mm[1]) < 0) ids.push(mm[1]);
  var no3 = ('00' + md.no).slice(-3), want = (md.set + '-' + no3).toLowerCase(), out = { price: 0, why: 'スニダンに見つかりません' };
  for (var i = 0; i < ids.length; i++) {
    var u = JSON.parse(kSnkrFetch('https://snkrdunk.com/v1/apparels/' + ids[i] + '/used?perPage=1'));
    var it = (u.apparelUsedItems || [])[0], pn = String(it && it.apparel && it.apparel.productNumber || '');
    if (!pn) { var hh = kSnkrFetch('https://snkrdunk.com/apparels/' + ids[i] + '/sales-histories'); pn = 'pkmn-tcg-' + ((hh.match(/pkmn-tcg-([A-Za-z0-9\-]+)/) || [])[1] || ''); }
    if (pn.replace(/^pkmn-tcg-/, '').toLowerCase() !== want) continue; // 型番（セット＋番号）が合うカードだけ使う
    var url = 'https://snkrdunk.com/apparels/' + ids[i]; // 売買履歴が見られるPSA10の出品ページ（なければ商品ページ）
    try { var pu = JSON.parse(kSnkrFetch('https://snkrdunk.com/v1/apparels/' + ids[i] + '/used?perPage=1&conditionIds=22')); var pi = (pu.apparelUsedItems || [])[0]; if (pi && pi.id) url += '/used/' + pi.id; } catch (e) { }
    var j = JSON.parse(kSnkrFetch('https://snkrdunk.com/v1/apparels/' + ids[i] + '/sales-history?page=1&per_page=5&condition_id=22')); // 22＝PSA10
    var rows = (j.history || []).map(function (x) { return { date: x.date, price: Number(x.price) || 0 }; });
    out = rows.length ? { price: rows[0].price, date: rows[0].date, recent: rows, min: j.minPrice || 0, url: url, id: ids[i] } : { price: 0, why: 'PSA10の取引がまだありません', min: j.minPrice || 0, url: url };
    break;
  }
  try { c.put(key, JSON.stringify(out), 3 * 3600); } catch (e) { }
  return out;
}
function kSnkrText(lines) { // 承認依頼の文章に付ける：PSA10のカードだけ（多くても6枚）
  var yen = function (n) { return Number(n || 0).toLocaleString() + '円'; }, out = [];
  (lines || []).filter(function (q) { return kIsPsa10(q.n); }).slice(0, 6).forEach(function (q) {
    var s; try { s = kSnkrPsa10(q.n); } catch (e) { s = { price: 0, why: '取得できませんでした' }; }
    var nm = String(q.n).replace(/《[^》]*》/g, '').slice(0, 30);
    out.push('・' + nm + '\n　' + (s.url ? s.url : 'スニダン：' + (s.why || '見つかりません'))); // 金額は査定表の画像に載せるので、文章は売買履歴のURLだけ
  });
  return out.length ? '\n\n［スニダン PSA10 売買履歴］\n' + out.join('\n') : '';
}

/* ---------- 査定ログ（承認ライン以上の買取の明細を、査定者つきで1行ずつためる） ---------- */
var K_LOG_COLS = ['日時', '店舗', '受付番号', '査定者', '依頼番号', 'マイカ取引ID', 'お客様', '買取合計', '商品', '状態', '種類', '枚数', '単価', '小計', '買取表', '買取表比', '買取表のタブ', '警告', '枚数確認'];
function kLogSheet() {
  var ss = kBook(), sh = ss.getSheetByName('査定ログ');
  if (!sh) { sh = ss.insertSheet('査定ログ'); sh.appendRow(K_LOG_COLS); sh.setFrozenRows(1); }
  return sh;
}
function kLogLines(id, d) {
  var ls = d.lines || []; if (!ls.length) return;
  var now = new Date();
  var rows = ls.map(function (q) {
    var unit = Number(q.unit) || 0, cnt = Number(q.cnt) || 0, ref = Number(q.ref) || '';
    return [now, d.store, d.reception || '', d.requester, id, d.txId || '', d.customer || '', Number(d.total) || 0, q.n || '', q.cond || '', q.cat || '', cnt, unit, unit * cnt, ref, ref ? Math.round(unit / ref * 1000) / 1000 : '', q.tab || '', q.flags || '', d.countChecked ? '確認済み' : ''];
  });
  var sh = kLogSheet(); sh.getRange(sh.getLastRow() + 1, 1, rows.length, K_LOG_COLS.length).setValues(rows);
  try { kSummary(); } catch (e) { console.error('査定集計: ' + e); }
}

/* ---------- 査定集計（月 × 店舗 × 査定者）：査定ログから毎回作り直す ---------- */
var K_SUM_COLS = ['月', '店舗', '査定者', '依頼件数', '明細行数', '買取合計', '🚨赤の件数', '⚠️黄の件数', '警告が出た依頼', '警告が出た依頼の割合', '買取表比の平均', '買取表比（金額の重み付き）', '差し戻し件数', '枚数確認あり'];
function kSummary() {
  var ss = kBook(), log = ss.getSheetByName('査定ログ');
  var sh = ss.getSheetByName('査定集計'); if (!sh) { sh = ss.insertSheet('査定集計'); }
  var vals = log ? log.getDataRange().getValues().slice(1) : [];
  var st = {}; // 依頼番号 → 状態
  var kv = kSheet().getDataRange().getValues(); for (var i = 1; i < kv.length; i++) st[kv[i][0]] = kv[i][12];
  var g = {};
  vals.forEach(function (v) {
    if (!v[0]) return;
    var mon = Utilities.formatDate(new Date(v[0]), 'Asia/Tokyo', 'yyyy-MM'), who = String(v[3] || '').replace(/\s+/g, '') || '（名前なし）';
    var k = mon + '|' + v[1] + '|' + who, o = g[k] || (g[k] = { mon: mon, store: v[1], who: who, reqs: {}, warnReqs: {}, rows: 0, total: 0, red: 0, yel: 0, rs: 0, rn: 0, wu: 0, wr: 0, cnt: {} });
    var id = v[4]; o.reqs[id] = Number(v[7]) || 0; o.rows++;
    var f = String(v[17] || ''), r = (f.match(/🚨/g) || []).length, y = (f.match(/⚠️/g) || []).length;
    o.red += r; o.yel += y; if (r + y) o.warnReqs[id] = 1;
    var unit = Number(v[12]) || 0, n = Number(v[11]) || 0, ref = Number(v[14]) || 0;
    if (ref > 0 && unit > 0) { o.rs += unit / ref; o.rn++; o.wu += unit * n; o.wr += ref * n; }
    if (v[18]) o.cnt[id] = 1;
  });
  var rows = Object.keys(g).map(function (k) {
    var o = g[k], ids = Object.keys(o.reqs), nw = Object.keys(o.warnReqs).length;
    var back = ids.filter(function (id) { return st[id] === '差し戻し'; }).length;
    return [o.mon, o.store, o.who, ids.length, o.rows, ids.reduce(function (s, id) { return s + o.reqs[id]; }, 0), o.red, o.yel, nw,
      ids.length ? nw / ids.length : 0, o.rn ? o.rs / o.rn : '', o.wr ? o.wu / o.wr : '', back, Object.keys(o.cnt).length];
  }).sort(function (a, b) { return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : String(a[1]).localeCompare(String(b[1])) || String(a[2]).localeCompare(String(b[2])); });
  sh.clearContents();
  sh.getRange(1, 1, 1, K_SUM_COLS.length).setValues([K_SUM_COLS]).setFontWeight('bold').setBackground('#efede7');
  sh.setFrozenRows(1);
  if (rows.length) {
    sh.getRange(2, 1, rows.length, K_SUM_COLS.length).setValues(rows);
    sh.getRange(2, 6, rows.length, 1).setNumberFormat('#,##0"円"');
    sh.getRange(2, 10, rows.length, 3).setNumberFormat('0%');
  }
  sh.getRange(rows.length + 3, 1).setValue('※査定ログ（本部承認を依頼した買取の明細）から自動で作っています。買取表比は「入力した単価 ÷ 買取表の価格」（買取表にない商品は除く）。最終更新 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
}

/** 最初に1回：買取タブと買取設定タブを作り、価格が読めるか確かめる */
function kSetup() {
  kSheet(); kSettingSheet(); kLogSheet(); kChkSheet(); kSummary();
  var rows = kPrices();
  Logger.log('買取表の価格：' + rows.length + '行');
  Logger.log('買取設定：' + JSON.stringify(kConfig()));
}
