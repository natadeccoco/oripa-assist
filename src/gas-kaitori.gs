/**
 * 買取チェック（LINE WORKS）  ※「オリパ本部承認（LINE WORKS）」と同じGASプロジェクトに入れるファイル
 * 店舗のマイカ画面で動く「買取チェック」ツールから呼ばれる。
 *   GET  ?action=kprices  … 買取表スプレッドシートの全タブの価格（ツールが突き合わせに使う）
 *   GET  ?action=kconfig  … 承認ライン（店舗別・スタッフ別）
 *   GET  ?action=kstatus&id=… … 承認依頼の結果
 *   POST {action:'kaitori', kind:'approval'|'confirm', …} … 承認依頼／警告を確認した記録を店舗のグループへ
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
  var vals = kSettingSheet().getDataRange().getValues(), stores = {}, staff = {};
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i];
    if (v[0] && kNum(v[1]) != null) stores[String(v[0]).trim()] = kNum(v[1]);
    if (String(v[4] || '').trim() && kNum(v[5]) != null) staff[String(v[4]).replace(/\s+/g, '')] = kNum(v[5]);
  }
  return { def: K_DEFAULT_LINE, stores: stores, staff: staff };
}

function kaitoriGet(p) {
  try {
    if (p.action === 'kprices') return json({ ok: true, at: new Date().toISOString(), rows: kPrices() });
    if (p.action === 'kconfig') return json({ ok: true, config: kConfig() });
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
  var ch = CH[d.store]; if (!ch) return json({ ok: false, error: '店舗「' + d.store + '」のLINE WORKSグループが登録されていません' });
  if (!d.requester) return json({ ok: false, error: '名前を入れてください' });
  var approval = d.kind === 'approval';
  var lock = LockService.getScriptLock(), id; lock.waitLock(20000);
  try {
    id = (approval ? 'K' : 'C') + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MMdd-HHmmss') + '-' + Math.floor(Math.random() * 90 + 10);
    kSheet().appendRow([id, new Date(), approval ? '承認依頼' : '警告の確認', d.store, d.requester, d.customer || '', Number(d.total) || 0, Number(d.line) || '', Number(d.warnCount) || 0,
      String(d.text || '').slice(0, 45000), String(d.warnText || '').slice(0, 45000), d.comment || '', approval ? '承認待ち' : '確認済み', approval ? '' : d.requester, approval ? '' : new Date(), d.txId || '', d.staff || '']);
  } finally { lock.releaseLock(); }
  var yen = function (n) { return Number(n || 0).toLocaleString() + '円'; };
  var head = approval
    ? '【買取承認依頼】' + d.store + '店　依頼者：' + d.requester + '\n' + (d.customer ? d.customer + ' 様　' : '') + yen(d.total) + (d.reason ? '（' + d.reason + '）' : '') + '\n依頼番号：' + id
    : '【買取チェック】' + d.store + '店　' + (d.customer ? d.customer + ' 様　' : '') + yen(d.total) + '\n警告' + (d.warnCount || 0) + '件を ' + d.requester + ' さんが確認しました（' + id + '）';
  var body = head + (d.warnText ? '\n\n' + d.warnText : '') + (approval && d.text ? '\n\n［明細］\n' + d.text : '') + (d.comment ? '\n\nコメント：' + d.comment : '');
  kSplit(body).forEach(function (x) { send(ch, { type: 'text', text: x }); });
  var imgErr = '';
  (d.images || []).slice(0, 10).forEach(function (b64, i) {
    try { send(ch, { type: 'image', fileId: uploadImage(b64, 'kaitori_' + id + '_' + (i + 1) + '.jpg') }); } catch (e) { imgErr = String(e.message || e); console.error(imgErr); }
  });
  if (approval) {
    send(ch, { type: 'button_template', contentText: '依頼番号 ' + id + '（' + d.store + '店・' + yen(d.total) + '）の買取を承認しますか？',
      actions: [{ type: 'message', label: '承認する', text: '承認する（' + id + '）', postback: 'kapprove:' + id },
                { type: 'message', label: '差し戻す', text: '差し戻す（' + id + '）', postback: 'kreject:' + id }] });
  }
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
    if (ch) send(ch, { type: 'text', text: (st === '承認' ? '✅ 買取を承認しました' : '↩️ 買取を差し戻しました') + '（依頼番号 ' + m[2] + '・' + name + '）' +
      (st === '承認' ? '' : '\n直してほしい点をこのトークで伝えてください。') });
  } finally { lock.releaseLock(); }
}

/** 最初に1回：買取タブと買取設定タブを作り、価格が読めるか確かめる */
function kSetup() {
  kSheet(); kSettingSheet();
  var rows = kPrices();
  Logger.log('買取表の価格：' + rows.length + '行');
  Logger.log('買取設定：' + JSON.stringify(kConfig()));
}
