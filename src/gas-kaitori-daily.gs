/**
 * 全店買取チェック  ※「オリパ本部承認（LINE WORKS）」と同じGASプロジェクトに入れるファイル（買取チェック.gs の kPrices などを使う）
 * 雄司のPC（myca_import の kaitori_check.ps1、毎晩22:10・23:40）から、その日の全店の買取明細が届く。
 *   POST {action:'kaitori', kind:'dailyjudge', key, lines:[…]} … 買取表より高く買った行のキーを返す（書き込みはしない）
 *   POST {action:'kaitori', kind:'dailywrite', key, lines:[…]} … 該当行に状態・お客様名を付けて送り直す → スプレッドシートに追記
 *   あわせて、承認ライン以上なのに本部承認がない買取・最終チェック（確認サイン）がない買取を「承認・チェック漏れ」タブにため、役員の買取警告グループに送る
 * 合言葉はスクリプト プロパティ LOSS_KEY（PCの config.json の LOSS_KEY と同じ。ロスのチェックと共用）
 * 書き込み先：スプレッドシート「買取表チェック（全店）」（初回に自動作成、IDはスクリプト プロパティ K_DAILY_SHEET）
 */
var KD_COLS = ['確認状況', '社員への確認メモ', '買取日時', '店舗', '受付番号', 'お客様', '商品', '型番', 'パック', 'レアリティ', '状態', '枚数', '買取単価', '買取表', '買取表比', '上乗せ額', '判定', '理由', '買取表のタブ', '査定者', '承認依頼番号', 'マイカ取引ID', 'キー'];
var KD_HIGH = 1.1;

function kdBook() {
  var id = P.getProperty('K_DAILY_SHEET'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('買取表チェック（全店）');
    P.setProperty('K_DAILY_SHEET', ss.getId());
    var sh = ss.getSheets()[0]; sh.setName('明細');
    sh.getRange(1, 1, 1, KD_COLS.length).setValues([KD_COLS]).setFontWeight('bold').setBackground('#efede7');
    sh.setFrozenRows(1); sh.setFrozenColumns(2);
    sh.setColumnWidth(2, 220); sh.setColumnWidth(7, 300); sh.setColumnWidth(18, 280);
    ss.insertSheet('集計');
  }
  var m = ss.getSheetByName('明細'); // 列の追加（型番・パック・レアリティ）：古い形のシートなら列を差し込む
  if (m && m.getRange(1, 8).getValue() !== '型番') { m.insertColumnsAfter(7, 3); m.getRange(1, 8, 1, 3).setValues([['型番', 'パック', 'レアリティ']]).setFontWeight('bold').setBackground('#efede7'); }
  return ss;
}

/* ---------- マイカの明細1行と買取表の照合（ツールの kaitori-check.js と同じ考え方） ---------- */
function kdN(s) { return String(s == null ? '' : s).normalize('NFKC').toUpperCase().replace(/\s+/g, ''); }
function kdBase(s) { return kdN(String(s || '').replace(/《[^》]*》/g, '').replace(/[（(][^）)]*[）)]\s*$/, '')).replace(/[・･]/g, ''); }
function kdBoxKey(s) { return kdN(String(s || '').replace(/《[^》]*》/g, '').replace(/[（(][^）)]*[）)]/g, '')).replace(/BOX|ボックス|強化拡張パック|拡張パック|ハイクラスパック|シュリンク(無|なし|有|あり)?|【[^】]*】|[・･\-ー]/g, ''); }
function kdHit(a, b) { return a && b && (a === b || (a.length >= 3 && b.indexOf(a) >= 0) || (b.length >= 3 && a.indexOf(b) >= 0)); }
function kdIndex() {
  var I = { model: {}, name: {}, box: [] };
  kPrices().forEach(function (r) {
    if (r.k === 'box') { r.bk = kdBoxKey(r.n); I.box.push(r); return; }
    r.bn = kdBase(r.n);
    if (r.m) (I.model[kdN(r.m)] = I.model[kdN(r.m)] || []).push(r);
    (I.name[r.bn] = I.name[r.bn] || []).push(r);
  });
  return I;
}
// l: {name, pname, no, exp, rar, cat, unit, cnt}
function kdJudge(I, l) {
  var dn = l.name || l.pname || '', nm = l.pname || dn, unit = Number(l.unit) || 0;
  var isBox = l.cat === 'ボックス' || /BOX|ボックス/i.test(dn), psaM = dn.match(/PSA\s*(\d+)/i), isPsa = !!psaM;
  var hanyo = /【@|ポケモン\/トレーナーズ/.test(dn), at = dn.normalize('NFKC').match(/【@\s*(\d+)\s*】/);
  var o = { refs: [], hit: '', why: '' };
  if (hanyo) {
    if (at && unit !== Number(at[1])) { o.hit = '🚨@と単価が違う'; o.why = 'トレーナーズ【@' + at[1] + '】なのに単価' + unit + '円'; }
    return o;
  }
  if (isBox) {
    var k = kdBoxKey(dn), noShrink = /シュリンク(無|なし)/.test(dn);
    var hit = I.box.filter(function (r) { return r.bk === k; });
    if (!hit.length) hit = I.box.filter(function (r) { var a = r.bk, b = k; return a.length >= 3 && b.length >= 3 && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.7 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0); });
    o.refs = hit.map(function (r) { return { r: r, y: noShrink && r.y2 != null ? r.y2 : r.y }; }).filter(function (x) { return x.y; });
  } else if (!(isPsa && psaM[1] !== '10')) {
    var bn = kdBase(nm), model = kdN(l.no), pack = kdN(l.exp), rar = kdN(l.rar);
    var cands = model ? (I.model[model] || []) : [];
    cands = cands.filter(function (r) { return isPsa ? r.k === 'psa' : r.k !== 'psa'; });
    var promo = /\/[A-Z]+-P$/i.test(model);
    if (pack) cands = cands.filter(function (r) { if (r.k === 'kyouka' || !r.p || promo) return true; var q = kdN(r.p); if (!/^[A-Z0-9\-]+$/.test(q)) return /その他|PROMO/.test(q) || q.indexOf(pack) === 0; return q === pack || q.indexOf(pack) === 0 || pack.indexOf(q) === 0; });
    if (rar && cands.length > 1) { var c3 = cands.filter(function (r) { return !r.r || kdN(r.r) === rar; }); if (c3.length) cands = c3; }
    if (cands.length > 1) { var c4 = cands.filter(function (r) { return kdHit(r.bn, bn); }); if (c4.length) cands = c4; }
    if (cands.length && !cands.some(function (r) { return kdHit(r.bn, bn); })) cands = [];
    if (!cands.length && !model) cands = (I.name[bn] || []).filter(function (r) { return isPsa ? r.k === 'psa' : r.k !== 'psa'; });
    o.refs = cands.filter(function (r) { return r.y; }).map(function (r) { return { r: r, y: r.y }; });
  }
  if (!o.refs.length) return o;
  var normal = o.refs.filter(function (x) { return x.r.k !== 'kyouka'; }), main = normal[0] || o.refs[0];
  var top = o.refs.reduce(function (a, x) { return x.y > a.y ? x : a; }, o.refs[0]); // 強化買取を含めた一番高い買取表の価格
  o.ref = top.y; o.tab = top.r.t + (top.r.k === 'kyouka' ? '' : ''); o.normal = main.y;
  if (unit > o.ref) {
    var x = unit / o.ref;
    o.hit = x >= KD_HIGH ? '🚨' + (Math.round(x * 10) / 10) + '倍' : '⚠️買取表より高い';
    o.why = '買取表 ' + o.ref.toLocaleString() + '円' + (top.r.k === 'kyouka' ? '（強化買取）' : '') + ' → ' + unit.toLocaleString() + '円' + (x >= 5 ? '（桁の打ち間違い？）' : '');
  }
  return o;
}

function kDaily(d) {
  var key = P.getProperty('LOSS_KEY');
  if (!key || d.key !== key) return json({ ok: false, error: '合言葉が違います' });
  var I = kdIndex(), lines = d.lines || [];
  if (d.kind === 'dailyjudge') {
    try { kdUnchecked(lines); } catch (e) { console.error('チェック漏れ: ' + e); }
    var hits = []; lines.forEach(function (l) { if (kdJudge(I, l).hit) hits.push(l.k); });
    return json({ ok: true, n: lines.length, hits: hits });
  }
  // dailywrite
  var ss = kdBook(), sh = ss.getSheetByName('明細');
  var last = sh.getLastRow(), keys = {};
  if (last >= 2) sh.getRange(2, KD_COLS.length, last - 1, 1).getValues().forEach(function (v) { keys[v[0]] = 1; });
  var who = {}; // マイカ取引ID → 査定者・依頼番号（査定ログから）
  var lg = kBook().getSheetByName('査定ログ');
  if (lg && lg.getLastRow() >= 2) lg.getRange(2, 1, lg.getLastRow() - 1, 6).getValues().forEach(function (v) { if (v[5]) who[String(v[5])] = { by: v[3], id: v[4] }; });
  var rows = [];
  lines.forEach(function (l) {
    if (keys[l.k]) return;
    var j = kdJudge(I, l); if (!j.hit) return;
    var unit = Number(l.unit) || 0, cnt = Number(l.cnt) || 0, w = who[String(l.tx)] || {};
    var at = new Date(l.at);
    rows.push(['未確認', '', at, l.store, l.rec || '', l.cust || '', l.name || '', l.no || '', l.exp || '', l.rar || '', l.cond || '', cnt, unit, j.ref || '', j.ref ? unit / j.ref : '',
      j.ref ? Math.max(0, unit - j.ref) * cnt : '', j.hit, j.why, j.tab || '', w.by || '', w.id || '', l.tx || '', l.k]);
  });
  if (rows.length) {
    rows.sort(function (a, b) { return b[2] - a[2]; });
    sh.insertRowsBefore(2, rows.length);
    sh.getRange(2, 1, rows.length, KD_COLS.length).setValues(rows);
    sh.getRange(2, 3, rows.length, 1).setNumberFormat('yyyy/MM/dd(ddd) HH:mm');
    sh.getRange(2, 13, rows.length, 2).setNumberFormat('#,##0"円"');
    sh.getRange(2, 15, rows.length, 1).setNumberFormat('0%');
    sh.getRange(2, 16, rows.length, 1).setNumberFormat('#,##0"円"');
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(['未確認', '確認済み（問題なし）', '確認済み（ミス）', '要対応'], true).build();
    sh.getRange(2, 1, rows.length, 1).setDataValidation(rule);
    rows.forEach(function (r, i) { sh.getRange(2 + i, 17).setBackground(/^🚨/.test(r[16]) ? '#ffd9de' : '#fff4c2'); });
  }
  kdSummary(ss);
  var werr = '';
  if (rows.length) { try { kdWarn(rows, ss); } catch (e) { werr = String(e.message || e); console.error('買取警告: ' + werr); } }
  return json({ ok: true, written: rows.length, skipped: lines.length - rows.length, warnErr: werr });
}

function kdSummary(ss) {
  var sh = ss.getSheetByName('明細'), out = ss.getSheetByName('集計') || ss.insertSheet('集計');
  var last = sh.getLastRow(), vals = last >= 2 ? sh.getRange(2, 1, last - 1, KD_COLS.length).getValues() : [];
  var day = {}, mon = {};
  var add = function (m, k, store, v) { var o = m[k + '|' + store] || (m[k + '|' + store] = { k: k, store: store, n: 0, red: 0, amt: 0, open: 0 }); o.n++; if (/^🚨/.test(v[16])) o.red++; o.amt += Number(v[15]) || 0; if (v[0] === '未確認') o.open++; };
  vals.forEach(function (v) {
    if (!v[2]) return; var dt = new Date(v[2]);
    add(day, Utilities.formatDate(dt, 'Asia/Tokyo', 'yyyy/MM/dd'), v[3], v);
    add(mon, Utilities.formatDate(dt, 'Asia/Tokyo', 'yyyy年M月'), v[3], v);
  });
  var head = ['期間', '店舗', '買取表より高い行', 'うち🚨', '上乗せ額の合計', '未確認'];
  var toRows = function (m) { return Object.keys(m).map(function (k) { var o = m[k]; return [o.k, o.store, o.n, o.red, o.amt, o.open]; }).sort(function (a, b) { return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : String(a[1]).localeCompare(String(b[1])); }); };
  var mr = toRows(mon), dr = toRows(day);
  out.clearContents();
  out.getRange(1, 1).setValue('【月別】').setFontWeight('bold');
  out.getRange(2, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#efede7');
  if (mr.length) { out.getRange(3, 1, mr.length, head.length).setValues(mr); out.getRange(3, 5, mr.length, 1).setNumberFormat('#,##0"円"'); }
  var r0 = mr.length + 5;
  out.getRange(r0, 1).setValue('【日別】').setFontWeight('bold');
  out.getRange(r0 + 1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#efede7');
  if (dr.length) { out.getRange(r0 + 2, 1, dr.length, head.length).setValues(dr); out.getRange(r0 + 2, 5, dr.length, 1).setNumberFormat('#,##0"円"'); }
  out.getRange(1, 8).setValue('※「明細」タブから自動で作っています（毎晩の全店チェックのたびに更新）。上乗せ額＝（買取単価−買取表）×枚数。最終更新 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
}

/** 最初に1回：スプレッドシートを作ってURLをログに出す */
function kdSetup() { var ss = kdBook(); kdSummary(ss); Logger.log('買取表チェック（全店）: ' + ss.getUrl()); }

/* ---------- 役員の「買取警告」グループに送る ---------- */
// グループはBotが作る（役員＝LW_APPROVERS の3人＋Bot）。IDはスクリプト プロパティ K_WARN_CHANNEL
function kdWarnChannel() {
  var ch = P.getProperty('K_WARN_CHANNEL'); if (ch) return ch;
  var members = (P.getProperty('LW_APPROVERS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  if (!members.length) throw new Error('LW_APPROVERS（役員のID）がありません');
  var r = UrlFetchApp.fetch('https://www.worksapis.com/v1.0/bots/' + prop('LW_BOT_ID') + '/channels', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token() }, payload: JSON.stringify({ members: members, title: '買取警告' })
  });
  var j = JSON.parse(r.getContentText() || '{}');
  if (!j.channelId) throw new Error('買取警告グループを作れませんでした（' + r.getResponseCode() + '）: ' + r.getContentText());
  P.setProperty('K_WARN_CHANNEL', j.channelId);
  return j.channelId;
}
function kdLine(r) { // r は明細の1行（KD_COLS の並び）
  var d = Utilities.formatDate(new Date(r[2]), 'Asia/Tokyo', 'M/d(E) HH:mm').replace('Mon', '月').replace('Tue', '火').replace('Wed', '水').replace('Thu', '木').replace('Fri', '金').replace('Sat', '土').replace('Sun', '日');
  var yen = function (n) { return Number(n || 0).toLocaleString() + '円'; };
  var card = String(r[6]).replace(/[（(][^）)]*[）)]\s*$/, '') + '　' + [r[8], r[7], r[9]].filter(String).join(' ') + (r[10] ? '（' + r[10] + '）' : '');
  return (/^🚨/.test(r[16]) ? '🚨' : '⚠️') + ' ' + r[3] + '　' + d + '　受付' + r[4] + (r[5] ? '　' + r[5] + ' 様' : '') +
    '\n　' + card + ' ×' + r[11] + '\n　買取表 ' + yen(r[13]) + ' → ' + yen(r[12]) + '（' + (r[13] ? Math.round(r[12] / r[13] * 100) + '%' : '') + (r[15] ? '・上乗せ ' + yen(r[15]) : '') + '）' + (r[19] ? '　査定者：' + r[19] : '') +
    (/^🚨@/.test(r[16]) ? '\n　' + r[17] : '');
}
function kdWarn(rows, ss) {
  var ch = kdWarnChannel();
  var red = rows.filter(function (r) { return /^🚨/.test(r[16]); }), yel = rows.filter(function (r) { return !/^🚨/.test(r[16]); });
  var amt = rows.reduce(function (s, r) { return s + (Number(r[15]) || 0); }, 0);
  var head = '【買取警告】買取表より高く買った買取が ' + rows.length + '件（🚨' + red.length + '・⚠️' + yel.length + '）　上乗せ合計 ' + amt.toLocaleString() + '円';
  var body = red.concat(yel).slice(0, 30).map(kdLine).join('\n\n') + (rows.length > 30 ? '\n\nほか ' + (rows.length - 30) + '件' : '');
  var tail = '\n\n確認状況・社員への確認メモはこちら：\n' + ss.getUrl();
  kSplit(head + '\n\n' + body + tail).forEach(function (x) { send(ch, { type: 'text', text: x }); });
}
/** 最初に1回：買取警告グループを作り、あいさつと、今シートにある未確認の分を送る */
function kdWarnSetup() {
  var ch = kdWarnChannel();
  send(ch, { type: 'text', text: '買取警告グループです（役員のみ）。\n毎晩22:10ごろ、全店の買取を買取表と照らし合わせて、買取表より高く買ったもの（🚨1.1倍以上・トレーナーズの@と単価違い／⚠️それ以外の上乗せ）をここにお知らせします。' });
  var ss = kdBook(), sh = ss.getSheetByName('明細'), last = sh.getLastRow();
  if (last >= 2) { var rows = sh.getRange(2, 1, last - 1, KD_COLS.length).getValues().filter(function (r) { return r[0] === '未確認'; }); if (rows.length) kdWarn(rows, ss); }
  Logger.log('買取警告グループ: ' + ch);
}

/* ---------- ツールを通していない買取：①承認ライン以上なのに本部承認なし ②最終チェック（確認サイン）なし ---------- */
// 毎晩の全店チェック（dailyjudge）でその日の全買取を受け取り、「承認・チェック漏れ」タブにため、新しく見つかった分を役員の買取警告グループに送る
var KD_UC_COLS = ['状況', '社員への確認メモ', '種類', '買取日時', '店舗', '受付番号', '買取合計', '承認ライン', '行数', '最終チェック（査定者）', '本部承認', 'マイカ取引ID'];
var KD_UC_SHEET = '承認・チェック漏れ';
function kdLineFor(cfg, store, who) { // 買取チェックのツールと同じ決め方：スタッフ別 → 店舗と雇用区分の低い方
  var nm = String(who || '').replace(/\s+/g, '');
  if (nm && (cfg.staff || {})[nm] != null) return cfg.staff[nm];
  var line = (cfg.stores || {})[store]; if (line == null) line = cfg.def || 50000;
  var ty = (cfg.staffType || {})[nm] || 'アルバイト', tl = (cfg.types || {})[ty];
  if (nm && tl != null && tl < line) line = tl;
  return line;
}
function kdUnchecked(lines) {
  var from = new Date((P.getProperty('K_CHECK_FROM') || '2026-11-01') + 'T00:00:00+09:00'); // この日より前の買取は数えない（スクリプト プロパティ K_CHECK_FROM）
  var tx = {};
  lines.forEach(function (l) {
    if (!l.tx || new Date(l.at) < from) return;
    var o = tx[l.tx] || (tx[l.tx] = { store: l.store, rec: l.rec || '', at: l.at, total: 0, n: 0 });
    o.total += (Number(l.unit) || 0) * (Number(l.cnt) || 0); o.n++;
  });
  var book = kBook(), done = {}, appr = {};
  var fs = book.getSheetByName('最終チェック');
  if (fs && fs.getLastRow() >= 2) fs.getRange(2, 1, fs.getLastRow() - 1, 6).getValues().forEach(function (v) { if (v[4]) done[String(v[4])] = { at: v[1], by: v[5] }; });
  var kv = kSheet().getDataRange().getValues(); // 買取タブ：承認依頼の状態（承認待ち・承認・差し戻し）
  for (var i = 1; i < kv.length; i++) if (kv[i][2] === '承認依頼' && kv[i][15]) { var k = String(kv[i][15]); if (!appr[k] || kv[i][12] === '承認') appr[k] = kv[i][12]; }
  var cfg = kConfig();
  Object.keys(tx).forEach(function (id) {
    var o = tx[id], c = done[id]; o.by = c ? c.by : ''; o.line = kdLineFor(cfg, o.store, o.by);
    o.need = o.total >= o.line; o.appr = appr[id] || '';
    o.kind = o.need && o.appr !== '承認' ? '⛔承認なし' : (!c ? '⚠️確認サインなし' : '');
  });
  var ss = kdBook(), sh = ss.getSheetByName(KD_UC_SHEET);
  if (!sh) { sh = ss.insertSheet(KD_UC_SHEET); sh.setFrozenRows(1); sh.setColumnWidth(2, 220); }
  sh.getRange(1, 1, 1, KD_UC_COLS.length).setValues([KD_UC_COLS]).setFontWeight('bold').setBackground('#efede7');
  var last = sh.getLastRow(), have = {};
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, KD_UC_COLS.length).getValues();
    vals.forEach(function (v, r) { // あとで最終チェック・承認されたものは書き足す
      var id = String(v[11]); have[id] = 1;
      var c = done[id], a = appr[id] || '';
      var ck = c ? c.by + '（' + Utilities.formatDate(new Date(c.at), 'Asia/Tokyo', 'M/d HH:mm') + '）' : '';
      if ((ck && ck !== v[9]) || a !== v[10]) sh.getRange(r + 2, 10, 1, 2).setValues([[ck || v[9], a]]);
    });
  }
  var rows = [];
  Object.keys(tx).forEach(function (id) {
    var o = tx[id]; if (!o.kind || have[id]) return;
    rows.push(['未確認', '', o.kind, new Date(o.at), o.store, o.rec, o.total, o.line, o.n, o.by, o.appr, id]);
  });
  if (rows.length) {
    rows.sort(function (a, b) { return (/^⛔/.test(b[2]) - /^⛔/.test(a[2])) || b[3] - a[3]; });
    sh.insertRowsBefore(2, rows.length);
    sh.getRange(2, 1, rows.length, KD_UC_COLS.length).setValues(rows);
    sh.getRange(2, 4, rows.length, 1).setNumberFormat('yyyy/MM/dd(ddd) HH:mm');
    sh.getRange(2, 7, rows.length, 2).setNumberFormat('#,##0"円"');
    sh.getRange(2, 1, rows.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['未確認', '確認済み（問題なし）', '確認済み（注意した）', '要対応'], true).build());
    rows.forEach(function (r, k) { sh.getRange(2 + k, 3).setBackground(/^⛔/.test(r[2]) ? '#ffd9de' : '#fff4c2'); });
    try { kdUncheckedWarn(rows, ss); } catch (e) { console.error('承認・チェック漏れの警告: ' + e); }
  }
  kdCheckSummary(ss, tx);
}
function kdUncheckedWarn(rows, ss) {
  var ch = kdWarnChannel(), yen = function (n) { return Number(n || 0).toLocaleString() + '円'; };
  var ng = rows.filter(function (r) { return /^⛔/.test(r[2]); }), ck = rows.filter(function (r) { return !/^⛔/.test(r[2]); });
  var line = function (r) {
    var d = Utilities.formatDate(new Date(r[3]), 'Asia/Tokyo', 'M/d HH:mm');
    return r[2].slice(0, 1) === '⛔' ? '⛔ ' + r[4] + '　' + d + '　受付' + r[5] + '　' + yen(r[6]) + '（承認ライン ' + yen(r[7]) + '）' + (r[9] ? '　査定者：' + r[9] : '　ツール未使用') + (r[10] ? '　本部：' + r[10] : '')
      : '⚠️ ' + r[4] + '　' + d + '　受付' + r[5] + '　' + yen(r[6]);
  };
  var head = '【ツールを通していない買取】⛔承認なしで支払い ' + ng.length + '件・⚠️確認サインなし ' + ck.length + '件';
  var body = ng.map(line).join('\n') + (ng.length && ck.length ? '\n\n' : '') + ck.slice(0, 40).map(line).join('\n') + (ck.length > 40 ? '\nほか ' + (ck.length - 40) + '件' : '');
  kSplit(head + '\n\n' + body + '\n\n一覧・確認メモはこちら（「' + KD_UC_SHEET + '」タブ）：\n' + ss.getUrl()).forEach(function (x) { send(ch, { type: 'text', text: x }); });
}
// 日別・店舗別：買取件数／承認が必要／⛔承認なし／⚠️確認サインなし／確認サイン率（PCから届いた日の分を上書き）
function kdCheckSummary(ss, tx) {
  var sh = ss.getSheetByName('チェック集計');
  var head = ['日付', '店舗', '買取件数', '確認サインあり', '承認が必要', 'うち本部承認あり', '⛔承認なしで支払い', '⚠️確認サインなし', '確認サイン率'];
  if (!sh) { sh = ss.insertSheet('チェック集計'); sh.setFrozenRows(1); }
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#efede7');
  var g = {};
  Object.keys(tx).forEach(function (id) {
    var o = tx[id], day = Utilities.formatDate(new Date(o.at), 'Asia/Tokyo', 'yyyy/MM/dd'), k = day + '|' + o.store;
    var x = g[k] || (g[k] = [day, o.store, 0, 0, 0, 0, 0, 0, 0]);
    x[2]++; if (o.by) x[3]++; if (o.need) { x[4]++; if (o.appr === '承認') x[5]++; else x[6]++; } else if (!o.by) x[7]++;
  });
  var fmt = function (v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd') : String(v); };
  var last = sh.getLastRow(), old = last >= 2 ? sh.getRange(2, 1, last - 1, head.length).getValues() : [];
  var keep = old.filter(function (v) { return v[0] && !g[fmt(v[0]) + '|' + v[1]]; });
  var rows = keep.concat(Object.keys(g).map(function (k) { var x = g[k]; x[8] = x[2] ? x[3] / x[2] : 0; return x; }))
    .sort(function (a, b) { var da = fmt(a[0]), db = fmt(b[0]); return da < db ? 1 : da > db ? -1 : String(a[1]).localeCompare(String(b[1])); });
  if (last >= 2) sh.getRange(2, 1, last - 1, Math.max(head.length, sh.getLastColumn())).clearContent();
  if (rows.length) { sh.getRange(2, 1, rows.length, head.length).setValues(rows); sh.getRange(2, 9, rows.length, 1).setNumberFormat('0%'); }
}
