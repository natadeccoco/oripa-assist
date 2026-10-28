/* ナタデココ 買取チェック（マイカ上で動くブックマークレット本体）
 * マイカの買取（査定中＝下書き／今日の完了分）を買取表スプレッドシートと突き合わせて、
 * 桁ミス・別カードの価格・枚数などを警告し、承認ライン以上はLINE WORKSで本部承認を依頼する。 */
(function () {
  'use strict';
  if (location.hostname !== 'pos.mycalinks.com') { alert('マイカ（pos.mycalinks.com）を開いてから押してください'); return; }
  var old = document.getElementById('ndk-kaitori-host'); if (old) old.remove();

  var VERSION = '2026-10-29 版E';
  var GAS = 'https://script.google.com/macros/s/AKfycbwXHuu-X3L0qzJhvaszEIm-1xdeNIqJACQ0uM7mz5Q0hvwfdF9IuQiTKr3qmscNVmnhcQ/exec';
  var FB_URL = 'https://script.google.com/macros/s/AKfycbwl-ZCZ1LyefvSzEGkBEpTFTuFyvW0p-AYye6jBWaLP9t7-bC9_Owfeh4jKScNkFys6Fw/exec';
  var SHORT = { 322: '柏', 323: '津田沼', 324: '松戸', 325: '横浜', 326: '中野', 327: '町田', 328: '千葉中央', 390: '通販', 409: 'お台場' };
  // 判定ルール（本部の基準 2026-10-28）
  var RULE = { high: 1.5, psaLow: 0.85, boxLow: 0.6, hanyo: 10000, sameCard: 3, sameCardMin: 1000, near: 0.05 };

  var S = { sid: null, stores: [], prices: null, idx: null, config: null, list: [], tx: null, lines: [], cust: '', staff: '', pollT: null };
  try { S.staff = localStorage.getItem('ndk_kaitori_staff') || ''; } catch (e) { }

  /* ---------- 共通 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function yen(n) { return Math.round(Number(n) || 0).toLocaleString() + '円'; }
  function N(s) { return String(s == null ? '' : s).normalize('NFKC').toUpperCase().replace(/\s+/g, ''); }
  async function api(path, opt) {
    var r = await fetch(path, Object.assign({ credentials: 'include' }, opt || {}));
    var t = await r.text(); var j = null; try { j = JSON.parse(t); } catch (e) { }
    if (!r.ok) throw new Error((j && (j.error || j.message)) || ('通信エラー ' + r.status));
    return j;
  }
  async function gas(params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var j = await fetch(GAS + '?' + q).then(function (r) { return r.json(); });
    if (!j.ok) throw new Error(j.error || '本部のシステムにつながりませんでした');
    return j;
  }
  function jstDay(d) { var x = new Date(d.getTime() + 9 * 3600e3); return x.toISOString().slice(0, 10); }
  function hm(iso) { if (!iso) return ''; var x = new Date(new Date(iso).getTime() + 9 * 3600e3); return (x.getUTCMonth() + 1) + '/' + x.getUTCDate() + ' ' + String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0'); }

  /* ---------- 画面 ---------- */
  var host = document.createElement('div'); host.id = 'ndk-kaitori-host';
  host.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000');
  document.body.appendChild(host);
  var R = host.attachShadow({ mode: 'open' });
  R.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box}' +
    '.bg{position:fixed;inset:0;background:rgba(20,20,25,.45);display:flex;justify-content:center;padding:14px;font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;color:#1d1d22;font-size:14px;line-height:1.55}' +
    '.win{background:#f6f5f2;border-radius:14px;width:100%;max-width:1200px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.35)}' +
    '.hd{background:#1d1d22;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}' +
    '.hd h1{font-size:17px;margin:0;font-weight:800}.hd h1 b{color:#e8c23a}.hd .v{font-size:11px;color:#e8c23a}.hd .sp{flex:1}' +
    '.hd select,.hd input{font:inherit;font-size:13px;padding:4px 8px;border-radius:7px;border:0}' +
    '.hd label{font-size:12px;display:inline-flex;gap:6px;align-items:center}' +
    '.hd button{all:unset;cursor:pointer;color:#fff;font-weight:700;padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.14)}' +
    '.body{flex:1;overflow:auto;padding:14px 16px}' +
    '.msg{padding:40px;text-align:center;color:#666}.err{color:#c8102e;font-weight:700}' +
    'h2{font-size:15px;margin:14px 0 8px}' +
    '.tx{display:flex;gap:14px;align-items:center;background:#fff;border:1.5px solid #e5e2da;border-radius:12px;padding:10px 14px;margin:6px 0;cursor:pointer}' +
    '.tx:hover{border-color:#1d1d22}.tx .t{font-weight:800;font-size:16px;min-width:110px;text-align:right}.tx .s{color:#777;font-size:12px}.tx .g{flex:1}' +
    '.pill{display:inline-block;font-size:11.5px;font-weight:800;padding:1px 8px;border-radius:999px;margin-left:6px}' +
    '.pill.red{background:#c8102e;color:#fff}.pill.yel{background:#f5c518;color:#3d2e00}.pill.ok{background:#e3f4e6;color:#15803d}.pill.gr{background:#eee;color:#555}.pill.blue{background:#e3ecff;color:#1d4ed8}' +
    '.top{display:flex;gap:12px;flex-wrap:wrap;align-items:stretch;margin-bottom:12px}' +
    '.card{background:#fff;border:1.5px solid #e5e2da;border-radius:12px;padding:10px 14px}' +
    '.big{font-size:24px;font-weight:900}.sub{color:#777;font-size:12px}' +
    '.need{border-color:#c8102e;background:#fff5f6}.need .big{color:#c8102e}' +
    '.warns{margin:10px 0}.w{border-radius:10px;padding:9px 12px;margin:6px 0;font-weight:700}' +
    '.w.red{background:#c8102e;color:#fff}.w.yel{background:#fff4c2;color:#3d2e00;border:1.5px solid #f5c518}' +
    '.w .d{font-weight:500;font-size:13px;margin-top:2px}' +
    'table{border-collapse:separate;border-spacing:0;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1.5px solid #e5e2da}' +
    'th{background:#efede7;padding:6px 8px;font-size:12px;text-align:right;white-space:nowrap}th.l,td.l{text-align:left}' +
    'td{padding:7px 8px;border-top:1px solid #eceae4;text-align:right;white-space:nowrap;vertical-align:top}' +
    'td.nm{white-space:normal;min-width:260px}td.nm .m{color:#888;font-size:11.5px}' +
    'td.cnt{font-size:20px;font-weight:900}td.cnt.many{color:#c8102e}' +
    'td.th{width:58px;padding:5px 4px 5px 8px}td.th img{width:48px;height:66px;object-fit:contain;border-radius:4px;background:#f2f0ea;display:block}td.th .noimg{display:block;width:48px;height:66px;border-radius:4px;background:#f2f0ea}' +
    '.pill.cond{background:#1d1d22;color:#fff}' +
    'tr.red td{background:#fff0f2}tr.yel td{background:#fffbe6}' +
    'td .f{display:block;font-size:12px;font-weight:700;white-space:normal;text-align:left;margin-top:3px}td .f.red{color:#c8102e}td .f.yel{color:#8a6100}' +
    '.ratio{font-weight:800}.ratio.red{color:#c8102e}' +
    '.acts{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}' +
    'button.b{all:unset;cursor:pointer;font-weight:800;font-size:14px;padding:10px 18px;border-radius:10px;background:#1d1d22;color:#fff;text-align:center}' +
    'button.b.r{background:#c8102e}button.b.g{background:#fff;color:#1d1d22;border:1.5px solid #d6d2c8}button.b.s{font-size:12px;padding:6px 12px}' +
    'button.b[disabled]{opacity:.45;cursor:default}' +
    '.md{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:5}' +
    '.mbox{background:#fff;border-radius:14px;padding:18px 20px;width:min(640px,94vw);max-height:90vh;overflow:auto}' +
    '.mh{font-size:17px;font-weight:800;margin-bottom:10px}' +
    '.frm label{display:block;margin:8px 0;font-weight:700;font-size:13px}.frm input,.frm select,.frm textarea{display:block;width:100%;margin-top:3px;padding:7px 9px;border:1.5px solid #d6d2c8;border-radius:8px;font:inherit;font-weight:400}' +
    '.thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.thumbs img{width:70px;height:70px;object-fit:cover;border-radius:6px}' +
    '.st{padding:10px 14px;border-radius:10px;font-weight:800;margin:10px 0}.st.wait{background:#fff4c2}.st.ok{background:#e3f4e6;color:#15803d}.st.ng{background:#fff0f2;color:#c8102e}' +
    '.fb{position:absolute;right:18px;bottom:18px}' +
    '.photo{margin:10px 0;padding:10px 12px;border-radius:8px;background:#e3f4e6;color:#14532d;font-weight:700;font-size:13px}' +
    '</style>' +
    '<div class="bg"><div class="win">' +
    '<div class="hd"><h1><b>買取</b>チェック</h1><span class="v">' + VERSION + '</span>' +
    '<label>店舗 <select id="store"></select></label>' +
    '<label>担当者 <input id="staff" placeholder="名前" style="width:110px"></label>' +
    '<span class="sp"></span><button id="reload">更新</button><button id="fb">意見を送る</button><button id="close">閉じる ×</button></div>' +
    '<div class="body" id="body"><div class="msg">読み込み中…</div></div></div></div>';
  var $ = function (s) { return R.querySelector(s); };
  $('#close').onclick = function () { clearInterval(S.pollT); host.remove(); };
  $('#staff').value = S.staff;
  $('#staff').onchange = function () { S.staff = this.value.trim(); try { localStorage.setItem('ndk_kaitori_staff', S.staff); } catch (e) { } if (S.tx) renderDetail(); };
  $('#reload').onclick = function () { S.tx ? openTx(S.tx.id) : loadList(); };
  $('#fb').onclick = function () { window.open(FB_URL + '?tool=' + encodeURIComponent('買取チェック') + '&store=' + encodeURIComponent(SHORT[S.sid] || ''), '_blank'); };

  /* ---------- 初期化 ---------- */
  (async function init() {
    try {
      var all = await api('/api/store/all');
      S.stores = (all.stores || []).filter(function (s) { return !/通販/.test(s.display_name); });
      var hdr = document.body.innerText.match(/店舗：\s*([^\n​]+)/); var hname = hdr ? hdr[1].trim() : '';
      var cur = S.stores.find(function (s) { return hname && hname.indexOf(s.display_name) >= 0; }) || S.stores.find(function (s) { return hname.indexOf(s.display_name.replace('ナタデココ', '').replace(/本?店$/, '')) >= 0; }) || S.stores[0];
      $('#store').innerHTML = S.stores.map(function (s) { return '<option value="' + s.id + '"' + (s.id === cur.id ? ' selected' : '') + '>' + esc(SHORT[s.id] || s.display_name) + '</option>'; }).join('');
      $('#store').onchange = function () { S.sid = Number(this.value); S.tx = null; loadList(); };
      S.sid = cur.id;
      $('#body').innerHTML = '<div class="msg">買取表を読み込んでいます…</div>';
      await Promise.all([loadPrices(), loadConfig()]);
      await loadList();
    } catch (e) { $('#body').innerHTML = '<div class="msg err">読み込みに失敗しました：' + esc(e.message) + '<br>マイカにログインした状態で、もう一度ボタンを押してください。</div>'; }
  })();

  async function loadPrices() {
    var key = 'ndk_kaitori_prices', c = null;
    try { c = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { }
    if (c && c.rows && Date.now() - c.t < 30 * 60e3) { S.prices = c.rows; }
    else {
      var j = await gas({ action: 'kprices' }); S.prices = j.rows;
      try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), rows: j.rows })); } catch (e) { }
    }
    buildIndex();
  }
  async function loadConfig() {
    try { S.config = (await gas({ action: 'kconfig' })).config; } catch (e) { S.config = { def: 50000, stores: { '柏': 30000 }, staff: {} }; }
  }
  function approvalLine() {
    var c = S.config || {}, st = (c.staff || {})[N(S.staff).replace(/\s/g, '')] || (c.staff || {})[String(S.staff).replace(/\s+/g, '')];
    if (st) return { line: st, why: S.staff + 'さんの承認ライン' };
    var s = SHORT[S.sid], v = (c.stores || {})[s];
    return { line: v != null ? v : (c.def || 50000), why: s + '店の承認ライン' };
  }

  /* ---------- 買取表の索引 ---------- */
  function baseName(s) { return N(String(s || '').replace(/《[^》]*》/g, '').replace(/[（(][^）)]*[）)]\s*$/, '')).replace(/[・･]/g, ''); }
  function boxKey(s) {
    return N(String(s || '').replace(/《[^》]*》/g, '').replace(/[（(][^）)]*[）)]/g, '')).replace(/BOX|ボックス|強化拡張パック|拡張パック|ハイクラスパック|シュリンク(無|なし|有|あり)?|【[^】]*】|[・･\-ー]/g, '');
  }
  function buildIndex() {
    var I = { model: {}, name: {}, box: [] };
    S.prices.forEach(function (r) {
      if (r.k === 'box') { r.bk = boxKey(r.n); I.box.push(r); return; }
      r.bn = baseName(r.n);
      if (r.m) (I.model[N(r.m)] = I.model[N(r.m)] || []).push(r);
      (I.name[r.bn] = I.name[r.bn] || []).push(r);
    });
    S.idx = I;
  }
  function nameHit(a, b) { return a && b && (a === b || (a.length >= 3 && b.indexOf(a) >= 0) || (b.length >= 3 && a.indexOf(b) >= 0)); }

  // マイカの明細1行 → 買取表の行（refs）、比べる価格（ref）、近い別カード（sibs）
  function match(c) {
    var dn = c.product__displayNameWithMeta || c.product_name || '', nm = c.product_name || dn;
    var isBox = c.product_category_name === 'ボックス' || /BOX|ボックス/i.test(dn);
    var psaM = dn.match(/PSA\s*(\d+)/i), isPsa = !!psaM, hanyo = /【@|ポケモン\/トレーナーズ/.test(dn);
    var at = dn.normalize('NFKC').match(/【@\s*(\d+)\s*】/);
    var o = { dn: dn, cat: c.product_category_name || '', isBox: isBox, isPsa: isPsa, hanyo: hanyo, at: at ? Number(at[1]) : null, refs: [], sibs: [], cond: ((dn.match(/《([^》]*)》/) || [])[1] || '') };
    if (hanyo) return o;
    if (isBox) {
      var k = boxKey(dn), noShrink = /シュリンク(無|なし)/.test(dn);
      var hit = S.idx.box.filter(function (r) { return r.bk === k; });
      if (!hit.length) hit = S.idx.box.filter(function (r) { var a = r.bk, b = k; return a.length >= 3 && b.length >= 3 && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.7 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0); });
      o.refs = hit.map(function (r) { return { r: r, y: noShrink && r.y2 != null ? r.y2 : r.y }; }).filter(function (x) { return x.y; });
      return o;
    }
    if (isPsa && psaM[1] !== '10') { o.note = 'PSA' + psaM[1] + 'は買取表にありません'; return o; }
    var bn = baseName(nm), model = N(c.product__item__cardnumber), pack = N(c.product__item__expansion), rar = N(c.product__item__rarity);
    var cands = model ? (S.idx.model[model] || []) : [];
    cands = cands.filter(function (r) { return isPsa ? r.k === 'psa' : r.k !== 'psa'; });
    var promoModel = /\/[A-Z]+-P$/i.test(model); // 型番にセット名が入っているプロモ（131/M-P など）はパックを見ない
    var packOK = function (r) { if (r.k === 'kyouka' || !r.p || promoModel) return true; var q = N(r.p); if (!/^[A-Z0-9\-]+$/.test(q)) return /その他|PROMO/.test(q) || q.indexOf(pack) === 0; return q === pack || q.indexOf(pack) === 0 || pack.indexOf(q) === 0; };
    if (pack) cands = cands.filter(packOK);
    if (rar && cands.length > 1) { var c3 = cands.filter(function (r) { return !r.r || N(r.r) === rar; }); if (c3.length) cands = c3; }
    if (cands.length > 1) { var c4 = cands.filter(function (r) { return nameHit(r.bn, bn); }); if (c4.length) cands = c4; }
    if (cands.length && !cands.some(function (r) { return nameHit(r.bn, bn); })) cands = []; // 型番が同じでも名前が違うものは使わない
    if (!cands.length && !model) cands = (S.idx.name[bn] || []).filter(function (r) { return isPsa ? r.k === 'psa' : r.k !== 'psa'; });
    o.refs = cands.filter(function (r) { return r.y; }).map(function (r) { return { r: r, y: r.y }; });
    // 近い別カード：同じ名前の別レアリティ・別の弾、同じ型番の別カード
    var seen = {}; o.refs.forEach(function (x) { seen[x.r.t + x.r.n + x.r.m + x.r.r] = 1; });
    var pool = (S.idx.name[bn] || []).concat(model ? (S.idx.model[model] || []) : []);
    pool.forEach(function (r) {
      if (!r.y || seen[r.t + r.n + r.m + r.r] || (isPsa ? r.k !== 'psa' : r.k === 'psa')) return;
      seen[r.t + r.n + r.m + r.r] = 1; o.sibs.push(r);
    });
    return o;
  }

  function judge(c) {
    var m = match(c), unit = Number(c.unit_price) || 0, cnt = Number(c.item_count) || 0, f = [];
    var normal = m.refs.filter(function (x) { return x.r.k !== 'kyouka'; });
    var main = (normal[0] || m.refs[0]);
    var refMax = m.refs.reduce(function (s, x) { return Math.max(s, x.y); }, 0);
    m.ref = main ? main.y : null; m.refMax = refMax || null; m.unit = unit; m.cnt = cnt;
    m.ratio = m.ref ? unit / m.ref : null;
    var label = m.dn + (m.cond && m.dn.indexOf(m.cond) < 0 ? '《' + m.cond + '》' : '');
    if (m.hanyo && m.at != null && unit !== m.at) f.push({ lv: 'red', t: 'トレーナーズ【@' + m.at + '】なのに単価が' + yen(unit) + 'です。単価をご確認ください', d: label + '　単価は ' + yen(m.at) + ' のはず → 入力 ' + yen(unit) + ' × ' + cnt });
    else if (m.hanyo && m.at == null && unit >= RULE.hanyo) f.push({ lv: 'red', t: '汎用商品に' + yen(unit) + 'が入っています。商品の選び間違いではありませんか？', d: label + '　入力 ' + yen(unit) + ' × ' + cnt });
    if (m.refMax && unit >= m.refMax * RULE.high) {
      var x = unit / m.ref, xs = x >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
      f.push({ lv: 'red', t: '買取表の' + xs + '倍の金額です。ご確認ください' + (x >= 5 ? '（桁の打ち間違いではありませんか？）' : ''), d: label + '　買取表 ' + yen(m.ref) + (refMax > m.ref ? '（強化買取 ' + yen(refMax) + '）' : '') + ' → 入力 ' + yen(unit) });
    }
    if (m.ref && !f.length) {
      var near = m.sibs.filter(function (r) { return Math.abs(r.y - unit) <= r.y * RULE.near && Math.abs(r.y - m.ref) > m.ref * 0.3; })[0];
      if (near && Math.abs(unit - m.ref) > m.ref * 0.1) f.push({ lv: 'yel', t: '別のカード（' + near.n + (near.r ? ' ' + near.r : '') + (near.p ? ' ' + near.p : '') + '）の価格になっていないかご確認ください', d: label + '　買取表 ' + yen(m.ref) + ' → 入力 ' + yen(unit) + '（' + near.n + (near.r ? ' ' + near.r : '') + 'の買取表は ' + yen(near.y) + '）' });
    }
    if (m.ref && m.isPsa && unit < m.ref * RULE.psaLow) f.push({ lv: 'yel', t: 'PSAが買取表の' + Math.round(unit / m.ref * 100) + '%です。減額が大きすぎないかご確認ください', d: label + '　買取表 ' + yen(m.ref) + ' → 入力 ' + yen(unit) });
    if (m.ref && m.isBox && unit < m.ref * RULE.boxLow) f.push({ lv: 'yel', t: 'BOXが買取表の' + Math.round(unit / m.ref * 100) + '%です。減額が大きすぎないかご確認ください', d: label + '　買取表 ' + yen(m.ref) + ' → 入力 ' + yen(unit) });
    if (!m.isBox && !m.hanyo && cnt >= RULE.sameCard && unit >= RULE.sameCardMin) f.push({ lv: 'yel', t: '同じカードが' + cnt + '枚です。枚数をご確認ください', d: label + ' × ' + cnt + '（' + yen(unit) + ' × ' + cnt + ' ＝ ' + yen(unit * cnt) + '）' });
    m.flags = f; return m;
  }

  window.__ndkKaitoriDebug = { S: S, judge: judge, match: match, open: function (id) { return openTx(id); } };

  /* ---------- 一覧 ---------- */
  async function loadList() {
    clearInterval(S.pollT); S.tx = null;
    $('#body').innerHTML = '<div class="msg">マイカの買取を読み込んでいます…</div>';
    try {
      var sid = S.sid, today = jstDay(new Date());
      var start = new Date(today + 'T00:00:00+09:00').toISOString();
      var dr = await api('/api/store/' + sid + '/transaction?status=draft&transaction_kind=buy&take=30&skip=0&orderBy=-finished_at');
      var cp = await api('/api/store/' + sid + '/transaction?status=completed&transaction_kind=buy&finishedAtStart=' + encodeURIComponent(start) + '&take=100&skip=0&orderBy=-finished_at');
      var since = Date.now() - 2 * 864e5;
      var drafts = (dr.transactions || []).filter(function (t) { return new Date(t.updated_at || t.created_at).getTime() >= since; });
      S.list = drafts.concat(cp.transactions || []);
      var row = function (t) {
        var w = 0, red = 0; (t.transaction_carts || []).forEach(function (c) { var j = judge(c); j.flags.forEach(function (x) { w++; if (x.lv === 'red') red++; }); });
        var ap = approvalLine(), need = (t.total_price || 0) >= ap.line;
        return '<div class="tx" data-id="' + t.id + '"><div class="g"><b>受付 ' + esc(t.reception_number || '') + '</b>' +
          (t.status === 'draft' ? '<span class="pill blue">査定中</span>' : '<span class="pill gr">完了</span>') +
          (red ? '<span class="pill red">🚨 ' + red + '</span>' : '') + (w - red ? '<span class="pill yel">⚠️ ' + (w - red) + '</span>' : '') + (!w ? '<span class="pill ok">OK</span>' : '') +
          (need ? '<span class="pill red">要承認</span>' : '') +
          '<div class="s">' + hm(t.updated_at || t.created_at) + '　' + (t.transaction_carts || []).length + '行・' + (t.transaction_carts || []).reduce(function (s, c) { return s + (c.item_count || 0); }, 0) + '点</div></div>' +
          '<div class="t">' + yen(t.total_price) + '</div></div>';
      };
      $('#body').innerHTML =
        '<h2>査定中の買取（お金を払う前にチェック）</h2>' + (drafts.length ? drafts.map(row).join('') : '<div class="sub">査定中の買取はありません。マイカで明細を入れてから「更新」を押してください。</div>') +
        '<h2>今日の完了した買取</h2>' + ((cp.transactions || []).length ? cp.transactions.map(row).join('') : '<div class="sub">まだありません。</div>');
      R.querySelectorAll('.tx').forEach(function (el) { el.onclick = function () { openTx(Number(el.dataset.id)); }; });
    } catch (e) { $('#body').innerHTML = '<div class="msg err">買取を読み込めませんでした：' + esc(e.message) + '</div>'; }
  }

  /* ---------- 明細 ---------- */
  async function openTx(id) {
    clearInterval(S.pollT);
    var t = S.list.find(function (x) { return x.id === id; });
    if (!t) { await loadList(); t = S.list.find(function (x) { return x.id === id; }); if (!t) return; }
    S.tx = t; S.cust = '';
    S.lines = (t.transaction_carts || []).map(judge);
    renderDetail();
    loadImages(t);
    if (t.customer_id) {
      try { var cs = await api('/api/store/' + S.sid + '/customer?id=' + t.customer_id); S.cust = ((cs || [])[0] || {}).full_name_ruby || ''; } catch (e) { }
      if (S.tx === t) renderDetail();
    }
    pollStatus();
  }
  // マイカの商品画像（承認依頼の画像に使う）
  async function loadImages(t) {
    var ids = []; (t.transaction_carts || []).forEach(function (c) { if (ids.indexOf(c.product_id) < 0) ids.push(c.product_id); });
    var map = {};
    await Promise.all(ids.slice(0, 80).map(function (id) {
      return api('/api/store/' + S.sid + '/product?id=' + id).then(function (j) { var p = ((j && j.products) || [])[0]; if (p) map[id] = { img: p.image_url || '', cond: p.condition_option_display_name || '' }; }).catch(function () { });
    }));
    if (S.tx !== t) return;
    S.lines.forEach(function (m, i) { var x = map[(t.transaction_carts[i] || {}).product_id] || {}; m.img = x.img || ''; if (!m.cond && x.cond) m.cond = x.cond; });
    renderDetail();
  }
  function stKey() { return 'ndk_kaitori_req_' + S.tx.id; }
  function reqInfo() { try { return JSON.parse(localStorage.getItem(stKey()) || 'null'); } catch (e) { return null; } }
  function saveReq(o) { try { localStorage.setItem(stKey(), JSON.stringify(o)); } catch (e) { } }
  function confInfo() { try { return JSON.parse(localStorage.getItem('ndk_kaitori_conf_' + S.tx.id) || 'null'); } catch (e) { return null; } }
  function saveConf(o) { try { localStorage.setItem('ndk_kaitori_conf_' + S.tx.id, JSON.stringify(o)); } catch (e) { } }

  function renderDetail() {
    var t = S.tx; if (!t) return;
    var ap = approvalLine(), need = (t.total_price || 0) >= ap.line;
    var flags = []; S.lines.forEach(function (m) { m.flags.forEach(function (f) { flags.push(f); }); });
    var red = flags.filter(function (f) { return f.lv === 'red'; });
    var ri = reqInfo(), ci = confInfo();
    if (ri && ri.kind === 'confirm') { ci = ri; ri = null; }
    var st = '';
    if (ri && ri.kind === 'approval') st = ri.status === '承認' ? '<div class="st ok">✅ 本部が承認しました（' + esc(ri.by || '') + '）</div>' : ri.status === '差し戻し' ? '<div class="st ng">↩️ 差し戻されました（' + esc(ri.by || '') + '）。LINE WORKSのグループで理由を確認してください</div>' : '<div class="st wait">承認待ち（依頼番号 ' + esc(ri.id) + '）… 結果は自動で反映されます</div>';
    if (ci && flags.length) st = '<div class="st ok">✅ 警告を確認しました（' + esc(ci.by || '') + '）</div>' + st;
    var mustConf = flags.length && !ci;
    var rows = S.lines.map(function (m) {
      var lv = m.flags.some(function (f) { return f.lv === 'red'; }) ? 'red' : m.flags.length ? 'yel' : '';
      var ref = m.ref ? yen(m.ref) + '<div class="sub">' + esc((m.refs[0] || {}).r ? m.refs[0].r.t : '') + '</div>' : '<span class="sub">' + esc(m.note || (m.hanyo ? '汎用' : '買取表になし')) + '</span>';
      return '<tr class="' + lv + '"><td class="th">' + (m.img ? '<img src="' + esc(m.img) + '" loading="lazy">' : '<span class="noimg"></span>') + '</td><td class="l nm"><b>' + esc(m.dn) + '</b>' + (m.cond ? ' <span class="pill cond">' + esc(m.cond) + '</span>' : '') +
        m.flags.map(function (f) { return '<span class="f ' + f.lv + '">' + (f.lv === 'red' ? '🚨 ' : '⚠️ ') + esc(f.t) + '</span>'; }).join('') + '</td>' +
        '<td class="cnt' + (m.cnt >= 2 ? ' many' : '') + '">×' + m.cnt + '</td><td><b>' + yen(m.unit) + '</b></td><td>' + ref + '</td>' +
        '<td><span class="ratio' + (m.ratio && m.ratio >= RULE.high ? ' red' : '') + '">' + (m.ratio ? Math.round(m.ratio * 100) + '%' : '-') + '</span></td><td><b>' + yen(m.unit * m.cnt) + '</b></td></tr>';
    }).join('');
    $('#body').innerHTML =
      '<div class="acts" style="margin-top:0"><button class="b g s" id="back">← 一覧にもどる</button></div>' +
      '<div class="top"><div class="card"><div class="sub">受付 ' + esc(t.reception_number || '') + '　' + hm(t.updated_at || t.created_at) + '　' + (t.status === 'draft' ? '査定中' : '完了') + (S.cust ? '　' + esc(S.cust) + ' 様' : '') + '</div><div class="big">' + yen(t.total_price) + '</div></div>' +
      '<div class="card' + (need ? ' need' : '') + '"><div class="sub">' + esc(ap.why) + '：' + yen(ap.line) + '以上</div><div class="big">' + (need ? '本部承認が必要です' : '承認は不要です') + '</div></div>' +
      '<div class="card"><div class="sub">チェック結果</div><div class="big">' + (red.length ? '<span style="color:#c8102e">🚨 ' + red.length + '</span> ' : '') + (flags.length - red.length ? '⚠️ ' + (flags.length - red.length) : '') + (!flags.length ? '<span style="color:#15803d">問題なし</span>' : '') + '</div></div></div>' +
      st +
      (flags.length ? '<div class="warns">' + flags.map(function (f) { return '<div class="w ' + f.lv + '">' + (f.lv === 'red' ? '🚨 ' : '⚠️ ') + esc(f.t) + '<div class="d">' + esc(f.d) + '</div></div>'; }).join('') + '</div>' : '') +
      '<div class="acts">' +
      (mustConf ? '<button class="b" id="conf">警告を見直しました</button>' : '') +
      (ri && ri.status !== '差し戻し' ? '' : need ? '<button class="b r" id="req"' + (mustConf ? ' disabled title="先に警告を見直してください"' : '') + '>本部に承認を依頼する</button>' : '<button class="b g" id="req"' + (mustConf ? ' disabled' : '') + '>本部に承認を依頼（任意：古いカードで不安な時など）</button>') + '</div>' +
      (mustConf ? '<div class="sub" style="margin:-6px 0 10px">警告はあなた（査定した人）への確認です。マイカの明細を見直して、直したら「更新」、問題なければ「警告を見直しました」を押してください。' + (need ? 'そのあと本部に承認を依頼できます。' : '') + '</div>' : '') +
      '<table><tr><th></th><th class="l">商品</th><th>数</th><th>入力単価</th><th>買取表</th><th>買取表比</th><th>小計</th></tr>' + rows + '</table>' +
      '<div class="sub" style="margin-top:8px">買取表：シングルはA 100%／A- 90〜60%／B 50〜20%／C 20〜5%／D 5%以下（Aでも傷・センタリングで80%程度あり）、PSAは85%まで、BOXは60%まで。買取表の1.5倍以上は🚨になります。</div>';
    $('#back').onclick = function () { loadList(); };
    if ($('#req')) $('#req').onclick = function () { if (!this.disabled) countCheck(function () { openSend('approval'); }); };
    if ($('#conf')) $('#conf').onclick = function () { openSend('confirm'); };
  }

  // 本部承認の前に：同じカード・BOXが2枚以上ある行の枚数を確認（トレーナーズ・サプライは除く）
  function countCheck(next) {
    var list = S.lines.filter(function (m) { return !m.hanyo && m.cat !== 'サプライ' && m.cnt >= 2; });
    if (!list.length) { next(); return; }
    var m = document.createElement('div'); m.className = 'md';
    m.innerHTML = '<div class="mbox"><div class="mh">枚数はあっていますか？</div><div class="sub" style="margin-bottom:8px">2枚（2個）以上の商品です。実物の枚数とマイカの数をもう一度数えてください。</div>' +
      '<table>' + list.map(function (q) { return '<tr><td class="th">' + (q.img ? '<img src="' + esc(q.img) + '">' : '<span class="noimg"></span>') + '</td><td class="l nm"><b>' + esc(q.dn) + '</b>' + (q.cond ? ' <span class="pill cond">' + esc(q.cond) + '</span>' : '') + '<div class="sub">' + yen(q.unit) + ' × ' + q.cnt + ' ＝ ' + yen(q.unit * q.cnt) + '</div></td><td class="cnt many" style="font-size:30px">×' + q.cnt + '</td></tr>'; }).join('') + '</table>' +
      '<div class="acts" style="justify-content:flex-end"><button class="b g" id="x">ちがう（マイカを直す）</button><button class="b r" id="ok">枚数はあっています</button></div></div>';
    R.querySelector('.win').appendChild(m);
    m.querySelector('#x').onclick = function () { m.remove(); };
    m.querySelector('#ok').onclick = function () { m.remove(); S.countOk = S.tx && S.tx.id; next(); };
  }

  function lineText(m) { return '・' + m.dn + (m.cond && m.dn.indexOf(m.cond) < 0 ? '《' + m.cond + '》' : '') + ' ×' + m.cnt + '　' + yen(m.unit) + (m.ref ? '（買取表 ' + yen(m.ref) + '）' : ''); }
  function warnText() {
    var out = []; S.lines.forEach(function (m) { m.flags.forEach(function (f) { out.push((f.lv === 'red' ? '🚨 ' : '⚠️ ') + f.t + '\n　' + f.d); }); });
    return out.join('\n');
  }

  // 写真を縮めてJPEG(base64)に
  function shrink(file) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () { var im = new Image(); im.onload = function () { var s = Math.min(1, 1400 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.8).split(',')[1]); }; im.onerror = function () { res(''); }; im.src = fr.result; };
      fr.onerror = function () { res(''); }; fr.readAsDataURL(file);
    });
  }

  function openSend(kind) {
    var t = S.tx, ap = approvalLine(), need = (t.total_price || 0) >= ap.line, approval = kind === 'approval';
    var m = document.createElement('div'); m.className = 'md';
    m.innerHTML = '<div class="mbox"><div class="mh">' + (approval ? '本部に買取の承認を依頼します' : '警告を見直したことを記録します') + '</div><div class="frm">' +
      '<label>あなたの名前（必須）<input id="rq" value="' + esc(S.staff) + '"></label>' +
      (approval ? '<label>お客様名（カナ）<input id="cu" value="' + esc(S.cust) + '"></label>' +
        '<label>理由<select id="rs">' + (need ? '<option>買取合計が承認ライン以上</option>' : '') + '<option>古いカードで不安</option><option>状態の判断に迷う</option><option>真贋が不安</option><option>その他</option></select></label>' +
        '<div class="photo">📷 写真（商品・明細画面など）は、LINE WORKSの「オリパ・買取共有」グループに直接送ってください。</div>' : '') +
      '<label>ひとこと（任意）<textarea id="cm" rows="3" placeholder="' + (approval ? '例：151のBOX、サイドの端が少し空いています' : '例：強化買取の価格なので問題ありません') + '"></textarea></label>' +
      (approval ? '<div class="sub">' + esc(SHORT[S.sid]) + '店の「オリパ・買取共有」グループ（LINE WORKS）に、下の画像と「承認する／差し戻す」ボタンが届きます。役員が押すと、この画面に結果が出ます。</div><div class="aprev"><div class="sub">送る画像を作っています…</div></div>'
        : '<div class="sub">記録だけ残ります（LINE WORKSには送りません）。</div>') +
      '<div class="err" id="er"></div></div><div class="acts" style="justify-content:flex-end"><button class="b g" id="x">やめる</button><button class="b ' + (approval ? 'r' : '') + '" id="ok">' + (approval ? '依頼する' : '確認しました') + '</button></div></div>';
    R.querySelector('.win').appendChild(m);
    var files = [];
    var imgP = approval ? sheetImage().then(function (b64) { var bx = m.querySelector('.aprev'); if (bx) bx.innerHTML = '<img src="data:image/jpeg;base64,' + b64 + '" style="width:100%;border-radius:8px;border:1px solid #e5e2da">'; return b64; }, function () { var bx = m.querySelector('.aprev'); if (bx) bx.innerHTML = '<div class="sub">画像を作れなかったので、文章で送ります</div>'; return ''; }) : Promise.resolve('');
    if (approval && m.querySelector('#ph')) m.querySelector('#ph').onchange = function () { files = Array.from(this.files || []).slice(0, 10); m.querySelector('#th').innerHTML = files.map(function (f) { return '<img src="' + URL.createObjectURL(f) + '">'; }).join(''); };
    m.querySelector('#x').onclick = function () { m.remove(); };
    m.querySelector('#ok').onclick = async function () {
      var b = this, name = m.querySelector('#rq').value.trim();
      if (!name) { m.querySelector('#rq').focus(); return; }
      S.staff = name; $('#staff').value = name; try { localStorage.setItem('ndk_kaitori_staff', name); } catch (e) { }
      b.disabled = true; b.textContent = '送信中…';
      try {
        var images = []; for (var i = 0; i < files.length; i++) { var x = await shrink(files[i]); if (x) images.push(x); }
        b.textContent = '画像を作成中…'; var sheet = await imgP; b.textContent = '送信中…';
        var flags = []; S.lines.forEach(function (q) { flags = flags.concat(q.flags); });
        var body = { action: 'kaitori', kind: kind, store: SHORT[S.sid], requester: name, customer: approval ? m.querySelector('#cu').value.trim() : S.cust,
          total: t.total_price, line: ap.line, reason: approval ? m.querySelector('#rs').value : '', warnCount: flags.length, warnText: warnText(),
          text: S.lines.slice(0, 60).map(lineText).join('\n') + (S.lines.length > 60 ? '\nほか' + (S.lines.length - 60) + '行' : ''),
          comment: m.querySelector('#cm').value.trim(), countChecked: S.countOk === t.id, image: sheet, images: images, txId: t.id, staff: S.staff };
        var j = await fetch(GAS, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); });
        if (!j.ok) throw new Error(j.error || '送信できませんでした');
        if (approval) saveReq({ kind: kind, id: j.id, status: '承認待ち', by: '' }); else saveConf({ id: j.id, by: name });
        m.remove(); renderDetail(); pollStatus();
      } catch (e) { b.disabled = false; b.textContent = approval ? '依頼する' : '確認しました'; m.querySelector('#er').textContent = '送れませんでした：' + e.message; }
    };
  }

  // 承認依頼用：買取の中身を1枚の画像（JPEG・base64）に描く。マイカの画像はGAS経由で受け取る
  async function sheetImage() {
    var t = S.tx, list = S.lines.filter(function (m) { return !m.hanyo && m.unit * m.cnt >= 500; }).sort(function (a, b) { return b.unit * b.cnt - a.unit * a.cnt; });
    var rest = S.lines.filter(function (m) { return list.indexOf(m) < 0; });
    var MAX = 30; if (list.length > MAX) { rest = rest.concat(list.slice(MAX)); list = list.slice(0, MAX); }
    var imgs = {}, urls = []; list.forEach(function (m) { if (m.img && urls.indexOf(m.img) < 0) urls.push(m.img); });
    await Promise.all(urls.map(function (u) {
      return fetch(GAS + '?action=img&u=' + encodeURIComponent(u)).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) return;
        return new Promise(function (res) { var im = new Image(); im.onload = function () { imgs[u] = im; res(); }; im.onerror = function () { res(); }; im.src = 'data:' + j.mime + ';base64,' + j.b64; });
      }).catch(function () { });
    }));
    var COLS = Math.min(6, Math.max(3, list.length)), CW = 210, CH = 380, GAP = 12, PAD = 24, W = PAD * 2 + COLS * CW + (COLS - 1) * GAP;
    var rows = Math.ceil(list.length / COLS), HEAD = 120, H = HEAD + PAD + rows * (CH + GAP) + (rest.length ? 60 : 20);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
    var F = '"Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';
    function fit(s, w) { if (c.measureText(s).width <= w) return s; while (s.length > 1 && c.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
    function wrap2(s, w) { if (c.measureText(s).width <= w) return [s]; var k = s.length; while (k > 1 && c.measureText(s.slice(0, k)).width > w) k--; return [s.slice(0, k), fit(s.slice(k), w)]; }
    c.fillStyle = '#f6f5f2'; c.fillRect(0, 0, W, H); c.fillStyle = '#1f1d1a'; c.fillRect(0, 0, W, HEAD - 8); c.textBaseline = 'top';
    c.fillStyle = '#e8c23a'; c.font = 'bold 32px ' + F; c.fillText(fit(SHORT[S.sid] + '店　買取 ' + yen(t.total_price), W - PAD * 2), PAD, 16);
    c.fillStyle = '#fff'; c.font = 'bold 20px ' + F;
    var pts = S.lines.reduce(function (s, m) { return s + m.cnt; }, 0);
    c.fillText(fit((S.cust ? S.cust + ' 様　' : '') + '受付' + (t.reception_number || '') + '　' + hm(t.updated_at || t.created_at) + '　' + S.lines.length + '行・' + pts + '点', W - PAD * 2), PAD, 64);
    var y0 = HEAD + PAD - 8;
    list.forEach(function (m, i) {
      var x = PAD + (i % COLS) * (CW + GAP), y = y0 + Math.floor(i / COLS) * (CH + GAP);
      c.fillStyle = '#fff'; c.fillRect(x, y, CW, CH); c.strokeStyle = '#e1ddd3'; c.lineWidth = 2; c.strokeRect(x, y, CW, CH);
      var im = imgs[m.img], ih = 200;
      if (im) { var r = Math.min((CW - 16) / im.width, ih / im.height), dw = im.width * r, dh = im.height * r; c.drawImage(im, x + (CW - dw) / 2, y + 10 + (ih - dh) / 2, dw, dh); }
      else { c.fillStyle = '#eee'; c.fillRect(x + 8, y + 10, CW - 16, ih); }
      if (m.cnt > 1) { c.font = 'bold 30px ' + F; var tx = '×' + m.cnt, tw = c.measureText(tx).width + 16; c.fillStyle = '#c8102e'; c.fillRect(x + CW - tw, y, tw, 40); c.fillStyle = '#fff'; c.fillText(tx, x + CW - tw + 8, y + 4); }
      var ty = y + 220;
      c.font = 'bold 15px ' + F; c.fillStyle = m.isPsa ? '#2952a3' : '#666'; c.fillText(fit(m.isPsa ? 'PSA鑑定品' : (m.cond || (m.isBox ? 'BOX' : '')), CW - 16), x + 8, ty);
      c.fillStyle = '#1f1d1a'; c.font = 'bold 15px ' + F; wrap2(m.dn.replace(/《[^》]*》/g, ''), CW - 16).forEach(function (l, k) { c.fillText(l, x + 8, ty + 20 + k * 19); });
      c.fillStyle = '#1f1d1a'; c.font = 'bold 21px ' + F; c.fillText('買取 ' + yen(m.unit), x + 8, ty + 64);
      c.font = '15px ' + F; c.fillStyle = '#555';
      c.fillText(m.ref ? '買取表 ' + yen(m.ref) + '（' + Math.round(m.unit / m.ref * 100) + '%）' : '買取表になし', x + 8, ty + 93);
      c.font = 'bold 15px ' + F; c.fillStyle = '#1f1d1a'; c.fillText('小計 ' + yen(m.unit * m.cnt), x + 8, ty + 116);
    });
    if (rest.length) {
      var rs = rest.reduce(function (s, m) { return s + m.unit * m.cnt; }, 0), rn = rest.reduce(function (s, m) { return s + m.cnt; }, 0);
      c.fillStyle = '#1f1d1a'; c.font = 'bold 20px ' + F; c.fillText(fit('ほか（汎用・低額など）' + rest.length + '行・' + rn + '点　計 ' + yen(rs), W - PAD * 2), PAD, y0 + rows * (CH + GAP) + 10);
    }
    return cv.toDataURL('image/jpeg', 0.86).split(',')[1];
  }

  function pollStatus() {
    clearInterval(S.pollT);
    var ri = S.tx && reqInfo(); if (!ri || ri.kind !== 'approval' || ri.status !== '承認待ち') return;
    var tx = S.tx;
    S.pollT = setInterval(async function () {
      if (S.tx !== tx) { clearInterval(S.pollT); return; }
      try {
        var j = await gas({ action: 'kstatus', id: ri.id });
        if (j.status && j.status !== '承認待ち') { ri.status = j.status; ri.by = j.by; saveReq(ri); clearInterval(S.pollT); renderDetail(); }
      } catch (e) { }
    }, 8000);
  }
})();
