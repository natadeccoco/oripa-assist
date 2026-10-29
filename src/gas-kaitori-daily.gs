/**
 * 全店買取チェック  ※「オリパ本部承認（LINE WORKS）」と同じGASプロジェクトに入れるファイル（買取チェック.gs の kPrices などを使う）
 * 雄司のPC（myca_import の kaitori_check.ps1、毎晩22:10・23:40）から、その日の全店の買取明細が届く。
 *   POST {action:'kaitori', kind:'dailyjudge', key, lines:[…]} … 買取表より高く買った行のキーを返す（書き込みはしない）
 *   POST {action:'kaitori', kind:'dailywrite', key, lines:[…]} … 該当行に状態・お客様名を付けて送り直す → スプレッドシートに追記
 * 合言葉はスクリプト プロパティ LOSS_KEY（PCの config.json の LOSS_KEY と同じ。ロスのチェックと共用）
 * 書き込み先：スプレッドシート「買取表チェック（全店）」（初回に自動作成、IDはスクリプト プロパティ K_DAILY_SHEET）
 */
var KD_COLS = ['確認状況', '社員への確認メモ', '買取日時', '店舗', '受付番号', 'お客様', '商品', '状態', '枚数', '買取単価', '買取表', '買取表比', '上乗せ額', '判定', '理由', '買取表のタブ', '査定者', '承認依頼番号', 'マイカ取引ID', 'キー'];
var KD_HIGH = 1.5;

function kdBook() {
  var id = P.getProperty('K_DAILY_SHEET'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('買取表チェック（全店）');
    P.setProperty('K_DAILY_SHEET', ss.getId());
    var sh = ss.getSheets()[0]; sh.setName('明細');
    sh.getRange(1, 1, 1, KD_COLS.length).setValues([KD_COLS]).setFontWeight('bold').setBackground('#efede7');
    sh.setFrozenRows(1); sh.setFrozenColumns(2);
    sh.setColumnWidth(2, 220); sh.setColumnWidth(7, 300); sh.setColumnWidth(15, 280);
    ss.insertSheet('集計');
  }
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
    rows.push(['未確認', '', at, l.store, l.rec || '', l.cust || '', l.name || '', l.cond || '', cnt, unit, j.ref || '', j.ref ? unit / j.ref : '',
      j.ref ? Math.max(0, unit - j.ref) * cnt : '', j.hit, j.why, j.tab || '', w.by || '', w.id || '', l.tx || '', l.k]);
  });
  if (rows.length) {
    rows.sort(function (a, b) { return b[2] - a[2]; });
    sh.insertRowsBefore(2, rows.length);
    sh.getRange(2, 1, rows.length, KD_COLS.length).setValues(rows);
    sh.getRange(2, 3, rows.length, 1).setNumberFormat('yyyy/MM/dd(ddd) HH:mm');
    sh.getRange(2, 10, rows.length, 2).setNumberFormat('#,##0"円"');
    sh.getRange(2, 12, rows.length, 1).setNumberFormat('0%');
    sh.getRange(2, 13, rows.length, 1).setNumberFormat('#,##0"円"');
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(['未確認', '確認済み（問題なし）', '確認済み（ミス）', '要対応'], true).build();
    sh.getRange(2, 1, rows.length, 1).setDataValidation(rule);
    rows.forEach(function (r, i) { sh.getRange(2 + i, 14).setBackground(/^🚨/.test(r[13]) ? '#ffd9de' : '#fff4c2'); });
  }
  kdSummary(ss);
  return json({ ok: true, written: rows.length, skipped: lines.length - rows.length });
}

function kdSummary(ss) {
  var sh = ss.getSheetByName('明細'), out = ss.getSheetByName('集計') || ss.insertSheet('集計');
  var last = sh.getLastRow(), vals = last >= 2 ? sh.getRange(2, 1, last - 1, KD_COLS.length).getValues() : [];
  var day = {}, mon = {};
  var add = function (m, k, store, v) { var o = m[k + '|' + store] || (m[k + '|' + store] = { k: k, store: store, n: 0, red: 0, amt: 0, open: 0 }); o.n++; if (/^🚨/.test(v[13])) o.red++; o.amt += Number(v[12]) || 0; if (v[0] === '未確認') o.open++; };
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
