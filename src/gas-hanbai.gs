/**
 * 販売価格の承認（LINE WORKS）  ※「オリパ本部承認（LINE WORKS）」と同じGASプロジェクトに入れるファイル（販売価格.gs）
 * 店舗のマイカ画面で動く「販売価格の承認」ツールから呼ばれる。
 *   POST {action:'hanbai', store, requester, comment, lines:[{pid, name, cond, kind, cost, now, price, source, low, last, url}]}
 *        … 複数枚を1つの依頼番号で、店舗のLINE WORKSグループに承認ボタン付きで送る → 依頼番号を返す（シートはカード1枚＝1行）
 *   GET  ?action=hlist&store=… … その店の最近の依頼（ツールの「最近の依頼」）
 * LINE WORKSのボタン：postback 'happrove:ID' / 'hreject:ID'（callback() から hanbaiCallback() に回す）
 * 履歴は「オリパ承認履歴」スプレッドシート（SHEET_ID）の「販売価格」タブ。
 * スニダンの価格は買取チェックと同じ ?action=ksnkr を使う。
 */
var HB_COLS = ['依頼番号', '依頼日時', '店舗', '依頼者', '種類', 'マイカ商品ID', '商品', '状態', '原価', '今の販売価格', '依頼価格', '粗利率', '価格の決め方', 'スニダン最安出品', 'スニダン直近取引', 'スニダンURL', 'コメント', '結果', '判断した人', '判断日時'];

function hbSheet() {
  var ss = SpreadsheetApp.openById(prop('SHEET_ID')), sh = ss.getSheetByName('販売価格');
  if (!sh) { sh = ss.insertSheet('販売価格'); sh.appendRow(HB_COLS); sh.setFrozenRows(1); }
  return sh;
}
function hbYen(n) { return Math.round(Number(n) || 0).toLocaleString() + '円'; }
function hbMargin(price, cost) { return price > 0 && cost > 0 ? (price - cost) / price : ''; }

function hanbaiGet(p) {
  try {
    if (p.action === 'hlist') {
      var vals = hbSheet().getDataRange().getValues(), out = [], byId = {}, since = Date.now() - 14 * 864e5;
      for (var i = vals.length - 1; i >= 1; i--) {
        var w = vals[i];
        if (new Date(w[1]).getTime() < since) break;
        if (p.store && w[2] !== p.store) continue;
        var o = byId[w[0]];
        if (!o) { if (out.length >= 30) break; o = byId[w[0]] = { id: w[0], at: new Date(w[1]).toISOString(), requester: w[3], status: w[17], by: w[18], items: [] }; out.push(o); }
        o.items.unshift({ name: w[6], now: w[9], price: w[10] });
      }
      return json({ ok: true, list: out });
    }
    return json({ ok: false, error: '不明な操作です' });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }); }
}

function hanbaiPost(d) {
  var ch = d.store === 'テスト' ? P.getProperty('K_WARN_CHANNEL') : CH[d.store]; // 店舗「テスト」は役員の買取警告グループ（動作確認用）
  if (!ch) return json({ ok: false, error: '店舗「' + d.store + '」のLINE WORKSグループが登録されていません' });
  if (!d.requester) return json({ ok: false, error: '依頼者の名前を入れてください' });
  var lines = (d.lines || []).filter(function (x) { return x && x.name && Number(x.price) > 0; });
  if (!lines.length) return json({ ok: false, error: 'カードと販売価格を入れてください' });
  var id, lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = hbSheet(), vs = sh.getDataRange().getValues(), dup = [];
    for (var i = vs.length - 1; i >= 1; i--) { // 同じ店の同じカードに承認待ちがあれば二重に送らない
      if (vs[i][2] !== d.store || vs[i][17] !== '承認待ち') continue;
      lines.forEach(function (x) { if (String(vs[i][5]) === String(x.pid)) dup.push(x.name + '（' + vs[i][0] + '）'); });
    }
    if (dup.length) return json({ ok: false, error: 'すでに承認待ちのカードがあります：' + dup.join('、') });
    id = 'H' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MMdd-HHmmss') + '-' + Math.floor(Math.random() * 90 + 10);
    var now = new Date();
    var rows = lines.map(function (x) { var cost = Number(x.cost) || 0, price = Number(x.price);
      return [id, now, d.store, d.requester, x.kind || '', x.pid || '', x.name, x.cond || '', cost, Number(x.now) || 0, price, hbMargin(price, cost), x.source || '', Number(x.low) || '', Number(x.last) || '', x.url || '', d.comment || '', '承認待ち', '', '']; });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, HB_COLS.length).setValues(rows);
  } finally { lock.releaseLock(); }
  var total = 0, body = lines.map(function (x, k) {
    var price = Number(x.price), cost = Number(x.cost) || 0, mg = hbMargin(price, cost); total += price;
    return (k + 1) + '. ' + x.name + (x.kind ? '［' + x.kind + '］' : '') +
      '\n　販売価格：' + hbYen(price) + '（今 ' + hbYen(x.now) + '）' +
      '\n　原価：' + (cost ? hbYen(cost) + '　粗利率：' + Math.round(mg * 1000) / 10 + '%' + (mg < 0.1 ? ' ⚠️10%未満' : '') : '不明') +
      '\n　決め方：' + (x.source || '手入力') +
      (x.low || x.last ? '\n　スニダン：最安出品 ' + (x.low ? hbYen(x.low) : 'なし') + '／直近の取引 ' + (x.last ? hbYen(x.last) : 'なし') : '') +
      (x.url ? '\n　' + x.url : '');
  }).join('\n\n');
  var msg = '【販売価格 承認依頼】' + d.store + '店　依頼者：' + d.requester + '\n依頼番号：' + id + '\n' + lines.length + '枚・販売価格 合計 ' + hbYen(total) +
    (d.comment ? '\nコメント：' + d.comment : '') + '\n\n' + body;
  kSplit(msg).forEach(function (x) { send(ch, { type: 'text', text: x }); });
  send(ch, { type: 'button_template', contentText: '依頼番号 ' + id + '（' + d.store + '店・' + lines.length + '枚・' + hbYen(total) + '）の販売価格をまとめて承認しますか？',
    actions: [{ type: 'message', label: '承認する', text: '承認する（' + id + '）', postback: 'happrove:' + id },
              { type: 'message', label: '差し戻す', text: '差し戻す（' + id + '）', postback: 'hreject:' + id }] });
  return json({ ok: true, id: id, count: lines.length });
}

function hanbaiCallback(ev, data) {
  var m = String(data).match(/^h(approve|reject):(.+)$/); if (!m) return;
  var userId = ev.source && ev.source.userId, ch = ev.source && ev.source.channelId;
  var approvers = (P.getProperty('LW_APPROVERS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  if (approvers.length && approvers.indexOf(userId) < 0) { if (ch) send(ch, { type: 'text', text: '承認・差し戻しができるのは役員だけです。' }); return; }
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = hbSheet(), vs = sh.getDataRange().getValues(), rows = [];
    for (var i = 1; i < vs.length; i++) if (vs[i][0] === m[2]) rows.push(i);
    if (!rows.length) return;
    var v = vs[rows[0]], name = userName(userId);
    if (v[17] !== '承認待ち') { if (ch) send(ch, { type: 'text', text: '依頼番号 ' + m[2] + ' はすでに「' + v[17] + '」です（' + v[18] + '）。' }); return; }
    var st = m[1] === 'approve' ? '承認' : '差し戻し', at = new Date();
    rows.forEach(function (r) { sh.getRange(r + 1, 18, 1, 3).setValues([[st, name, at]]); });
    var list = rows.map(function (r) { return '・' + vs[r][6] + (st === '承認' ? '：' + hbYen(vs[r][10]) : ''); }).join('\n');
    if (ch) kSplit(st === '承認'
      ? '✅ 販売価格を承認しました（依頼番号 ' + m[2] + '・' + rows.length + '枚・' + name + '）\nマイカでこの価格に変更してください。\n' + list
      : '↩️ 販売価格を差し戻しました（依頼番号 ' + m[2] + '・' + rows.length + '枚・' + name + '）\nマイカの価格は変更しないでください。直す点をこのトークで伝えてください。\n' + list).forEach(function (x) { send(ch, { type: 'text', text: x }); });
  } finally { lock.releaseLock(); }
}
