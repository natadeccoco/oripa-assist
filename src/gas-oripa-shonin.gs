/**
 * オリパ本部承認（LINE WORKS）
 * オリパ作成アシスト（任意の金額で作る）→ このWebアプリに承認依頼 → 店舗の「オリパ・買取共有」グループにBotで送信
 * → 役員が「承認する／差し戻す」を押す → Callbackでこのアプリが受け取り、結果をグループに返す → ツールが結果を読む
 *
 * スクリプト プロパティ（値は本人が貼る。コードやシートには書かない）
 *   LW_CLIENT_ID / LW_CLIENT_SECRET / LW_SERVICE_ACCOUNT / LW_PRIVATE_KEY / LW_BOT_ID
 *   LW_APPROVERS（任意）… 承認できる人のLINE WORKSユーザーID（カンマ区切り）。空なら誰でも承認できる
 *   LW_SHARE_CHANNEL … 「在庫共有」グループのチャンネルID（足りない当たりの募集を送る先）
 *   SHEET_ID / CALLBACK_KEY … setup() が自動で作る
 */
var P = PropertiesService.getScriptProperties();
var CH = {
  '千葉中央': '8da80d37-d1a6-a761-8713-884cb6ac9411',
  '柏': '7c74e166-9bbb-0b66-4498-60094fd248b5',
  '町田': '37474c46-2081-ece8-da5a-204deeae5f83',
  '松戸': '86189ef9-d047-d345-5431-86ad84537ff5',
  '中野': 'b2bc5a26-6bdb-0c70-4557-2aa682ab6f79',
  'お台場': '81627554-b054-da63-c992-c67148fb750b',
  '津田沼': '3b70dae2-ca77-44b3-6555-24cbb4a7f6e9',
  '横浜': 'd7a947d1-3ff2-9fea-9b35-9d27da26baf3'
};
var COLS = ['依頼番号', '依頼日時', '店舗', '依頼者', '値段', '口数', '原価率', '内容', 'コメント', '状態', '判断した人', '判断日時', '判断した人のID'];

function prop(k) { var v = P.getProperty(k); if (!v) throw new Error('スクリプト プロパティ ' + k + ' が入っていません'); return v; }
function sheet() { return SpreadsheetApp.openById(prop('SHEET_ID')).getSheetByName('依頼'); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** 最初に1回だけ実行：履歴シートと、Callback用の合言葉を作る */
function setup() {
  if (!P.getProperty('SHEET_ID')) {
    var ss = SpreadsheetApp.create('オリパ承認履歴');
    var sh = ss.getSheets()[0]; sh.setName('依頼'); sh.appendRow(COLS); sh.setFrozenRows(1);
    P.setProperty('SHEET_ID', ss.getId());
  }
  // 秘密ではない値（Developer Consoleの表示どおり）
  var ids = { LW_CLIENT_ID: 'hpJ3EvJpD8pa83dPj_S9', LW_SERVICE_ACCOUNT: 'gssfe.serviceaccount@natadecococoltd', LW_BOT_ID: '13471886' };
  Object.keys(ids).forEach(function (k) { if (!P.getProperty(k)) P.setProperty(k, ids[k]); });
  ['LW_CLIENT_SECRET', 'LW_PRIVATE_KEY'].forEach(function (k) { if (!P.getProperty(k)) Logger.log('まだ入っていません：' + k + '（プロジェクトの設定 → スクリプト プロパティ に貼ってください）'); });
  if (!P.getProperty('CALLBACK_KEY')) P.setProperty('CALLBACK_KEY', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('履歴シート: https://docs.google.com/spreadsheets/d/' + P.getProperty('SHEET_ID'));
  Logger.log('CALLBACK_KEY: ' + P.getProperty('CALLBACK_KEY'));
}

/** 動作確認：柏店のグループにテスト送信 */
function testSend() { send(CH['柏'], { type: 'text', text: '【テスト】ナタデココ本部Botからの送信テストです。' }); }

/* ---------- LINE WORKS ---------- */
function b64u(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); }
function token() {
  var cache = CacheService.getScriptCache(), t = cache.get('lw_token2'); if (t) return t;
  var now = Math.floor(Date.now() / 1000);
  var head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var body = b64u(JSON.stringify({ iss: prop('LW_CLIENT_ID'), sub: prop('LW_SERVICE_ACCOUNT'), iat: now, exp: now + 3600 }));
  // 秘密鍵は、見出し行や改行が抜けて貼られても使えるように整える
  var raw = prop('LW_PRIVATE_KEY').replace(/\\n/g, '\n').replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s+/g, '');
  var key = '-----BEGIN PRIVATE KEY-----\n' + raw.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';
  var sig = b64u(Utilities.computeRsaSha256Signature(head + '.' + body, key));
  var r = UrlFetchApp.fetch('https://auth.worksmobile.com/oauth2/v2.0/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { assertion: head + '.' + body + '.' + sig, grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: prop('LW_CLIENT_ID'), client_secret: prop('LW_CLIENT_SECRET'), scope: 'bot bot.read group.read user.read task' }
  });
  var j = JSON.parse(r.getContentText() || '{}');
  if (!j.access_token) throw new Error('LINE WORKSのトークンが取れませんでした: ' + r.getContentText());
  cache.put('lw_token2', j.access_token, 3000);
  return j.access_token;
}
function send(channelId, content) {
  var r = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/bots/' + prop('LW_BOT_ID') + '/channels/' + channelId + '/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token() }, payload: JSON.stringify({ content: content })
  });
  if (r.getResponseCode() >= 300) throw new Error('LINE WORKSへの送信に失敗しました（' + r.getResponseCode() + '）: ' + r.getContentText());
}
// 画像をLINE WORKSにアップロードして fileId を返す（base64のJPEG/PNG）
function uploadImage(b64, fileName) {
  var r = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/bots/' + prop('LW_BOT_ID') + '/attachments', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token() }, payload: JSON.stringify({ fileName: fileName })
  });
  var j = JSON.parse(r.getContentText() || '{}');
  if (!j.uploadUrl || !j.fileId) throw new Error('画像のアップロード先が取れませんでした: ' + r.getContentText());
  var mime = /\.png$/i.test(fileName) ? 'image/png' : 'image/jpeg';
  var up = UrlFetchApp.fetch(j.uploadUrl, { method: 'post', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token() },
    payload: { Filedata: Utilities.newBlob(Utilities.base64Decode(b64), mime, fileName) } });
  if (up.getResponseCode() >= 300) throw new Error('画像のアップロードに失敗しました（' + up.getResponseCode() + '）: ' + up.getContentText());
  return j.fileId;
}
// 店舗グループの中の「店舗アカウント」（役員以外のメンバー）のIDを探す。一度見つけたら覚えておく
function storeUser(store) {
  var key = 'LW_STORE_USER_' + store, v = P.getProperty(key); if (v) return v;
  var ch = CH[store]; if (!ch) return '';
  var r = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/bots/' + prop('LW_BOT_ID') + '/channels/' + ch + '/members', { headers: { Authorization: 'Bearer ' + token() }, muteHttpExceptions: true });
  var ms = (JSON.parse(r.getContentText() || '{}').members || []);
  var ap = (P.getProperty('LW_APPROVERS') || '').split(',').map(function (s) { return s.trim(); });
  var cand = ms.filter(function (id) { return ap.indexOf(id) < 0; });
  var hit = cand.filter(function (id) { return userName(id).indexOf(store) >= 0; })[0] || (cand.length === 1 ? cand[0] : '');
  if (hit) P.setProperty(key, hit);
  return hit;
}
// 店舗アカウントに、本部（LW_APPROVERS の1人目）からのタスクを作る
function createTask(store, title, content, dueDate) {
  var to = storeUser(store); if (!to) throw new Error(store + '店のアカウントが見つかりません');
  var from = (P.getProperty('LW_APPROVERS') || '').split(',')[0].trim();
  var body = { assignorId: from, assignees: [{ assigneeId: to, status: 'TODO' }], title: String(title).slice(0, 200), content: String(content).slice(0, 2000), completionCondition: 'ANY_ONE' };
  if (dueDate) body.dueDate = dueDate;
  var ut = userToken(), me = P.getProperty('LW_USER_ID') || from; body.assignorId = me;
  var r = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/users/' + me + '/tasks', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ut }, payload: JSON.stringify(body) });
  if (r.getResponseCode() >= 300) throw new Error('タスクを作れませんでした（' + r.getResponseCode() + '）: ' + r.getContentText());
  return (JSON.parse(r.getContentText() || '{}').taskId) || '';
}
/* ---------- タスク用：本部の人のアカウントで許可（User Account認証） ---------- */
// タスクAPIはBot（Service Account）では使えないため、本部の人が一度だけ許可したアカウントで作る
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwXHuu-X3L0qzJhvaszEIm-1xdeNIqJACQ0uM7mz5Q0hvwfdF9IuQiTKr3qmscNVmnhcQ/exec';
function authUrl() {
  return 'https://auth.worksmobile.com/oauth2/v2.0/authorize?client_id=' + encodeURIComponent(prop('LW_CLIENT_ID')) + '&redirect_uri=' + encodeURIComponent(WEBAPP_URL) +
    '&scope=' + encodeURIComponent('task user.read') + '&response_type=code&state=' + encodeURIComponent(prop('CALLBACK_KEY'));
}
function userTokenReq(payload) {
  payload.client_id = prop('LW_CLIENT_ID'); payload.client_secret = prop('LW_CLIENT_SECRET');
  var r = UrlFetchApp.fetch('https://auth.worksmobile.com/oauth2/v2.0/token', { method: 'post', muteHttpExceptions: true, payload: payload });
  var j = JSON.parse(r.getContentText() || '{}');
  if (!j.access_token) throw new Error('タスク用の許可が切れています。本部の人がもう一度「許可」してください（' + r.getContentText() + '）');
  if (j.refresh_token) P.setProperty('LW_USER_REFRESH', j.refresh_token);
  CacheService.getScriptCache().put('lw_utoken', j.access_token, Math.min(3000, Number(j.expires_in || 3600) - 300));
  return j.access_token;
}
function userToken() {
  var t = CacheService.getScriptCache().get('lw_utoken'); if (t) return t;
  var rt = P.getProperty('LW_USER_REFRESH'); if (!rt) throw new Error('タスク用の許可がまだです（本部の人が一度「許可」してください）');
  return userTokenReq({ grant_type: 'refresh_token', refresh_token: rt });
}
function userName(userId) {
  try {
    var r = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/users/' + encodeURIComponent(userId), { headers: { Authorization: 'Bearer ' + token() }, muteHttpExceptions: true });
    var j = JSON.parse(r.getContentText() || '{}'), n = j.userName || {};
    return ((n.lastName || '') + (n.firstName || '')) || j.email || userId;
  } catch (e) { return userId; }
}

/* ---------- ツールから ---------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (/^k/.test(p.action || '')) return kaitoriGet(p); // 買取チェック（gas-kaitori.gs）
  if (p.action === 'status') {
    var row = findRow(p.id); if (!row) return json({ ok: false, error: '依頼が見つかりません' });
    var v = row.values;
    return json({ ok: true, id: v[0], status: v[9], by: v[10], at: v[11] ? String(v[11]) : '' });
  }
  if (p.action === 'storeusers' && p.k === P.getProperty('CALLBACK_KEY')) { // 確認用：各店のアカウントID
    var o = {}; Object.keys(CH).forEach(function (s) { try { var id = storeUser(s); o[s] = id ? userName(id) + ' : ' + id : '（見つからない）'; } catch (e) { o[s] = 'エラー ' + e.message; } });
    return json({ ok: true, users: o });
  }
  if (p.code && p.state && p.state === P.getProperty('CALLBACK_KEY')) { // LINE WORKSで「許可」したあとに戻ってくる
    try {
      var at = userTokenReq({ grant_type: 'authorization_code', code: p.code });
      var mr = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/users/me', { headers: { Authorization: 'Bearer ' + at }, muteHttpExceptions: true });
      var mj = JSON.parse(mr.getContentText() || '{}'), nm = mj.userName || {};
      if (mj.userId) P.setProperty('LW_USER_ID', mj.userId);
      return HtmlService.createHtmlOutput('<div style="font:18px sans-serif;padding:40px">✅ タスクの連携ができました（' + ((nm.lastName || '') + (nm.firstName || '')) + 'さん）。<br>このページは閉じて大丈夫です。</div>');
    } catch (e) { return HtmlService.createHtmlOutput('<div style="font:18px sans-serif;padding:40px">連携できませんでした：' + String(e.message || e).replace(/</g, '&lt;') + '</div>'); }
  }
  if (p.action === 'auth' && p.k === P.getProperty('CALLBACK_KEY')) return json({ ok: true, url: authUrl(), redirect: WEBAPP_URL, linked: !!P.getProperty('LW_USER_REFRESH') });
  if (p.action === 'img') { // ツールが1枚の画像を描くために、マイカの商品画像を中継する（マイカの画像だけ）
    if (!/^https:\/\/[^\/]*mycalinks\.(io|com)\//.test(p.u || '')) return json({ ok: false, error: 'この画像は中継できません' });
    try {
      var r = UrlFetchApp.fetch(p.u, { muteHttpExceptions: true });
      if (r.getResponseCode() >= 300) return json({ ok: false, error: String(r.getResponseCode()) });
      var bl = r.getBlob();
      return json({ ok: true, mime: bl.getContentType() || 'image/png', b64: Utilities.base64Encode(bl.getBytes()) });
    } catch (e) { return json({ ok: false, error: String(e.message || e) }); }
  }
  return json({ ok: true, app: 'オリパ本部承認' });
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  if (p.k) return callback(e, p.k);
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action === 'kaitori') return kaitoriPost(d); // 買取チェック（gas-kaitori.gs）
    if (d.action === 'share') { // 足りない当たりを「在庫共有」グループで募集する
      var sc = P.getProperty('LW_SHARE_CHANNEL');
      if (!sc) return json({ ok: false, error: '在庫共有グループがまだ登録されていません（本部に連絡してください）' });
      if (!d.requester) return json({ ok: false, error: '依頼者の名前を入れてください' });
      send(sc, { type: 'text', text: String(d.text || '').slice(0, 1990) });
      return json({ ok: true });
    }
    if (d.action === 'pick') { // 全店オリパ：各店のグループに、その店が送るカードの画像＋文で発送依頼
      var pc = CH[d.store]; if (!pc) return json({ ok: false, error: '店舗「' + d.store + '」のLINE WORKSグループが登録されていません' });
      var t = String(d.text || ''), parts = [];
      while (t.length > 1900) { var k = t.lastIndexOf('\n', 1900); if (k < 500) k = 1900; parts.push(t.slice(0, k)); t = t.slice(k).replace(/^\n/, ''); }
      parts.push(t);
      parts.forEach(function (x) { send(pc, { type: 'text', text: x }); });
      var perr = '';
      if (d.image) { try { send(pc, { type: 'image', fileId: uploadImage(d.image, 'pick_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MMdd-HHmmss') + '.jpg') }); } catch (e) { perr = String(e.message || e); console.error(perr); } }
      var tid = '', terr = '', pid = 'P' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MMdd-HHmmss') + '-' + Math.floor(Math.random() * 90 + 10);
      if (d.task) { try { tid = createTask(d.store, d.task.title, d.task.content, d.task.dueDate || ''); } catch (e) { terr = String(e.message || e); console.error(terr); } }
      pickSheet().appendRow([pid, new Date(), d.store, (d.task && d.task.title) || '', tid, '依頼中', '', '', (d.task && d.task.dueDate) || '']);
      send(pc, { type: 'button_template', contentText: '送ったら「送りました」を押してください（' + d.store + '店・' + pid + '）' + (tid ? '\nLINE WORKSのタスクも自動で完了になります。' : ''),
        actions: [{ type: 'message', label: '送りました', text: '送りました（' + pid + '）', postback: 'shipped:' + pid }] });
      return json({ ok: true, imageErr: perr, taskId: tid, taskErr: terr, pickId: pid });
    }
    if (d.action !== 'request') return json({ ok: false, error: '不明な操作です' });
    var ch = CH[d.store]; if (!ch) return json({ ok: false, error: '店舗「' + d.store + '」のLINE WORKSグループが登録されていません' });
    if (!d.requester) return json({ ok: false, error: '依頼者の名前を入れてください' });
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    var id;
    try {
      id = 'R' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MMdd-HHmmss') + '-' + Math.floor(Math.random() * 90 + 10);
      sheet().appendRow([id, new Date(), d.store, d.requester, d.price, d.init, d.costr, d.text, d.comment || '', '承認待ち', '', '', '']);
    } finally { lock.releaseLock(); }
    var head = '【オリパ承認依頼】' + d.store + '店　依頼者：' + d.requester + '\n依頼番号：' + id + '\n';
    var cardErr = '';
    if (d.image) { // ツールが描いた1枚の画像で中身を見せる（文章は短く）
      send(ch, { type: 'text', text: (head + (d.summary || '') + (d.comment ? '\nコメント：' + d.comment : '')).slice(0, 1990) });
      try { send(ch, { type: 'image', fileId: uploadImage(d.image, 'oripa_' + id + '.jpg') }); }
      catch (e) { cardErr = String(e.message || e); console.error(cardErr); send(ch, { type: 'text', text: (d.text || '').slice(0, 1990) }); }
    } else {
      send(ch, { type: 'text', text: (head + d.text + (d.comment ? '\n\nコメント：' + d.comment : '')).slice(0, 1990) });
    }
    send(ch, { type: 'button_template', contentText: '依頼番号 ' + id + '（' + d.store + '店・' + Number(d.price).toLocaleString() + '円×' + d.init + '口）を承認しますか？',
      actions: [{ type: 'message', label: '承認する', text: '承認する（' + id + '）', postback: 'approve:' + id },
                { type: 'message', label: '差し戻す', text: '差し戻す（' + id + '）', postback: 'reject:' + id }] });
    return json({ ok: true, id: id, cardErr: cardErr });
  } catch (err) { return json({ ok: false, error: String(err && err.message || err) }); }
}

/* ---------- LINE WORKSのボタンから（Callback URL = WebアプリURL?k=CALLBACK_KEY） ---------- */
function callback(e, k) {
  if (k !== P.getProperty('CALLBACK_KEY')) return ContentService.createTextOutput('ng');
  try {
    var ev = JSON.parse(e.postData.contents || '{}');
    // ボタンを押すと、postback付きのメッセージとして届く（ふつうの会話は無視する）
    var data = ev.type === 'postback' ? ev.data : (ev.type === 'message' && ev.content ? ev.content.postback : '');
    // 役員がグループで「在庫共有に登録」と送ると、そのグループを募集の送り先にする
    if (!data && ev.type === 'message' && ev.content && String(ev.content.text || '').trim() === '在庫共有に登録' && ev.source && ev.source.channelId) {
      var ap = (P.getProperty('LW_APPROVERS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
      if (!ap.length || ap.indexOf(ev.source.userId) >= 0) {
        P.setProperty('LW_SHARE_CHANNEL', ev.source.channelId);
        send(ev.source.channelId, { type: 'text', text: '✅ このグループを、オリパの足りない当たりの募集先に登録しました。' });
      }
      return ContentService.createTextOutput('ok');
    }
    if (!data) return ContentService.createTextOutput('ok');
    if (/^k(approve|reject):/.test(String(data))) { kaitoriCallback(ev, String(data)); return ContentService.createTextOutput('ok'); } // 買取チェック
    var sp = String(data).match(/^shipped:(.+)$/);
    if (sp) { markShipped(sp[1], userName(ev.source && ev.source.userId), 'button'); return ContentService.createTextOutput('ok'); }
    var m = String(data).match(/^(approve|reject):(.+)$/); if (!m) return ContentService.createTextOutput('ok');
    var userId = ev.source && ev.source.userId, ch = ev.source && ev.source.channelId;
    var approvers = (P.getProperty('LW_APPROVERS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
    if (approvers.length && approvers.indexOf(userId) < 0) { if (ch) send(ch, { type: 'text', text: '承認・差し戻しができるのは役員だけです。' }); return ContentService.createTextOutput('ok'); }
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var row = findRow(m[2]); if (!row) return ContentService.createTextOutput('ok');
      var name = userName(userId);
      if (row.values[9] !== '承認待ち') { if (ch) send(ch, { type: 'text', text: '依頼番号 ' + m[2] + ' はすでに「' + row.values[9] + '」です（' + row.values[10] + '）。' }); return ContentService.createTextOutput('ok'); }
      var st = m[1] === 'approve' ? '承認' : '差し戻し';
      sheet().getRange(row.r, 10, 1, 4).setValues([[st, name, new Date(), userId]]);
      if (ch) send(ch, { type: 'text', text: (st === '承認' ? '✅ 承認しました' : '↩️ 差し戻しました') + '（依頼番号 ' + m[2] + '・' + name + '）' +
        (st === '承認' ? '\nツールの「マイカに一時保存」を押せるようになりました。' : '\n直してほしい点をこのトークで伝えてください。') });
    } finally { lock.releaseLock(); }
  } catch (err) { console.error(err); }
  return ContentService.createTextOutput('ok');
}

/* ---------- 発送依頼（全店オリパ）：「送りました」ボタンとタスクの完了をそろえる ---------- */
function pickSheet() {
  var ss = SpreadsheetApp.openById(prop('SHEET_ID')), sh = ss.getSheetByName('発送依頼');
  if (!sh) { sh = ss.insertSheet('発送依頼'); sh.appendRow(['依頼番号', '依頼日時', '店舗', '件名', 'タスクID', '状態', '送った人', '送った日時', '期限']); sh.setFrozenRows(1); }
  return sh;
}
// via: 'button'（トークのボタン）／'task'（タスクを完了にした）
function markShipped(pid, who, via) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = pickSheet(), vals = sh.getDataRange().getValues(), r = -1;
    for (var i = vals.length - 1; i >= 1; i--) if (vals[i][0] === pid) { r = i; break; }
    if (r < 0) return;
    var v = vals[r], ch = CH[v[2]];
    if (v[5] !== '依頼中') { if (via === 'button' && ch) send(ch, { type: 'text', text: '依頼番号 ' + pid + ' はすでに発送済みです（' + v[6] + '）。' }); return; }
    var now = new Date(), when = Utilities.formatDate(now, 'Asia/Tokyo', 'M/d HH:mm');
    sh.getRange(r + 1, 6, 1, 3).setValues([['発送済み', who || (via === 'task' ? 'タスクで完了' : ''), now]]);
    var note = '';
    if (via === 'button' && v[4]) {
      try {
        var cr = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/tasks/' + v[4] + '/complete', { method: 'post', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + userToken() } });
        note = cr.getResponseCode() < 300 ? '\nLINE WORKSのタスクも完了にしました。' : '\n（タスクは自動で完了にできませんでした。タスク画面から完了にしてください）';
        if (cr.getResponseCode() >= 300) console.error('task complete ' + cr.getResponseCode() + ' ' + cr.getContentText());
      } catch (e) { console.error(e); note = '\n（タスクは自動で完了にできませんでした。タスク画面から完了にしてください）'; }
    }
    if (ch) send(ch, { type: 'text', text: '✅ ' + v[2] + '店：発送しました（' + (via === 'task' ? 'タスクが完了になりました' : (who || '')) + '・' + when + '）\n依頼番号 ' + pid + note });
  } finally { lock.releaseLock(); }
}
// 10分おき（トリガー）：店舗がタスクの方を完了にしたら、発送済みにしてグループに知らせる
function checkTasks() {
  var sh = pickSheet(), vals = sh.getDataRange().getValues(), ut;
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i]; if (v[5] !== '依頼中' || !v[4]) continue;
    try {
      ut = ut || userToken();
      var r = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/tasks/' + v[4], { headers: { Authorization: 'Bearer ' + ut }, muteHttpExceptions: true });
      if (r.getResponseCode() >= 300) { console.error('task get ' + r.getResponseCode() + ' ' + r.getContentText()); continue; }
      var j = JSON.parse(r.getContentText() || '{}');
      var done = j.status === 'DONE' || (j.assignees || []).some(function (a) { return a.status === 'DONE'; });
      if (done) markShipped(v[0], '', 'task');
    } catch (e) { console.error(e); }
  }
}
function findRow(id) {
  if (!id) return null;
  var sh = sheet(), vals = sh.getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) if (vals[i][0] === id) return { r: i + 1, values: vals[i] };
  return null;
}

/** 確認用：柏店グループのメンバー（名前とID）をログに出す。承認できる人（LW_APPROVERS）を決めるのに使う */
function listMembers() {
  var r = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/bots/' + prop('LW_BOT_ID') + '/channels/' + CH['柏'] + '/members', { headers: { Authorization: 'Bearer ' + token() }, muteHttpExceptions: true });
  var j = JSON.parse(r.getContentText() || '{}');
  (j.members || []).forEach(function (id) { Logger.log(userName(id) + ' : ' + id); });
  if (!j.members) Logger.log(r.getContentText());
}
