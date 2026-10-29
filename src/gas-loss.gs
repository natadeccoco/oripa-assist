/**
 * ロス申請（LINE WORKS）  ※「オリパ本部承認（LINE WORKS）」と同じGASプロジェクトに入れるファイル
 * 店舗のマイカ画面で動く「ロス申請」ツールから呼ばれる。
 *   POST {action:'loss', store, requester, genre, reason, lines:[{name,count,price,cost,cond}], photos:[b64]}
 *        … 「ロス申請」グループに承認ボタン付きで送る → 申請番号を返す
 *   GET  ?action=lstatus&id=…   … 申請の結果
 *   GET  ?action=llist&store=… … その店の最近の申請（ツールの「最近の申請」）
 *   POST {action:'losscheck', key, stores:[{store, losses:[マイカのロス]}]}
 *        … 雄司のPC（loss_check.ps1、毎晩22時）から。承認のないロスを「ロス申請」グループに警告。backfill:true なら「導入前」として記録だけ
 *   集計は「ロス分析」タブ（夜のチェックのたびに作り直す）
 * LINE WORKSのボタン：postback 'lapprove:ID' / 'lreject:ID'（callback() から lossCallback() に回す）
 * 送り先：役員が「ロス申請」グループで「ロス申請に登録」と送ると、そのグループが登録される（LW_LOSS_CHANNEL）
 * スクリプト プロパティ LOSS_KEY … lSetup() が作る。PCの config.json の LOSS_KEY と同じ値（夜のチェック用の合言葉）
 * 履歴は「オリパ承認履歴」スプレッドシート（SHEET_ID）の「ロス申請」「マイカのロス」「ロス設定」タブ。
 */
var L_COLS = ['申請番号', '申請日時', '店舗', '申請者', 'ロス区分', '理由', '内容', '点数', '販売価格合計', '原価合計', '状態', '判断した人', '判断日時', 'マイカのロスID', '照合日時'];
var M_COLS = ['マイカのロスID', '店舗', 'マイカ登録日時', 'ロス区分', '理由', '点数', '販売価格合計', '商品', '判定', '申請番号', 'チェック日時', '登録したアカウント'];
var L_ID_RE = /L\d{4}-\d{6}-\d{2}/;

function lBook() { return SpreadsheetApp.openById(prop('SHEET_ID')); }
function lSheet() {
  var ss = lBook(), sh = ss.getSheetByName('ロス申請');
  if (!sh) { sh = ss.insertSheet('ロス申請'); sh.appendRow(L_COLS); sh.setFrozenRows(1); }
  return sh;
}
function mSheet() {
  var ss = lBook(), sh = ss.getSheetByName('マイカのロス');
  if (!sh) { sh = ss.insertSheet('マイカのロス'); sh.appendRow(M_COLS); sh.setFrozenRows(1); }
  return sh;
}
function lSettingSheet() {
  var ss = lBook(), sh = ss.getSheetByName('ロス設定');
  if (!sh) {
    sh = ss.insertSheet('ロス設定');
    sh.getRange(1, 1, 1, 2).setValues([['【承認がいらないロス】理由・ロス区分にこの言葉が入っていれば警告しない', 'メモ']]);
    sh.getRange(2, 1, 1, 2).setValues([['棚卸での調整', '本部が月末にまとめて入れる棚卸の調整']]);
    sh.setFrozenRows(1); sh.setColumnWidth(1, 420); sh.setColumnWidth(2, 300);
  }
  return sh;
}
function lExempt() {
  return lSettingSheet().getDataRange().getValues().slice(1).map(function (v) { return String(v[0] || '').trim(); }).filter(String);
}
function lFind(id) {
  if (!id) return null;
  var vals = lSheet().getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) if (vals[i][0] === id) return { r: i + 1, values: vals[i] };
  return null;
}
function lChannel() { return P.getProperty('LW_LOSS_CHANNEL') || ''; }
function lYen(n) { return Math.round(Number(n) || 0).toLocaleString() + '円'; }
function lNorm(s) { return String(s || '').normalize('NFKC').replace(/\s+/g, '').replace(/[《》]/g, '').toUpperCase(); }

/* ---------- ツールから ---------- */
function lossGet(p) {
  try {
    if (p.action === 'lstatus') {
      var row = lFind(p.id); if (!row) return json({ ok: false, error: '申請が見つかりません' });
      var v = row.values;
      return json({ ok: true, id: v[0], status: v[10], by: v[11], at: v[12] ? String(v[12]) : '', myca: v[13] || '' });
    }
    if (p.action === 'llist') {
      var vals = lSheet().getDataRange().getValues(), out = [], since = Date.now() - 14 * 864e5;
      for (var i = vals.length - 1; i >= 1 && out.length < 30; i--) {
        var w = vals[i]; if (p.store && w[2] !== p.store) continue;
        if (new Date(w[1]).getTime() < since) break;
        out.push({ id: w[0], at: String(w[1]), requester: w[3], genre: w[4], reason: w[5], text: w[6], count: w[7], total: w[8], status: w[10], by: w[11], myca: w[13] || '' });
      }
      return json({ ok: true, list: out, channel: !!lChannel() });
    }
    return json({ ok: false, error: '不明な操作です' });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }); }
}

function lossPost(d) {
  if (d.action === 'losscheck') return lossCheck(d);
  var ch = lChannel();
  if (!ch) return json({ ok: false, error: 'LINE WORKSの「ロス申請」グループがまだ登録されていません（本部に連絡してください）' });
  if (!d.store) return json({ ok: false, error: '店舗がわかりません' });
  if (!d.requester) return json({ ok: false, error: '申請者の名前を入れてください' });
  var lines = (d.lines || []).filter(function (x) { return x && x.name && Number(x.count) > 0; });
  if (!lines.length) return json({ ok: false, error: 'ロスする商品を入れてください' });
  if (!String(d.reason || '').trim()) return json({ ok: false, error: '理由を入れてください' });
  var cnt = 0, tot = 0, cost = 0;
  lines.forEach(function (x) { cnt += Number(x.count); tot += Number(x.price || 0) * Number(x.count); cost += Number(x.cost || 0) * Number(x.count); });
  var text = lines.map(function (x) { return '・' + x.name + (x.cond ? '［' + x.cond + '］' : '') + ' ×' + x.count + (x.price ? '（' + lYen(x.price) + '）' : ''); }).join('\n');
  var lock = LockService.getScriptLock(), id; lock.waitLock(20000);
  try {
    id = 'L' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MMdd-HHmmss') + '-' + Math.floor(Math.random() * 90 + 10);
    lSheet().appendRow([id, new Date(), d.store, d.requester, d.genre || '', d.reason, text, cnt, tot, cost, '承認待ち', '', '', '', '']);
  } finally { lock.releaseLock(); }
  var msg = '【ロス申請】' + d.store + '店　申請者：' + d.requester + '\n申請番号：' + id +
    '\nロス区分：' + (d.genre || '（なし）') + '\n理由：' + d.reason +
    '\n\n' + text + '\n\n合計 ' + cnt + '点　販売価格 ' + lYen(tot) + (cost ? '　原価 ' + lYen(cost) : '');
  kSplit(msg).forEach(function (x) { send(ch, { type: 'text', text: x }); });
  var imgErr = '';
  (d.photos || []).slice(0, 4).forEach(function (b64, i) {
    try { send(ch, { type: 'image', fileId: uploadImage(b64, 'loss_' + id + '_' + (i + 1) + '.jpg') }); } catch (e) { imgErr = String(e.message || e); console.error(imgErr); }
  });
  send(ch, { type: 'button_template', contentText: '申請番号 ' + id + '（' + d.store + '店・' + cnt + '点・' + lYen(tot) + '）のロスを承認しますか？',
    actions: [{ type: 'message', label: '承認する', text: '承認する（' + id + '）', postback: 'lapprove:' + id },
              { type: 'message', label: '差し戻す', text: '差し戻す（' + id + '）', postback: 'lreject:' + id }] });
  return json({ ok: true, id: id, imageErr: imgErr });
}

/* ---------- LINE WORKSのボタン ---------- */
function lossCallback(ev, data) {
  var m = String(data).match(/^l(approve|reject):(.+)$/); if (!m) return;
  var userId = ev.source && ev.source.userId, ch = ev.source && ev.source.channelId;
  var approvers = (P.getProperty('LW_APPROVERS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  if (approvers.length && approvers.indexOf(userId) < 0) { if (ch) send(ch, { type: 'text', text: '承認・差し戻しができるのは役員だけです。' }); return; }
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var row = lFind(m[2]); if (!row) return;
    var name = userName(userId);
    if (row.values[10] !== '承認待ち') { if (ch) send(ch, { type: 'text', text: '申請番号 ' + m[2] + ' はすでに「' + row.values[10] + '」です（' + row.values[11] + '）。' }); return; }
    var st = m[1] === 'approve' ? '承認' : '差し戻し';
    lSheet().getRange(row.r, 11, 1, 3).setValues([[st, name, new Date()]]);
    if (ch) send(ch, { type: 'text', text: st === '承認'
      ? '✅ ロスを承認しました（' + row.values[2] + '店・申請番号 ' + m[2] + '・' + name + '）\nマイカでロス登録するときは、理由の欄に申請番号「' + m[2] + '」を入れてください。'
      : '↩️ ロスを差し戻しました（' + row.values[2] + '店・申請番号 ' + m[2] + '・' + name + '）\nこのロスはマイカに登録しないでください。直してほしい点をこのトークで伝えてください。' });
  } finally { lock.releaseLock(); }
}
// 役員が「ロス申請」グループで「ロス申請に登録」と送ったとき（callback() から）
function lossRegister(ev) {
  var ap = (P.getProperty('LW_APPROVERS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  if (ap.length && ap.indexOf(ev.source.userId) < 0) return;
  P.setProperty('LW_LOSS_CHANNEL', ev.source.channelId);
  send(ev.source.channelId, { type: 'text', text: '✅ このグループを「ロス申請」の送り先に登録しました。\n店舗のロス申請と、承認のないロスの警告（毎晩22時）がここに届きます。' });
}

/* ---------- 夜のチェック（PCから） ---------- */
function lossCheck(d) {
  if (!P.getProperty('LOSS_KEY') || d.key !== P.getProperty('LOSS_KEY')) return json({ ok: false, error: 'key' });
  var ch = lChannel();
  var exempt = lExempt();
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  var bad = [], newCount = 0;
  try {
    var ms = mSheet(), mv = ms.getDataRange().getValues(), seen = {};
    for (var i = 1; i < mv.length; i++) seen[String(mv[i][0])] = true;
    var ls = lSheet(), lv = ls.getDataRange().getValues();
    var used = {}; for (var j = 1; j < lv.length; j++) if (lv[j][13]) used[lv[j][0]] = true;
    var now = new Date(), rows = [];
    (d.stores || []).forEach(function (st) {
      (st.losses || []).forEach(function (L) {
        var key = String(L.id); if (seen[key]) return; seen[key] = true; newCount++;
        var reason = String(L.reason || ''), genre = String(L.genre || '');
        var names = (L.products || []).map(function (p) { return p.name + ' ×' + p.count; });
        var judge = '', appId = '';
        if (d.backfill) judge = '導入前';
        if (!judge && exempt.some(function (w) { return reason.indexOf(w) >= 0 || genre.indexOf(w) >= 0; })) judge = '対象外';
        if (!judge) {
          var mm = reason.match(L_ID_RE);
          if (mm) {
            appId = mm[0];
            var hit = null; for (var k = lv.length - 1; k >= 1; k--) if (lv[k][0] === appId) { hit = { r: k + 1, v: lv[k] }; break; }
            if (!hit) judge = '無承認（申請番号が見つからない）';
            else if (hit.v[2] !== st.store) judge = '無承認（別の店の申請番号）';
            else if (hit.v[10] === '承認') { judge = '承認済み'; ls.getRange(hit.r, 14, 1, 2).setValues([[key, now]]); used[appId] = true; }
            else judge = '無承認（申請が「' + hit.v[10] + '」）';
          }
        }
        if (!judge) { // 申請番号が書かれていない → 同じ店・14日以内の承認済み申請と商品名で照らし合わせる
          var created = new Date(L.created_at).getTime(), pn = (L.products || []).map(function (p) { return lNorm(p.name); });
          for (var q = lv.length - 1; q >= 1; q--) {
            var a = lv[q]; if (a[2] !== st.store || a[10] !== '承認' || used[a[0]]) continue;
            var at = new Date(a[1]).getTime(); if (at > created + 3600e3 || at < created - 14 * 864e5) continue;
            var an = lNorm(a[6]);
            if (pn.length && pn.some(function (n) { return n && an.indexOf(n) >= 0; })) { judge = '承認済み（申請番号なし・商品名で照合）'; appId = a[0]; used[a[0]] = true; ls.getRange(q + 1, 14, 1, 2).setValues([[key, now]]); break; }
          }
        }
        if (!judge) judge = '無承認';
        rows.push([key, st.store, new Date(L.created_at), genre, reason, Number(L.count) || 0, Number(L.total) || 0, names.join('\n'), judge, appId, now, L.staff || '']);
        if (/^無承認/.test(judge)) bad.push({ store: st.store, at: L.created_at, genre: genre, reason: reason, count: L.count, total: L.total, names: names, judge: judge });
      });
    });
    if (rows.length) ms.getRange(ms.getLastRow() + 1, 1, rows.length, M_COLS.length).setValues(rows);
  } finally { lock.releaseLock(); }
  var sent = false;
  try { lAnalyze(); } catch (e) { console.error(e); }
  if (bad.length && ch && !d.backfill) {
    var t = '⚠️【承認のないロスがあります】' + bad.length + '件\nマイカにロス登録されていますが、ロス申請の承認が確認できませんでした。該当店舗は本部に事情を連絡してください。\n';
    bad.forEach(function (b) {
      var x = new Date(new Date(b.at).getTime() + 9 * 3600e3);
      t += '\n■ ' + b.store + '店　' + (x.getUTCMonth() + 1) + '/' + x.getUTCDate() + ' ' + String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0') +
        '　' + (b.count || 0) + '点・' + lYen(b.total) + '\n　区分：' + (b.genre || 'なし') + '／理由：' + (b.reason || 'なし').replace(/\n/g, ' ') +
        '\n　' + b.names.slice(0, 6).join('、') + (b.names.length > 6 ? ' ほか' + (b.names.length - 6) + '件' : '') + '\n　判定：' + b.judge + '\n';
    });
    kSplit(t).forEach(function (x) { send(ch, { type: 'text', text: x }); });
    sent = true;
  }
  return json({ ok: true, checked: newCount, bad: bad.length, sent: sent, channel: !!ch });
}

/* ---------- ロス分析（「マイカのロス」から店舗別・月別に集計） ---------- */
var L_STORES = ['千葉中央', '柏', '町田', '松戸', '中野', 'お台場', '津田沼', '横浜'];
function lAnalyze() {
  var mv = mSheet().getDataRange().getValues().slice(1), exempt = lExempt();
  var ym = function (d) { return Utilities.formatDate(new Date(d), 'Asia/Tokyo', 'yyyy/MM'); };
  var months = {}, agg = {}, gen = {};
  mv.forEach(function (r) {
    if (!r[0] || !r[2]) return;
    var st = r[1], m = ym(r[2]), j = String(r[8] || ''), reason = String(r[4] || ''), genre = String(r[3] || '');
    var tana = exempt.some(function (w) { return reason.indexOf(w) >= 0 || genre.indexOf(w) >= 0; });
    months[m] = 1;
    var k = st + '|' + m, a = agg[k] || (agg[k] = { n: 0, pts: 0, yen: 0, tn: 0, tyen: 0, ok: 0, bad: 0 });
    if (tana) { a.tn++; a.tyen += Number(r[6]) || 0; return; }
    a.n++; a.pts += Number(r[5]) || 0; a.yen += Number(r[6]) || 0;
    if (/^承認済み/.test(j)) a.ok++; else if (/^無承認/.test(j)) a.bad++;
    var g = genre || '（区分なし）', gk = st + '|' + g, b = gen[gk] || (gen[gk] = { n: 0, yen: 0 }); b.n++; b.yen += Number(r[6]) || 0;
  });
  var ms = Object.keys(months).sort().reverse();
  var ss = lBook(), sh = ss.getSheetByName('ロス分析') || ss.insertSheet('ロス分析');
  sh.clear();
  var out = [['ロス分析（「マイカのロス」から自動集計・夜のチェックのたびに更新）', '', '', '', '', '', '', '', '', ''],
    ['※金額はマイカの販売価格ベース。「棚卸での調整」など承認不要のロスは別枠。無承認率＝無承認÷（承認済み＋無承認）。11/1より前は申請の仕組みがないため「導入前」', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    ['月', '店舗', 'ロス件数', 'ロス点数', 'ロス金額', '承認済み', '無承認', '無承認率', '棚卸調整 件数', '棚卸調整 金額']];
  ms.forEach(function (m) {
    var tot = { n: 0, pts: 0, yen: 0, ok: 0, bad: 0, tn: 0, tyen: 0 };
    L_STORES.forEach(function (st) {
      var a = agg[st + '|' + m] || { n: 0, pts: 0, yen: 0, ok: 0, bad: 0, tn: 0, tyen: 0 };
      Object.keys(tot).forEach(function (k) { tot[k] += a[k]; });
      var den = a.ok + a.bad;
      out.push([m, st, a.n, a.pts, a.yen, a.ok, a.bad, den ? a.bad / den : '', a.tn, a.tyen]);
    });
    var d2 = tot.ok + tot.bad;
    out.push([m, '全店合計', tot.n, tot.pts, tot.yen, tot.ok, tot.bad, d2 ? tot.bad / d2 : '', tot.tn, tot.tyen]);
  });
  out.push(['', '', '', '', '', '', '', '', '', ''], ['【全期間】店舗 × ロス区分（棚卸調整を除く）', '', '', '', '', '', '', '', '', ''], ['店舗', 'ロス区分', '件数', '金額', '', '', '', '', '', '']);
  Object.keys(gen).sort(function (x, y) { return gen[y].yen - gen[x].yen; }).forEach(function (k) {
    var p = k.split('|'); out.push([p[0], p[1], gen[k].n, gen[k].yen, '', '', '', '', '', '']);
  });
  sh.getRange(1, 1, out.length, 10).setValues(out);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1).setFontColor('#666666');
  sh.getRange(4, 1, 1, 10).setFontWeight('bold').setBackground('#efede7');
  var n1 = 4 + ms.length * 9;
  if (ms.length) {
    sh.getRange(5, 5, ms.length * 9, 1).setNumberFormat('#,##0"円"');
    sh.getRange(5, 10, ms.length * 9, 1).setNumberFormat('#,##0"円"');
    sh.getRange(5, 8, ms.length * 9, 1).setNumberFormat('0%');
    for (var i = 0; i < ms.length; i++) sh.getRange(5 + i * 9 + 8, 1, 1, 10).setFontWeight('bold').setBackground('#f6f5f2');
  }
  sh.getRange(n1 + 2, 1).setFontWeight('bold');
  sh.getRange(n1 + 3, 1, 1, 4).setFontWeight('bold').setBackground('#efede7');
  if (out.length > n1 + 3) sh.getRange(n1 + 4, 4, out.length - n1 - 3, 1).setNumberFormat('#,##0"円"');
  sh.setFrozenRows(4); sh.autoResizeColumns(2, 9); sh.setColumnWidth(1, 80);
}

/** 1回だけ：Botが「ロス申請」グループ（役員＋全店の店舗アカウント）を作って、送り先に登録する */
function lCreateGroup() {
  if (lChannel()) { Logger.log('すでに登録済み：' + lChannel()); return; }
  var ap = (P.getProperty('LW_APPROVERS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  var miss = [], members = ap.slice();
  Object.keys(CH).forEach(function (s) { var u = ''; try { u = storeUser(s); } catch (e) { } if (u) { if (members.indexOf(u) < 0) members.push(u); } else miss.push(s); });
  Logger.log('メンバー ' + members.length + '人：' + members.map(userName).join('、') + (miss.length ? '／見つからない店：' + miss.join('、') : ''));
  var r = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/bots/' + prop('LW_BOT_ID') + '/channels', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token() }, payload: JSON.stringify({ members: members, title: 'ロス申請' })
  });
  var j = JSON.parse(r.getContentText() || '{}');
  if (!j.channelId) throw new Error('グループを作れませんでした（' + r.getResponseCode() + '）: ' + r.getContentText());
  P.setProperty('LW_LOSS_CHANNEL', j.channelId);
  send(j.channelId, { type: 'text', text: '「ロス申請」グループです。\n店舗のロス申請（承認・差し戻しは役員のみ）と、承認のないロスの警告（毎晩22時）がここに届きます。\nロスはマイカに登録する前に、ブックマークの「ロス申請」から申請してください。' });
  Logger.log('作成・登録しました：' + j.channelId);
}

/** 最初に1回：タブと LOSS_KEY を作る */
function lSetup() {
  lSheet(); mSheet(); lSettingSheet();
  if (!P.getProperty('LOSS_KEY')) P.setProperty('LOSS_KEY', 'loss-' + Utilities.getUuid().replace(/-/g, ''));
  Logger.log('ロス申請の送り先：' + (lChannel() || 'まだ（グループで「ロス申請に登録」と送る）'));
  Logger.log('LOSS_KEY（PCの config.json に入れる）：' + P.getProperty('LOSS_KEY'));
}
