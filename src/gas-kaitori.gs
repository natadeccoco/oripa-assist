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
var K_COLS = ['依頼番号', '日時', '種類', '店舗', '依頼者', 'お客様', '買取合計', '承認ライン', '警告数', '内容', '警告', 'コメント', '状態', '判断した人', '判断日時', 'マイカ取引ID', '担当スタッフ'];
var K_DEFAULT_LINE = 50000;

function kBook() { return SpreadsheetApp.openById(prop('SHEET_ID')); }
function kSheet() {
  var ss = kBook(), sh = ss.getSheetByName('買取');
  if (!sh) { sh = ss.insertSheet('買取'); sh.appendRow(K_COLS); sh.setFrozenRows(1); }
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
  try {
    if (p.action === 'kprices') return json({ ok: true, at: new Date().toISOString(), rows: kPrices() });
    if (p.action === 'kconfig') return json({ ok: true, config: kConfig() });
    if (p.action === 'kstaff') return json(kStaff());
    if (p.action === 'kstatus' && p.tx) { // マイカの取引IDで、その買取の最新の承認依頼・警告の確認を返す（どのPCからでも同じ状態が見える）
      var vals = kSheet().getDataRange().getValues(), ap = null, cf = null;
      for (var i = vals.length - 1; i >= 1 && (!ap || !cf); i--) {
        if (String(vals[i][15]) !== String(p.tx)) continue;
        var v = vals[i], o = { id: v[0], status: v[12], by: v[13] || v[4], at: v[14] ? String(v[14]) : '', requester: v[4] };
        if (v[2] === '承認依頼' && !ap) ap = o; else if (v[2] === '警告の確認' && !cf) cf = o;
      }
      var ck = null, fs = kBook().getSheetByName('最終チェック');
      if (fs && fs.getLastRow() >= 2) { var fv = fs.getRange(2, 1, fs.getLastRow() - 1, 6).getValues(); for (var k = fv.length - 1; k >= 0; k--) if (String(fv[k][4]) === String(p.tx)) { ck = { id: fv[k][0], by: fv[k][5], at: fv[k][1] ? new Date(fv[k][1]).toISOString() : '' }; break; } }
      return json({ ok: true, approval: ap, confirm: cf, check: ck });
    }
    if (p.action === 'kstatus') {
      var row = kFind(p.id); if (!row) return json({ ok: false, error: '依頼が見つかりません' });
      return json({ ok: true, id: row.values[0], status: row.values[12], by: row.values[13], at: row.values[14] ? String(row.values[14]) : '' });
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
  var ch = CH[d.store]; if (!ch) return json({ ok: false, error: '店舗「' + d.store + '」のLINE WORKSグループが登録されていません' });
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
      String(d.text || '').slice(0, 45000), String(d.warnText || '').slice(0, 45000), d.comment || '', approval ? '承認待ち' : '確認済み', approval ? '' : d.requester, approval ? '' : new Date(), d.txId || '', d.staff || '']);
  } finally { lock.releaseLock(); }
  if (!approval) return json({ ok: true, id: id }); // 警告の確認は査定者向け：記録だけ残し、グループには送らない
  try { kLogLines(id, d); } catch (e) { console.error('査定ログ: ' + e); }
  var yen = function (n) { return Number(n || 0).toLocaleString() + '円'; };
  var head = '【買取承認依頼】' + d.store + '店　依頼者：' + d.requester + '\n' + (d.customer ? d.customer + ' 様　' : '') + yen(d.total) + (d.reason ? '（' + d.reason + '）' : '') + '\n依頼番号：' + id;
  var imgErr = '';
  send(ch, { type: 'text', text: (head + (d.comment ? '\nコメント：' + d.comment : '')).slice(0, 1990) });
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
