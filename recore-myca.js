/* ナタデココ RECORE（宅配買取）→ マイカ 在庫移し
 * 1つのブックマークで2つの画面に対応する。
 *  ① RECOREの宅配買取ケース画面で押す → ケースの買取商品を読み、マイカの「発注管理」を新しいタブで開く（データはURLの#に入れて渡す）
 *  ② 開いたマイカの画面でもう一度押す → 移す先（横浜／中野）を選び、商品をマイカの商品に照合 → 確認して「マイカに登録」
 *     登録は今の手作業と同じ「入荷（仕入先＝初期在庫、仕入値＝RECOREの買取単価・税込）」を作って、そのまま納品まで行う。
 * RECOREには何も書き込まない。マイカへの書き込みは「マイカに登録」を押したときだけ。 */
(function () {
  'use strict';
  var VERSION = '2026-11-28 版A';
  var FB_URL = 'https://script.google.com/macros/s/AKfycbwl-ZCZ1LyefvSzEGkBEpTFTuFyvW0p-AYye6jBWaLP9t7-bC9_Owfeh4jKScNkFys6Fw/exec';
  var FB_TOOL = 'RECORE→マイカ在庫移し';
  var MYCA_URL = 'https://pos.mycalinks.com/auth/arrival';
  var STORES = [[326, '中野'], [325, '横浜']];      // 移す先（選択制）
  var SUPPLIER_NAME = '初期在庫';
  var SKIP_TITLES = /キャッシュバック|送料|レターパック/;   // 送料返金など、在庫ではない行
  var HOST_ID = 'ndk-recore-myca-host';
  var LS_MAP = 'ndk_rm_map';      // RECOREの商品コード → マイカの商品名（覚えた照合）
  var LS_DONE = 'ndk_rm_done';    // 移したケース（二重登録防止）
  var LS_STORE = 'ndk_rm_store';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function yen(n) { return '¥' + Math.round(Number(n) || 0).toLocaleString(); }
  function nfkc(s) { return String(s == null ? '' : s).normalize('NFKC'); }
  function norm(s) {
    return nfkc(s).toLowerCase()
      .replace(/グレード別\s*グロス|グロス/g, '')
      .replace(/ポケモンカードゲーム|スカーレット&バイオレット|ソード&シールド|サン&ムーン|強化拡張パック|拡張パック|ハイクラスパック/g, '')
      .replace(/[\s　【】\[\]{}()（）「」『』〔〕《》<>・,、。:：\/]/g, '')
      .replace(/[‐－―ー−-]/g, '-');
  }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function b64e(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64d(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return JSON.parse(decodeURIComponent(escape(atob(s)))); }

  var old = document.getElementById(HOST_ID); if (old) old.remove();
  var host = document.createElement('div'); host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000';
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box}' +
    '.bg{position:fixed;inset:0;background:rgba(15,23,42,.45)}' +
    '.pn{position:fixed;top:3vh;left:50%;transform:translateX(-50%);width:min(1180px,96vw);max-height:94vh;display:flex;flex-direction:column;background:#fff;color:#1d1d22;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35);font:14px/1.6 "Hiragino Sans","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif}' +
    '.hd{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#1d1d22;color:#fff}.hd b{font-size:16px}.hd .v{opacity:.6;font-size:11px}.sp{flex:1}' +
    'button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:7px 14px;background:#e5e7eb;color:#1d1d22;font-weight:700}' +
    'button.p{background:#c8102e;color:#fff}button.p:disabled{background:#e9a3ae;cursor:default}button.s{padding:3px 10px;font-size:12px}' +
    '.fbb{background:#2563eb;color:#fff;border-radius:999px;font-size:12px}' +
    '.bd{padding:14px 16px;overflow:auto}.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px}' +
    'select,input{font:inherit;padding:5px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1d1d22}' +
    'table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #eef0f3;padding:6px;text-align:left;vertical-align:middle}th{background:#f8fafc;position:sticky;top:0;z-index:1}' +
    'td.n{text-align:right;white-space:nowrap}.pick{max-width:470px;width:100%}.q{width:150px}' +
    '.chip{display:inline-block;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:700;white-space:nowrap}' +
    '.ok{background:#dcfce7;color:#166534}.ch{background:#fef3c7;color:#92400e}.sk{background:#f1f5f9;color:#64748b}.ng{background:#fee2e2;color:#991b1b}' +
    'tr.off td{opacity:.45}' +
    '.msg{padding:10px 12px;border-radius:10px;margin:8px 0;white-space:pre-wrap}.msg.e{background:#fee2e2;color:#991b1b}.msg.i{background:#f1f5f9}.msg.s{background:#dcfce7;color:#166534}.msg.w{background:#fef3c7;color:#92400e}' +
    '.ft{display:flex;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid #eef0f3;background:#fafafa;flex-wrap:wrap}.tot{font-weight:700}' +
    '.mut{color:#64748b;font-size:12px}.st label{display:inline-flex;gap:6px;align-items:center;border:2px solid #cbd5e1;border-radius:10px;padding:6px 14px;font-weight:800;cursor:pointer}.st label.on{border-color:#c8102e;background:#fff1f2;color:#c8102e}' +
    '</style><div class="bg"></div><div class="pn">' +
    '<div class="hd"><b>RECORE → マイカ 在庫移し</b><span class="v">' + VERSION + '</span><span class="sp"></span><button id="fb" class="fbb">意見を送る</button><button id="close">閉じる ×</button></div>' +
    '<div class="bd" id="bd"></div><div class="ft" id="ft"></div></div>';
  var $ = function (q) { return root.querySelector(q); };
  var S = { busy: false }; window.__ndkRm = S;
  $('#close').onclick = function () { if (!S.busy) host.remove(); };
  $('#fb').onclick = function () { window.open(FB_URL + '?tool=' + encodeURIComponent(FB_TOOL) + '&store=' + encodeURIComponent(S.storeName || '中野'), '_blank'); };
  function body(h) { $('#bd').innerHTML = h; }
  function foot(h) { $('#ft').innerHTML = h; }
  function fail(m) { body('<div class="msg e">' + esc(m) + '</div>'); foot(''); }
  function errText(e) { return (e && (e.response && e.response.data && (e.response.data.message || JSON.stringify(e.response.data)))) || (e && e.message) || String(e); }

  if (location.hostname === 'app.recore-pos.com') recoreSide();
  else if (location.hostname === 'pos.mycalinks.com') mycaSide();
  else fail('RECOREの宅配買取のケース画面で押してください。');

  /* =====================================================================
   * ① RECORE側：ケースを読んでマイカを開く
   * ===================================================================== */
  async function recoreSide() {
    var R = window.$nuxt && window.$nuxt.$resource;
    if (!R) return fail('RECOREの画面がまだ読み込まれていません。少し待ってからもう一度押してください。');
    var m = location.pathname.match(/^\/bad\/case\/(\d+)/);
    if (!m) return fail('宅配買取のケース画面（宅配買取 → ケースリスト → お客様のケース）を開いてから押してください。');
    body('<div class="msg i">ケースを読み込んでいます…</div>');
    var cs;
    try { cs = (await R.get('/bad_cases/' + m[1])).data; } catch (e) { return fail('ケースを読み込めませんでした：' + errText(e)); }
    function f(o, a, b) { return o == null ? undefined : (o[a] !== undefined ? o[a] : o[b]); }   // RECOREの画面側はキャメルケースで返すことがある
    var goods = (cs.goods || []).filter(function (g) { return !f(g, 'is_canceled', 'isCanceled'); });
    if (!goods.length) return fail('このケースには（不成約以外の）買取商品がありません。');
    var data = {
      v: 1, caseId: cs.id, code: cs.code, total: cs.summary && cs.summary.total, status: cs.status,
      stockedAt: f(cs, 'stocked_at', 'stockedAt') || null,
      goods: goods.map(function (g) {
        return {
          t: (g.product && g.product.title) || '', pc: (g.product && g.product.code) || '', cat: (g.product && g.product.category && g.product.category.name) || '',
          gr: (g.grade && g.grade.name) || '', q: Number(g.quantity) || 0, u: Number(f(g, 'unit_price', 'unitPrice')) || 0, nt: [f(g, 'condition_note', 'conditionNote'), g.note].filter(Boolean).join(' ')
        };
      })
    };
    var notStocked = ['STOCKED', 'PAID'].indexOf(cs.status) < 0;
    var url = MYCA_URL + '#ndkrm=' + b64e(data);
    body((notStocked ? '<div class="msg w">⚠️ このケースはまだ「買取完了（入庫済み）」になっていません（今：' + esc(cs.status) + '）。査定が確定してから移すのがおすすめです。</div>' : '') +
      '<div class="msg i">ケース ' + esc(cs.code) + '（' + goods.length + '行・' + yen(data.total) + '）を読み込みました。\n「マイカを開く」を押すと、マイカの発注管理が新しいタブで開きます。\n<b>開いたマイカの画面で、もう一度このブックマークを押してください。</b></div>');
    foot('<span class="sp"></span><button class="p" id="go">マイカを開く</button>');
    $('#go').onclick = function () { window.open(url, '_blank'); host.remove(); };
  }

  /* =====================================================================
   * ② マイカ側：照合して入荷を作る
   * ===================================================================== */
  async function api(method, path, bodyObj) {
    var r = await fetch('/api' + path, { method: method, headers: bodyObj ? { 'Content-Type': 'application/json' } : {}, body: bodyObj ? JSON.stringify(bodyObj) : undefined, credentials: 'include' });
    var t = await r.text(); var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
    if (!r.ok) throw new Error((j && (j.error || j.message)) || ('HTTP ' + r.status));
    return j;
  }

  async function mycaSide() {
    var mh = location.hash.match(/ndkrm=([A-Za-z0-9_-]+)/);
    var data = null;
    if (mh) { try { data = b64d(mh[1]); sessionStorage.setItem('ndk_rm_data', JSON.stringify(data)); history.replaceState(null, '', location.pathname + location.search); } catch (e) { } }
    if (!data) { try { data = JSON.parse(sessionStorage.getItem('ndk_rm_data') || 'null'); } catch (e) { } }
    if (!data) return fail('移すケースがありません。\n先にRECOREの宅配買取ケース画面でこのブックマークを押し、「マイカを開く」から開いたマイカのタブで押してください。');
    S.data = data;
    S.rows = data.goods.map(function (g, i) { return { i: i, g: g, use: !SKIP_TITLES.test(g.t) && g.q > 0, cands: [], pick: null, st: '' }; });
    var saved = Number(lsGet(LS_STORE, 326));
    S.sid = STORES.some(function (s) { return s[0] === saved; }) ? saved : STORES[0][0];
    drawStorePick();
  }

  function drawStorePick() {
    var d = S.data;
    var done = lsGet(LS_DONE, {})[d.code];
    body('<div class="msg i">RECOREケース <b>' + esc(d.code) + '</b>（' + d.goods.length + '行・RECORE合計 ' + yen(d.total) + '）</div>' +
      (done ? '<div class="msg w">⚠️ このケースは ' + esc(done.at) + ' に ' + esc(done.store) + ' のマイカへ移しています（入荷 #' + esc(done.id) + '）。二重登録に注意してください。</div>' : '') +
      '<div class="row st"><b>移す先のマイカ：</b>' + STORES.map(function (s) { return '<label class="' + (s[0] === S.sid ? 'on' : '') + '"><input type="radio" name="st" value="' + s[0] + '"' + (s[0] === S.sid ? ' checked' : '') + '>' + s[1] + '</label>'; }).join('') + '</div>');
    foot('<span class="sp"></span><button class="p" id="next">商品を照合する</button>');
    root.querySelectorAll('input[name=st]').forEach(function (r) {
      r.onchange = function () { S.sid = Number(r.value); root.querySelectorAll('.st label').forEach(function (l) { l.classList.toggle('on', l.querySelector('input').checked); }); };
    });
    $('#next').onclick = function () { lsSet(LS_STORE, S.sid); S.storeName = STORES.filter(function (s) { return s[0] === S.sid; })[0][1]; runMatch(); };
  }

  /* ---------- 店舗の基本情報 ---------- */
  async function loadStoreInfo() {
    var cat = await api('GET', '/store/' + S.sid + '/item/category');
    var cats = cat.itemCategories || cat.categories || cat.data || cat || [];
    S.cond = {};       // condition_option_id → {name, cat}
    (Array.isArray(cats) ? cats : []).forEach(function (c) { (c.condition_options || []).forEach(function (o) { S.cond[o.id] = { name: o.display_name, cat: c.display_name }; }); });
    var sup = await api('GET', '/store/' + S.sid + '/stocking/supplier?take=-1');
    var s = (sup.data || []).filter(function (x) { return x.display_name === SUPPLIER_NAME; })[0];
    if (!s) throw new Error(S.storeName + 'のマイカに仕入先「' + SUPPLIER_NAME + '」がありません');
    S.supplierId = s.id;
  }
  var cache = {};
  async function search(kw) {
    kw = nfkc(kw).trim(); if (!kw) return [];
    var key = S.sid + '|' + kw; if (cache[key]) return cache[key];
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 12000), j;
    try {
      var r = await fetch('/api/store/' + S.sid + '/product?display_name=' + encodeURIComponent(kw) + '&take=60', { credentials: 'include', signal: ctl.signal });
      j = r.ok ? await r.json() : { products: [] };
    } catch (e) { j = { products: [] }; } finally { clearTimeout(tm); }
    return (cache[key] = (j.products || []).filter(function (p) { return !p.deleted; }));
  }

  /* ---------- 照合 ---------- */
  function condWanted(g) {
    var gr = nfkc(g.gr).replace(/\s/g, '');
    if (/^中古A-|A-$/.test(gr)) return { card: '状態A-', other: '中古' };
    if (/^中古A|^A$/.test(gr)) return { card: '状態A', other: '中古' };
    if (/B/.test(gr)) return { card: '状態B', other: '中古' };
    if (/C/.test(gr)) return { card: '状態C', other: '中古' };
    if (/D/.test(gr)) return { card: '状態D', other: '中古' };
    if (/未使用/.test(gr)) return { card: '状態A', other: '未使用' };
    if (/新品/.test(gr)) return { card: '状態A', other: '新品' };
    return { card: '状態A', other: '中古' };
  }
  function condName(p) { if (p.condition_option_display_name) return p.condition_option_display_name; var c = S.cond[p.condition_option_id]; return c ? c.name : ''; }
  function fullName(p) { return p.displayNameWithMeta || p.display_name || ''; }
  function condOk(p, g) {
    var n = condName(p); if (!n || n === '状態なし') return true;
    var w = condWanted(g);
    return /^状態/.test(n) ? n === w.card : n === w.other;
  }
  function parseTitle(t) {
    var s = nfkc(t);
    var num = (s.match(/[A-Za-z]{2,6}#\d{1,4}/) || s.match(/(\d{1,3})\s*\/\s*([A-Za-z]*-?[A-Za-z0-9]+)/) || [])[0] || '';
    num = num.replace(/\s/g, '');
    var exp = '';
    var m1 = s.match(/\[([A-Za-z0-9-]+)\]/); if (m1) exp = m1[1];
    var m2 = s.match(/\d{1,3}\/\d{1,3}\/([A-Za-z0-9-]+)\//); if (!exp && m2) exp = m2[1];
    var psa = (s.match(/PSA\s*(\d{1,2})/i) || [])[1] || '';
    var unopened = /未開封/.test(s);
    var trainer = (s.match(/(ポケモン\/)?トレーナーズ【@\d+】|ストレージ[@＠]\d+/) || [])[0] || '';
    var quoted = (s.match(/「([^」]+)」/) || [])[1] || '';
    var name = s.replace(/【[^】]*】|\[[^\]]*\]|\{[^}]*\}|\([^)]*\)|（[^）]*）/g, ' ')
      .replace(/\d{1,3}\s*\/\s*[A-Za-z0-9\/-]+/g, ' ').replace(/[A-Za-z]{2,6}#\d{1,4}/g, ' ').replace(/PSA\s*\d+/ig, ' ')
      .replace(/LV\.?\s*\d+/ig, ' ').replace(/\b1ED\)?/g, ' ').replace(/\b\d+th\/\d+\b/g, ' ').trim();
    return { num: num, exp: exp, psa: psa, unopened: unopened, trainer: trainer, quoted: quoted, name: name, box: /BOX|ボックス/i.test(s) };
  }
  function score(p, g, pt) {
    var nm = nfkc(fullName(p)), n = norm(nm), s = 0;
    var cn = nfkc(p.item_cardnumber || '').replace(/\s/g, '').toLowerCase();
    if (pt.num) { var pn = pt.num.toLowerCase(); if (cn && cn === pn) s += 45; else if (cn && (cn.indexOf(pn) === 0 || pn.indexOf(cn) === 0)) s += 35; else if (nm.replace(/\s/g, '').toLowerCase().indexOf(pn) >= 0) s += 40; else s -= 20; }
    if (pt.exp) { var pe = norm(pt.exp); if (norm(p.item_expansion || '') === pe) s += 25; else if (n.indexOf(pe) >= 0) s += 20; else s -= 10; }
    if (pt.psa) s += (nm.indexOf('PSA' + pt.psa) >= 0 ? 30 : -60); else if (/PSA/.test(nm)) s -= 60;
    if (pt.unopened) s += (/未開封/.test(nm) ? 15 : -10); else if (/未開封/.test(nm)) s -= 20;
    if (/海外版/.test(nm)) s -= 30;
    if (/在庫移動/.test(nm)) s -= 40;
    if (/《BOX状態/.test(nm)) s -= 5;
    var a = norm(pt.name), b = norm(p.item_name || p.display_name || nm);
    if (a && b) {
      if (b.indexOf(a) >= 0 || a.indexOf(b) >= 0) s += 40;
      else { var hit = 0; for (var i = 0; i < a.length - 1; i++) if (b.indexOf(a.substr(i, 2)) >= 0) hit++; var ra = hit / Math.max(1, a.length - 1); s += Math.round(35 * ra); if (ra < 0.3) s -= 30; }
    }
    if (pt.quoted && b.indexOf(norm(pt.quoted)) >= 0) s += 25;
    if (pt.trainer) { var tn = norm(p.item_name || p.display_name), tw = norm(pt.trainer).replace(/^ポケモン/, ''); if (tn === tw || tn === 'ポケモン' + tw) s += 60; }
    if (condOk(p, g)) s += 20; else s -= 15;
    if (p.is_active) s += 3;
    if (p.stock_number > 0) s += 2;
    return s;
  }
  async function matchRow(row) {
    var g = row.g, pt = parseTitle(g.t), list = [], seen = {};
    function add(arr) { arr.forEach(function (p) { if (!seen[p.id]) { seen[p.id] = 1; list.push(p); } }); }
    var learned = lsGet(LS_MAP, {})[g.pc];   // {kw, full}
    if (learned && learned.kw) add(await search(learned.kw));
    if (pt.trainer) add(await search(pt.trainer));
    if (pt.num) add(await search(pt.num.replace(/-.*$/, '')));
    if (!pt.num && !pt.trainer) {
      if (pt.quoted) add(await search(pt.quoted + (pt.box ? ' BOX' : '')));
      if (list.length < 3 && pt.quoted) add(await search(pt.quoted));
      if (list.length < 3) { var w = pt.name.split(/\s+/).filter(function (x) { return x.length >= 2; }).sort(function (a, b) { return b.length - a.length; })[0]; if (w) add(await search(w)); }
    }
    if (!list.length && pt.name) add(await search(pt.name.slice(0, 12)));
    function isLearned(p) { return learned && learned.full && nfkc(fullName(p)) === nfkc(learned.full) && condOk(p, g); }
    list.forEach(function (p) { p._s = score(p, g, pt); if (isLearned(p)) p._s += 60; });
    list.sort(function (a, b) { return b._s - a._s; });
    row.cands = list.slice(0, 25);
    row.pick = row.cands[0] || null;
    var top = row.cands[0], second = row.cands[1];
    if (!top) row.st = 'ng';
    else if (isLearned(top) || (top._s >= 75 && (!second || top._s - second._s >= 15) && condOk(top, g))) row.st = 'ok';
    else row.st = 'ch';
  }

  async function runMatch() {
    S.busy = true;
    body('<div class="msg i">' + esc(S.storeName) + 'のマイカで商品を照合しています…</div>'); foot('');
    try { await loadStoreInfo(); } catch (e) { S.busy = false; return fail('マイカの情報を読み込めませんでした：' + e.message + '\nマイカに管理モードでログインしているか確認してください。'); }
    for (var i = 0; i < S.rows.length; i++) {
      var r = S.rows[i];
      if (!r.use) { r.st = 'sk'; continue; }
      try { await matchRow(r); } catch (e) { r.st = 'ng'; r.err = e.message; }
      $('#bd').innerHTML = '<div class="msg i">照合中… ' + (i + 1) + ' / ' + S.rows.length + '</div>';
    }
    S.busy = false;
    drawTable();
  }

  function label(p) { return fullName(p) + (condName(p) ? '［' + condName(p) + '］' : '') + (p.is_active ? '' : '（非表示）') + '　在庫' + (p.stock_number || 0); }
  function chip(r) {
    if (!r.use) return '<span class="chip sk">移さない</span>';
    if (!r.pick) return '<span class="chip ng">❌ 見つからない</span>';
    return r.st === 'ok' ? '<span class="chip ok">✅ 一致</span>' : '<span class="chip ch">⚠️ 確認</span>';
  }
  function drawTable() {
    var d = S.data;
    var html = '<div class="row"><span>RECOREケース <b>' + esc(d.code) + '</b> → <b style="color:#c8102e">' + esc(S.storeName) + 'のマイカ</b>（仕入先：' + SUPPLIER_NAME + '）</span><span class="sp"></span><button class="s" id="back">移す先を変える</button></div>' +
      '<div class="mut">✅ 一致はそのままでOK。⚠️ 確認は候補から正しい商品（状態も）を選んでください。見つからないときは右の欄で検索できます。送料（キャッシュバック）は最初から「移さない」になっています。</div>' +
      '<table><thead><tr><th>移す</th><th>RECOREの商品</th><th>グレード</th><th class="n">数</th><th class="n">単価</th><th>マイカの商品</th><th></th><th>検索</th></tr></thead><tbody>' +
      S.rows.map(function (r) {
        var g = r.g;
        var opts = r.cands.map(function (p) { return '<option value="' + p.id + '"' + (r.pick && r.pick.id === p.id ? ' selected' : '') + '>' + esc(label(p)) + '</option>'; }).join('');
        return '<tr class="' + (r.use ? '' : 'off') + '" data-i="' + r.i + '"><td><input type="checkbox" class="use"' + (r.use ? ' checked' : '') + '></td>' +
          '<td>' + esc(g.t) + (g.nt ? '<div class="mut">' + esc(g.nt) + '</div>' : '') + '</td><td>' + esc(g.gr) + '</td><td class="n">' + g.q + '</td><td class="n">' + yen(g.u) + '</td>' +
          '<td>' + (r.cands.length ? '<select class="pick">' + opts + '</select>' : '<span class="mut">候補なし</span>') + '</td><td>' + chip(r) + '</td>' +
          '<td><input class="q" placeholder="商品名・型番"><button class="s sb">検索</button></td></tr>';
      }).join('') + '</tbody></table>';
    body(html);
    drawFoot();
    $('#back').onclick = drawStorePick;
    root.querySelectorAll('tr[data-i]').forEach(function (tr) {
      var r = S.rows[Number(tr.dataset.i)];
      tr.querySelector('.use').onchange = function (e) { r.use = e.target.checked; if (r.use && !r.cands.length && !r.searched) { r.searched = 1; matchRow(r).then(drawTable); } else drawTable(); };
      var sel = tr.querySelector('.pick');
      if (sel) sel.onchange = function () { r.pick = r.cands.filter(function (p) { return String(p.id) === sel.value; })[0]; r.st = 'ok'; drawTable(); };
      var q = tr.querySelector('.q');
      tr.querySelector('.sb').onclick = async function () {
        if (!q.value.trim()) return;
        try {
          var l = await search(q.value);
          var pt = parseTitle(r.g.t); l.forEach(function (p) { p._s = score(p, r.g, pt); }); l.sort(function (a, b) { return b._s - a._s; });
          r.cands = l.slice(0, 40); r.pick = r.cands[0] || null; r.st = r.pick ? 'ch' : 'ng'; r.use = true; drawTable();
        } catch (e) { alert('検索できませんでした：' + e.message); }
      };
      q.onkeydown = function (e) { if (e.key === 'Enter') tr.querySelector('.sb').click(); };
    });
  }
  function drawFoot() {
    var use = S.rows.filter(function (r) { return r.use; });
    var tot = use.reduce(function (a, r) { return a + r.g.u * r.g.q; }, 0);
    var cnt = use.reduce(function (a, r) { return a + r.g.q; }, 0);
    var bad = use.filter(function (r) { return !r.pick; }).length;
    var chk = use.filter(function (r) { return r.pick && r.st !== 'ok'; }).length;
    var skipTot = S.rows.filter(function (r) { return !r.use; }).reduce(function (a, r) { return a + r.g.u * r.g.q; }, 0);
    foot('<span class="tot">登録する仕入値合計 ' + yen(tot) + '（' + use.length + '行・' + cnt + '点）</span>' +
      '<span class="mut">RECORE合計 ' + yen(S.data.total) + (skipTot ? '／移さない分 ' + yen(skipTot) : '') + '</span>' +
      (bad ? '<span class="chip ng">商品未選択 ' + bad + '行</span>' : '') + (chk ? '<span class="chip ch">⚠️ 未確認 ' + chk + '行</span>' : '') +
      '<span class="sp"></span><button class="p" id="reg"' + (bad || chk || !use.length ? ' disabled' : '') + '>' + esc(S.storeName) + 'のマイカに登録</button>');
    var b = $('#reg'); if (b) b.onclick = register;
  }

  /* ---------- 二重登録チェック（同じ店の最近の「初期在庫」入荷と中身が同じか） ---------- */
  async function findDuplicate(lines) {
    var j = await api('GET', '/store/' + S.sid + '/stocking?take=40&skip=0');
    var key = function (arr) { return arr.map(function (x) { return x[0] + 'x' + x[1] + '@' + x[2]; }).sort().join(','); };
    var mine = key(lines.map(function (l) { return [l.product_id, l.planned_item_count, l.unit_price]; }));
    var recent = (j.data || []).filter(function (x) { return x.supplier_id === S.supplierId && x.status !== 'CANCELED' && Date.now() - new Date(x.created_at) < 21 * 864e5; });
    for (var i = 0; i < recent.length; i++) {
      var x = recent[i];
      var tot = lines.reduce(function (a, l) { return a + l.unit_price * l.planned_item_count; }, 0);
      if (x.total_wholesale_price != null && x.total_wholesale_price !== tot) continue;
      var dj = await api('GET', '/store/' + S.sid + '/stocking/' + x.id);
      var sp = (dj.data.stocking_products || []).map(function (p) { return [p.product_id, p.actual_item_count || p.planned_item_count, p.unit_price]; });
      if (key(sp) === mine) return x;
    }
    return null;
  }

  /* ---------- 登録（入荷を作って納品まで） ---------- */
  function jstMidnightISO() { var n = new Date(Date.now() + 9 * 3600e3); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - 9 * 3600e3).toISOString(); }
  async function register() {
    if (S.busy) return;
    var use = S.rows.filter(function (r) { return r.use && r.pick; });
    // 同じ商品・同じ単価はまとめる
    var map = {};
    use.forEach(function (r) { var k = r.pick.id + '@' + r.g.u; if (!map[k]) map[k] = { product_id: r.pick.id, planned_item_count: 0, unit_price: r.g.u, unit_price_without_tax: null }; map[k].planned_item_count += r.g.q; });
    var lines = Object.keys(map).map(function (k) { return map[k]; });
    var tot = lines.reduce(function (a, l) { return a + l.unit_price * l.planned_item_count; }, 0);
    S.busy = true; $('#reg').disabled = true;
    try {
      var dup = await findDuplicate(lines);
      if (dup && !confirm('同じ中身の入荷（#' + dup.id + '・' + yen(dup.total_wholesale_price) + '）がすでに' + S.storeName + 'のマイカにあります。\nそれでも登録しますか？')) { S.busy = false; drawFoot(); return; }
      if (!confirm(S.storeName + 'のマイカに入荷を登録して、納品（在庫に追加）まで行います。\n仕入先：' + SUPPLIER_NAME + '\n' + lines.length + '商品・合計 ' + yen(tot) + '\nよろしいですか？')) { S.busy = false; drawFoot(); return; }
      body('<div class="msg i">登録しています…</div>'); foot('');
      var today = jstMidnightISO();
      var cr = await api('POST', '/store/' + S.sid + '/stocking', { planned_date: today, supplier_id: S.supplierId, stocking_products: lines });
      var sid = (cr && (cr.id || (cr.data && cr.data.id) || (cr.stocking && cr.stocking.id)));
      if (!sid) { // 返り値にIDが無いときは最新の入荷から探す
        var lj = await api('GET', '/store/' + S.sid + '/stocking?take=5&skip=0');
        var f = (lj.data || []).filter(function (x) { return x.supplier_id === S.supplierId && x.status === 'NOT_YET'; })[0];
        sid = f && f.id;
      }
      if (!sid) throw new Error('入荷は作れましたが番号が分かりませんでした。マイカの発注管理で「未納品」を確認し、手で納品してください。');
      var det = (await api('GET', '/store/' + S.sid + '/stocking/' + sid)).data;
      await api('POST', '/store/' + S.sid + '/stocking/' + sid + '/apply', {
        actual_date: today,
        stocking_products: det.stocking_products.map(function (p) { return { id: p.id, actual_item_count: p.planned_item_count }; })
      });
      // 照合を覚える・移したケースを記録
      var lm = lsGet(LS_MAP, {}); use.forEach(function (r) { if (r.g.pc && !/トレーナーズ|ストレージ/.test(r.g.t)) lm[r.g.pc] = { kw: r.pick.item_cardnumber ? String(r.pick.item_cardnumber).replace(/-.*$/, '') : (r.pick.item_name || r.pick.display_name), full: fullName(r.pick) }; }); lsSet(LS_MAP, lm);
      var dn = lsGet(LS_DONE, {}); dn[S.data.code] = { id: sid, store: S.storeName, at: new Date().toLocaleString('ja-JP') }; lsSet(LS_DONE, dn);
      try { sessionStorage.removeItem('ndk_rm_data'); } catch (e) { }
      S.busy = false;
      body('<div class="msg s">✅ ' + esc(S.storeName) + 'のマイカに登録しました（入荷 #' + sid + '・' + lines.length + '商品・' + yen(tot) + '）。\n発注管理の「納品済み」で確認できます。</div>');
      foot('<span class="sp"></span><button id="ok2">閉じる</button>');
      $('#ok2').onclick = function () { host.remove(); location.reload(); };
    } catch (e) {
      S.busy = false;
      body('<div class="msg e">登録できませんでした：' + esc(e.message) + '\nマイカの発注管理を開き、途中まで作られた入荷（未納品）が無いか確認してください。</div>');
      foot('<span class="sp"></span><button id="rt">照合画面に戻る</button>');
      $('#rt').onclick = drawTable;
    }
  }
})();
