/* ナタデココ 全店舗在庫確認（マイカ上で動くブックマークレット本体） */
(function () {
  'use strict';
  if (location.hostname !== 'pos.mycalinks.com') { alert('マイカ（pos.mycalinks.com）を開いてから押してください'); return; }
  var old = document.getElementById('ndk-zaiko-host'); if (old) old.remove();

  var ORDER = [328, 322, 327, 324, 326, 409, 323, 325, 390];
  var SHORT = { 322: '柏', 323: '津田沼', 324: '松戸', 325: '横浜', 326: '中野', 327: '町田', 328: '千葉中央', 390: '通販', 409: 'お台場' };
  var KIND = { box: 'BOX', card: 'シングル', psa: 'PSA', pack: 'パック', storage: 'ストレージ' };
  var FB_URL = 'https://script.google.com/macros/s/AKfycbwl-ZCZ1LyefvSzEGkBEpTFTuFyvW0p-AYye6jBWaLP9t7-bC9_Owfeh4jKScNkFys6Fw/exec';

  var S = {
    stores: [], rows: [], failed: [],
    f: { kinds: { box: 1, card: 1, psa: 1, pack: 0, storage: 0 }, min: 5, q: '', sort: 'total', onlySkew: false, useStores: null, limit: 200 },
    sel: {}
  };

  /* ---------- 画面 ---------- */
  var host = document.createElement('div'); host.id = 'ndk-zaiko-host';
  host.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000');
  document.body.appendChild(host);
  var R = host.attachShadow({ mode: 'open' });
  R.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box}' +
    '.bg{position:fixed;inset:0;background:rgba(20,20,25,.45);display:flex;align-items:stretch;justify-content:center;padding:14px;font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;color:#1d1d22;font-size:13px;line-height:1.5}' +
    '.win{background:#f6f5f2;border-radius:14px;width:100%;max-width:1500px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.35)}' +
    '.hd{background:#1d1d22;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px}' +
    '.hd h1{font-size:16px;margin:0;font-weight:800}.hd h1 b{color:#e8c23a}.hd .sp{flex:1}' +
    '.hd button{all:unset;cursor:pointer;color:#fff;font-weight:700;padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.12)}' +
    '.bar{padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;border-bottom:1px solid #e5e2da;background:#fff}' +
    '.bar label{display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap}' +
    '.bar input[type=number]{width:64px;padding:4px 6px;border:1.5px solid #d6d2c8;border-radius:7px;font:inherit}' +
    '.bar input[type=search]{width:200px;padding:5px 8px;border:1.5px solid #d6d2c8;border-radius:7px;font:inherit}' +
    '.bar select{padding:4px 6px;border:1.5px solid #d6d2c8;border-radius:7px;font:inherit;background:#fff}' +
    '.grp{display:inline-flex;gap:8px;align-items:center}.grp>span{color:#777;font-size:12px}' +
    '.sum{padding:8px 16px;display:flex;gap:18px;flex-wrap:wrap;background:#fbfaf7;border-bottom:1px solid #e5e2da}' +
    '.sum div{font-size:12px;color:#666}.sum b{font-size:16px;color:#1d1d22;margin-left:4px}' +
    '.body{flex:1;overflow:auto}' +
    'table{border-collapse:separate;border-spacing:0;width:100%;font-size:12.5px}' +
    'th{position:sticky;top:0;background:#efede7;z-index:2;padding:6px 6px;text-align:right;font-weight:700;border-bottom:1px solid #d6d2c8;white-space:nowrap;cursor:default}' +
    'th.l,td.l{text-align:left}th.st{min-width:46px;text-align:center}th.sortable{cursor:pointer}th.on{color:#c8102e}' +
    'td{padding:5px 6px;border-bottom:1px solid #eceae4;text-align:right;white-space:nowrap;background:#fff}' +
    'tr:hover td{background:#fffbea}' +
    'td.nm{white-space:normal;min-width:220px;max-width:340px}td.nm .n{font-weight:700}td.nm .m{color:#888;font-size:11.5px}' +
    'td.st{text-align:center;font-variant-numeric:tabular-nums;padding:5px 2px}' +
    'td.st span{display:inline-block;min-width:38px;padding:2px 4px;border-radius:6px}' +
    'td.st span.z{color:#c9c5bb}' +
    'img.th{width:34px;height:46px;object-fit:contain;vertical-align:middle;border-radius:3px;background:#f2f0ea}' +
    '.tag{display:inline-block;font-size:11px;padding:0 6px;border-radius:999px;background:#eee;color:#555;margin-right:4px}' +
    '.tag.box{background:#e3ecff;color:#1d4ed8}.tag.card{background:#e8f6ea;color:#15803d}.tag.psa{background:#fff1d6;color:#a16207}' +
    '.skew{font-size:11.5px;color:#c8102e;font-weight:700}' +
    '.bp{font-weight:700}.bp.diff{color:#c8102e}' +
    '.old{color:#b45309}' +
    'button.b{all:unset;cursor:pointer;font-weight:700;font-size:12px;padding:4px 9px;border-radius:7px;background:#1d1d22;color:#fff}' +
    'button.b.r{background:#c8102e}button.b.g{background:#fff;color:#1d1d22;border:1.5px solid #d6d2c8}' +
    'button.b[disabled]{opacity:.45;cursor:default}' +
    '.msg{padding:40px;text-align:center;color:#666;font-size:14px}.err{color:#c8102e}' +
    '.more{padding:14px;text-align:center}' +
    '.selbar{padding:8px 16px;background:#1d1d22;color:#fff;display:none;align-items:center;gap:10px;flex-wrap:wrap}.selbar.on{display:flex}' +
    '.selbar input{width:70px;padding:4px 6px;border-radius:7px;border:0;font:inherit}' +
    '.selbar select{padding:4px;border-radius:7px;border:0;font:inherit}' +
    '.md{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:5}' +
    '.mbox{background:#fff;border-radius:14px;padding:18px 20px;width:min(720px,94vw);max-height:88vh;overflow:auto}' +
    '.mh{font-size:16px;font-weight:800;margin-bottom:8px}.sm{font-size:12px;color:#666}' +
    '.mbox table td,.mbox table th{position:static;font-size:12.5px}' +
    '.acts{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}' +
    '.frm{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}' +
    '.frm input[type=number]{width:110px;padding:6px 8px;border:1.5px solid #d6d2c8;border-radius:8px;font:inherit;font-size:15px}' +
    '.ok{color:#15803d;font-weight:700}.ng{color:#c8102e;font-weight:700}' +
    '.warn{background:#fdf6dc;color:#7a5b00;border-radius:8px;padding:8px 10px;font-size:12px;margin-top:8px}' +
    '.ndk-fb{all:unset;cursor:pointer;font-weight:700;font-size:12px;color:#fff;background:#2563eb;border-radius:999px;padding:6px 12px}' +
    '</style>' +
    '<div class="bg"><div class="win">' +
    '<div class="hd"><h1>全店舗<b>在庫確認</b></h1><span class="sm" id="upd" style="color:#bbb"></span><span class="sp"></span>' +
    '<button class="ndk-fb" id="fb">意見を送る</button><button id="csv">CSV</button><button id="rl">再読み込み</button><button id="x">閉じる ✕</button></div>' +
    '<div class="bar" id="bar"></div><div class="sum" id="sum"></div>' +
    '<div class="selbar" id="selbar"></div>' +
    '<div class="body" id="body"><div class="msg">読み込み中…</div></div>' +
    '</div></div>';
  var $ = function (q) { return R.querySelector(q); };
  $('#x').onclick = function () { host.remove(); };
  $('#rl').onclick = function () { load(); };
  $('#csv').onclick = csv;
  $('#fb').onclick = function () { window.open(FB_URL + '?tool=' + encodeURIComponent('全店舗在庫確認') + '&store=' + encodeURIComponent('本部'), '_blank'); };

  /* ---------- 共通 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function yen(n) { return '¥' + Math.round(n || 0).toLocaleString('ja-JP'); }
  function num(n) { return (n || 0).toLocaleString('ja-JP'); }
  function days(iso) { if (!iso) return null; return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5); }
  function r10(n) { return Math.max(0, Math.round(n / 10) * 10); }
  async function api(u, o) {
    var r = await fetch(u, Object.assign({ credentials: 'include' }, o || {}));
    var t = await r.text(), j = null; try { j = JSON.parse(t); } catch (e) { }
    if (!r.ok) throw new Error((j && (j.error || j.message)) || ('通信エラー ' + r.status));
    return j;
  }
  function modal(html) {
    var d = document.createElement('div'); d.className = 'md'; d.innerHTML = '<div class="mbox">' + html + '</div>';
    R.querySelector('.win').appendChild(d);
    d.addEventListener('click', function (e) { if (e.target === d) d.remove(); });
    return d;
  }

  /* ---------- 読み込み ---------- */
  async function storeProducts(sid) {
    var all = [];
    for (var skip = 0; ; skip += 500) {
      var j = await api('/api/store/' + sid + '/product?is_active=true&is_consignment_product=false&stock_number_gte=1&take=500&skip=' + skip);
      all = all.concat(j.products || []);
      if (!j.products || j.products.length < 500) break;
    }
    return all;
  }
  function kindOf(p) {
    var h = p.item_category_handle || '', cd = p.item_category_display_name || '';
    var spec = (p.specialty__display_name || '') + ' ' + (p.specialty__handle || '') + ' ' + (p.condition_option_display_name || '');
    if (/【@\s*\d+】/.test(p.display_name || '')) return null;
    if (h === 'CARD') return /PSA/i.test(spec + ' ' + p.display_name) ? 'psa' : 'card';
    if (h === 'BOX') {
      /* マイカでBOXに登録されているパックを分ける：1個あたりの原価で判定（3,000円未満＝パック・スターター等）。原価がない時は相場、それもなければ名前 */
      var nm = String(p.display_name || ''), bx = /BOX|ボックス|box/i.test(nm), cost = Number(p.average_wholesale_price) || 0, mk = Number(p.item_market_price) || 0;
      if (/パック/.test(nm) && !bx) return 'pack';
      if (cost > 0) return cost < 3000 ? 'pack' : 'box';
      if (mk > 0) return mk < 3000 ? 'pack' : 'box';
      return bx ? 'box' : 'pack';
    }
    if (h === 'PACK' || /パック/.test(cd)) return 'pack';
    if (h === 'STORAGE' || /ストレージ/.test(cd)) return 'storage';
    return null;
  }
  async function load() {
    $('#body').innerHTML = '<div class="msg">全店舗の在庫を読み込み中…</div>';
    try {
      var st = await api('/api/store/all');
      S.stores = (st.stores || []).slice().sort(function (a, b) {
        var ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      }).map(function (s) { return { id: s.id, name: SHORT[s.id] || String(s.display_name).replace('ナタデココ', '').replace(/本?店$/, '') }; });
      if (!S.f.useStores) { S.f.useStores = {}; S.stores.forEach(function (s) { S.f.useStores[s.id] = 1; }); }
      var done = 0;
      var res = await Promise.all(S.stores.map(function (s) {
        return storeProducts(s.id).then(function (x) { done++; $('#body').innerHTML = '<div class="msg">全店舗の在庫を読み込み中…（' + done + '/' + S.stores.length + '店）</div>'; return x; })
          .catch(function () { return null; });
      }));
      S.failed = [];
      var map = {};
      res.forEach(function (list, i) {
        var s = S.stores[i];
        if (!list) { S.failed.push(s.name); return; }
        list.forEach(function (p) {
          var k = kindOf(p); if (!k) return;
          var key = p.item_myca_item_id ? 'm' + p.item_myca_item_id + '|' + (k === 'psa' ? 'card' : k) : 'n' + p.display_name + '|' + (p.item_cardnumber || '') + '|' + k;
          var row = map[key];
          if (!row) {
            row = map[key] = {
              key: key, myca: p.item_myca_item_id || null, name: p.item_name || p.display_name, disp: p.displayNameWithMeta || p.display_name,
              num: p.item_cardnumber || '', rarity: p.item_rarity || '', exp: p.item_expansion || '', img: p.image_url || '',
              kind: k, st: {}, total: 0, cost: 0, market: 0, sell: 0, lastSell: null, lastBuy: null
            };
          }
          if (k === 'psa') row.kind = 'psa';
          var c = row.st[s.id];
          if (!c) c = row.st[s.id] = { stock: 0, item: p.item_id, buy: Number(p.item_buy_price) || 0, sell: Number(p.item_sell_price) || 0, conds: {} };
          var n = Number(p.stock_number) || 0;
          c.stock += n; row.total += n;
          var cn = p.condition_option_display_name || (k === 'box' ? '' : '-');
          c.conds[cn] = (c.conds[cn] || 0) + n;
          row.cost += (Number(p.average_wholesale_price) || 0) * n;
          row.market = Math.max(row.market, Number(p.item_market_price) || 0);
          row.sell = Math.max(row.sell, Number(p.actual_sell_price) || Number(p.item_sell_price) || 0);
          if (p.last_transaction_sell_at && (!row.lastSell || p.last_transaction_sell_at > row.lastSell)) row.lastSell = p.last_transaction_sell_at;
          if (p.last_transaction_buy_at && (!row.lastBuy || p.last_transaction_buy_at > row.lastBuy)) row.lastBuy = p.last_transaction_buy_at;
          if (!row.img && p.image_url) row.img = p.image_url;
        });
      });
      S.rows = Object.keys(map).map(function (k) { return map[k]; });
      S.sel = {};
      $('#upd').textContent = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + ' 時点';
      bar(); render();
    } catch (e) {
      $('#body').innerHTML = '<div class="msg err">マイカの読み込みに失敗しました：' + esc(e.message) + '<br>マイカにログインした状態で、もう一度押してください。</div>';
    }
  }

  /* ---------- 絞り込み ---------- */
  function bar() {
    var f = S.f;
    $('#bar').innerHTML =
      '<div class="grp"><span>種類</span>' + Object.keys(KIND).map(function (k) {
        return '<label><input type="checkbox" data-k="' + k + '"' + (f.kinds[k] ? ' checked' : '') + '>' + KIND[k] + '</label>';
      }).join('') + '</div>' +
      '<div class="grp"><span>全店在庫</span><input type="number" id="min" min="1" value="' + f.min + '">個以上</div>' +
      '<div class="grp"><span>並び</span><select id="sort">' +
      [['total', '在庫数が多い順'], ['cost', '在庫金額が多い順'], ['skew', '偏りが大きい順'], ['stale', '売れていない順'], ['buy', '買取価格が高い順']].map(function (o) {
        return '<option value="' + o[0] + '"' + (f.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>' +
      '<label><input type="checkbox" id="skw"' + (f.onlySkew ? ' checked' : '') + '>偏りがあるものだけ</label>' +
      '<input type="search" id="q" placeholder="商品名・型番で検索" value="' + esc(f.q) + '">' +
      '<div class="grp"><span>店舗</span>' + S.stores.map(function (s) {
        return '<label><input type="checkbox" data-s="' + s.id + '"' + (f.useStores[s.id] ? ' checked' : '') + '>' + esc(s.name) + '</label>';
      }).join('') + '</div>';
    R.querySelectorAll('[data-k]').forEach(function (el) { el.onchange = function () { f.kinds[el.dataset.k] = el.checked ? 1 : 0; f.limit = 200; render(); }; });
    R.querySelectorAll('[data-s]').forEach(function (el) { el.onchange = function () { f.useStores[el.dataset.s] = el.checked ? 1 : 0; f.limit = 200; render(); }; });
    $('#min').oninput = function () { f.min = Math.max(1, Number(this.value) || 1); f.limit = 200; render(); };
    $('#sort').onchange = function () { f.sort = this.value; render(); };
    $('#skw').onchange = function () { f.onlySkew = this.checked; f.limit = 200; render(); };
    $('#q').oninput = function () { f.q = this.value; f.limit = 200; render(); };
  }
  function activeStores() { return S.stores.filter(function (s) { return S.f.useStores[s.id]; }); }
  function calc(row, sts) {
    var t = 0, mx = 0, mxs = null, zero = 0, cost = 0;
    sts.forEach(function (s) { var c = row.st[s.id]; var n = c ? c.stock : 0; t += n; if (n > mx) { mx = n; mxs = s; } if (!n && s.id !== 390) zero++; });
    cost = row.total ? row.cost * t / row.total : 0;
    var buys = sts.map(function (s) { return row.st[s.id] && row.st[s.id].buy; }).filter(function (v) { return v > 0; });
    var share = t ? mx / t : 0;
    /* 偏り：1店に5割以上集中し、在庫ゼロの店がある */
    var skew = t >= 3 && share >= 0.5 && zero > 0;
    return { t: t, mx: mx, mxs: mxs, zero: zero, share: share, skew: skew, cost: cost, buyMin: buys.length ? Math.min.apply(null, buys) : 0, buyMax: buys.length ? Math.max.apply(null, buys) : 0 };
  }
  function filtered() {
    var f = S.f, sts = activeStores(), q = f.q.trim().normalize('NFKC').toLowerCase();
    var list = [];
    S.rows.forEach(function (r) {
      if (!f.kinds[r.kind]) return;
      var c = calc(r, sts);
      if (c.t < f.min) return;
      if (f.onlySkew && !c.skew) return;
      if (q && (r.disp + ' ' + r.num + ' ' + r.exp).normalize('NFKC').toLowerCase().indexOf(q) < 0) return;
      r.c = c; list.push(r);
    });
    var key = {
      total: function (r) { return r.c.t; }, cost: function (r) { return r.c.cost; },
      skew: function (r) { return (r.c.skew ? 1e9 : 0) + r.c.share * r.c.t * 100; },
      stale: function (r) { var d = days(r.lastSell); return (d == null ? 99999 : d) * 1e4 + r.c.t; },
      buy: function (r) { return r.c.buyMax; }
    }[f.sort];
    list.sort(function (a, b) { return key(b) - key(a); });
    return list;
  }

  /* ---------- 表示 ---------- */
  function render() {
    var sts = activeStores(), list = filtered(), f = S.f;
    var tStock = 0, tCost = 0, tSkew = 0;
    list.forEach(function (r) { tStock += r.c.t; tCost += r.c.cost; if (r.c.skew) tSkew++; });
    $('#sum').innerHTML =
      '<div>該当商品<b>' + num(list.length) + '</b>件</div><div>在庫数<b>' + num(tStock) + '</b></div>' +
      '<div>在庫金額（原価）<b>' + yen(tCost) + '</b></div><div>偏りあり<b>' + num(tSkew) + '</b>件</div>' +
      (S.failed.length ? '<div class="err">読み込めなかった店舗：' + esc(S.failed.join('・')) + '</div>' : '');
    if (!list.length) { $('#body').innerHTML = '<div class="msg">条件に合う商品がありません。「全店在庫」の数を下げてみてください</div>'; selbar(); return; }
    var shown = list.slice(0, f.limit);
    var h = '<table><thead><tr><th class="l"><input type="checkbox" id="all"></th><th class="l" colspan="2">商品</th><th>全店</th>' +
      sts.map(function (s) { return '<th class="st">' + esc(s.name) + '</th>'; }).join('') +
      '<th>在庫金額</th><th>販売価格</th><th>相場</th><th>買取価格</th><th>最終販売</th><th>最終買取</th><th></th></tr></thead><tbody>';
    shown.forEach(function (r) {
      var c = r.c, ds = days(r.lastSell), db = days(r.lastBuy);
      h += '<tr data-key="' + esc(r.key) + '"><td class="l"><input type="checkbox" data-sel="' + esc(r.key) + '"' + (S.sel[r.key] ? ' checked' : '') + '></td>' +
        '<td class="l">' + (r.img ? '<img class="th" loading="lazy" src="' + esc(r.img) + '">' : '') + '</td>' +
        '<td class="nm"><div class="n">' + esc(r.name) + '</div><div class="m"><span class="tag ' + r.kind + '">' + KIND[r.kind] + '</span>' +
        esc([r.num, r.rarity, r.exp].filter(Boolean).join(' / ')) + '</div>' +
        (c.skew ? '<div class="skew">' + esc(c.mxs.name) + 'に' + Math.round(c.share * 100) + '%集中・在庫0が' + c.zero + '店</div>' : '') + '</td>' +
        '<td><b>' + num(c.t) + '</b></td>' +
        sts.map(function (s) {
          var x = r.st[s.id], n = x ? x.stock : 0;
          if (!n) return '<td class="st"><span class="z">0</span></td>';
          var a = c.mx ? n / c.mx : 0;
          var tip = Object.keys(x.conds).filter(function (k) { return k && k !== '-'; }).map(function (k) { return k + ' ' + x.conds[k]; }).join(' / ');
          return '<td class="st"><span title="' + esc(tip) + '" style="background:rgba(200,16,46,' + (0.08 + a * 0.55).toFixed(2) + ');' + (a > 0.6 ? 'color:#fff;font-weight:700' : '') + '">' + n + '</span></td>';
        }).join('') +
        '<td>' + yen(c.cost) + '</td><td>' + (r.sell ? yen(r.sell) : '-') + '</td><td>' + (r.market ? yen(r.market) : '-') + '</td>' +
        '<td class="bp' + (c.buyMin !== c.buyMax ? ' diff' : '') + '" title="' + (c.buyMin !== c.buyMax ? '店舗で買取価格が違います' : '') + '">' +
        (c.buyMax ? (c.buyMin !== c.buyMax ? yen(c.buyMin) + '〜' + yen(c.buyMax) : yen(c.buyMax)) : '-') + '</td>' +
        '<td class="' + (ds == null || ds >= 30 ? 'old' : '') + '">' + (ds == null ? '記録なし' : ds + '日前') + '</td>' +
        '<td>' + (db == null ? '-' : db + '日前') + '</td>' +
        '<td><button class="b" data-edit="' + esc(r.key) + '">買取価格</button></td></tr>';
    });
    h += '</tbody></table>';
    if (list.length > shown.length) h += '<div class="more"><button class="b g" id="more">さらに表示（残り' + num(list.length - shown.length) + '件）</button></div>';
    $('#body').innerHTML = h;
    var byKey = {}; S.rows.forEach(function (r) { byKey[r.key] = r; });
    R.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { editOne(byKey[b.dataset.edit]); }; });
    R.querySelectorAll('[data-sel]').forEach(function (b) { b.onchange = function () { if (b.checked) S.sel[b.dataset.sel] = 1; else delete S.sel[b.dataset.sel]; selbar(); }; });
    $('#all').onchange = function () { var on = this.checked; shown.forEach(function (r) { if (on) S.sel[r.key] = 1; else delete S.sel[r.key]; }); render(); };
    if ($('#more')) $('#more').onclick = function () { f.limit += 300; render(); };
    selbar();
  }

  function selbar() {
    var keys = Object.keys(S.sel), el = $('#selbar');
    if (!keys.length) { el.className = 'selbar'; el.innerHTML = ''; return; }
    el.className = 'selbar on';
    el.innerHTML = '<b>' + keys.length + '件を選択中</b>　買取価格を ' +
      '<select id="bm"><option value="down">今の価格から</option><option value="set">すべて</option></select> ' +
      '<input type="number" id="bv" value="10" min="0"> <span id="bu">%下げる</span> ' +
      '<button class="b r" id="bgo">内容を確認</button> <button class="b g" id="bclr">選択を外す</button>';
    $('#bm').onchange = function () { $('#bu').textContent = this.value === 'down' ? '%下げる' : '円にする'; $('#bv').value = this.value === 'down' ? 10 : ''; };
    $('#bclr').onclick = function () { S.sel = {}; render(); };
    $('#bgo').onclick = function () {
      var v = Number($('#bv').value); if (!(v >= 0)) return;
      var mode = $('#bm').value;
      var rows = S.rows.filter(function (r) { return S.sel[r.key]; });
      bulk(rows, mode, v);
    };
  }

  /* ---------- 買取価格の変更 ---------- */
  /* 在庫がない店舗の商品マスタは、商品名で検索して同じマイカ商品IDのものを探す */
  async function findItem(row, sid) {
    var x = row.st[sid]; if (x && x.item) return { id: x.item, buy: x.buy };
    var j = await api('/api/store/' + sid + '/item?take=100&display_name=' + encodeURIComponent(row.name));
    var it = (j.items || []).find(function (i) { return row.myca ? i.myca_item_id === row.myca : (i.display_name === row.name && String(i.cardnumber || '') === String(row.num || '')); });
    return it ? { id: it.id, buy: Number(it.buy_price) || 0 } : null;
  }
  async function plan(rows, calcNew, onProgress) {
    var sts = activeStores().filter(function (s) { return s.id !== 390 || true; });
    var out = [], n = 0, tot = rows.length * sts.length;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      await Promise.all(sts.map(function (s) {
        return findItem(r, s.id).then(function (it) {
          n++; onProgress && onProgress(n, tot);
          if (!it) { out.push({ r: r, s: s, none: 1 }); return; }
          var nv = calcNew(it.buy, r);
          out.push({ r: r, s: s, id: it.id, cur: it.buy, nv: nv });
        }).catch(function (e) { n++; out.push({ r: r, s: s, err: e.message }); });
      }));
    }
    out.sort(function (a, b) { return rows.indexOf(a.r) - rows.indexOf(b.r) || ORDER.indexOf(a.s.id) - ORDER.indexOf(b.s.id); });
    return out;
  }
  function editOne(row) {
    var c = calc(row, activeStores());
    var d = modal('<div class="mh">買取価格を変更：' + esc(row.name) + '</div>' +
      '<div class="sm">' + esc([row.num, row.rarity, row.exp].filter(Boolean).join(' / ')) + '　全店在庫 ' + num(c.t) + '　販売 ' + (row.sell ? yen(row.sell) : '-') + '　相場 ' + (row.market ? yen(row.market) : '-') + '</div>' +
      '<div class="frm">新しい買取価格 <input type="number" id="nv" min="0" step="10" value="' + (c.buyMax || '') + '"> 円　' +
      '<button class="b g" data-p="-10">−10%</button><button class="b g" data-p="-20">−20%</button><button class="b g" data-p="-30">−30%</button></div>' +
      '<div id="pv"><div class="sm">店舗ごとの今の買取価格を確認中…</div></div>' +
      '<div class="warn">商品マスタの買取価格（状態Aの基準）を変えます。状態別の買取価格は、マイカの設定どおり自動で計算されます。</div>' +
      '<div class="acts"><button class="b g" data-x>やめる</button><button class="b r" id="go" disabled>チェックした店舗を変更する</button></div>');
    d.querySelector('[data-x]').onclick = function () { d.remove(); };
    var items = null;
    plan([row], function (cur) { return cur; }).then(function (p) {
      items = p;
      draw();
    });
    function draw() {
      var nv = Number(d.querySelector('#nv').value);
      d.querySelector('#pv').innerHTML = '<table><thead><tr><th class="l"></th><th class="l">店舗</th><th>在庫</th><th>今の買取価格</th><th>変更後</th></tr></thead><tbody>' +
        items.map(function (x, i) {
          var st = row.st[x.s.id];
          if (x.none) return '<tr><td></td><td class="l">' + esc(x.s.name) + '</td><td>0</td><td colspan="2" class="sm">この店舗には商品マスタがありません</td></tr>';
          if (x.err) return '<tr><td></td><td class="l">' + esc(x.s.name) + '</td><td></td><td colspan="2" class="ng">確認できませんでした</td></tr>';
          return '<tr><td class="l"><input type="checkbox" data-i="' + i + '" checked></td><td class="l">' + esc(x.s.name) + '</td><td>' + (st ? st.stock : 0) + '</td><td>' + yen(x.cur) + '</td><td><b>' + (nv >= 0 && d.querySelector('#nv').value !== '' ? yen(nv) : '-') + '</b></td></tr>';
        }).join('') + '</tbody></table>';
      d.querySelector('#go').disabled = !(d.querySelector('#nv').value !== '' && nv >= 0);
    }
    d.querySelector('#nv').oninput = function () { items && draw(); };
    d.querySelectorAll('[data-p]').forEach(function (b) {
      b.onclick = function () { var base = c.buyMax || 0; d.querySelector('#nv').value = r10(base * (1 + Number(b.dataset.p) / 100)); items && draw(); };
    });
    d.querySelector('#go').onclick = function () {
      var nv = r10(Number(d.querySelector('#nv').value));
      var pick = [].slice.call(d.querySelectorAll('[data-i]:checked')).map(function (el) { var x = items[Number(el.dataset.i)]; x.nv = nv; return x; });
      if (!pick.length) return;
      run(pick, d);
    };
  }
  function bulk(rows, mode, v) {
    var d = modal('<div class="mh">' + rows.length + '件の買取価格をまとめて変更</div><div id="pv"><div class="sm">店舗ごとの今の買取価格を確認中…</div></div>' +
      '<div class="warn">' + (mode === 'down' ? '各店舗の今の買取価格から' + v + '%下げ、10円単位に丸めます。' : 'すべての店舗を' + yen(v) + 'にします。') + '買取価格が0円のものは変更しません。</div>' +
      '<div class="acts"><button class="b g" data-x>やめる</button><button class="b r" id="go" disabled>変更する</button></div>');
    d.querySelector('[data-x]').onclick = function () { d.remove(); };
    var calcNew = mode === 'down' ? function (cur) { return r10(cur * (1 - v / 100)); } : function () { return r10(v); };
    plan(rows, calcNew, function (n, t) { var el = d.querySelector('#pv .sm'); if (el) el.textContent = '店舗ごとの今の買取価格を確認中…（' + n + '/' + t + '）'; }).then(function (items) {
      var todo = items.filter(function (x) { return x.id && x.cur > 0 && x.nv !== x.cur; });
      d.querySelector('#pv').innerHTML = '<div class="sm">変更するのは ' + todo.length + ' 件（商品×店舗）です。</div>' +
        '<table><thead><tr><th class="l">商品</th><th class="l">店舗</th><th>今</th><th>変更後</th></tr></thead><tbody>' +
        todo.map(function (x) { return '<tr><td class="l">' + esc(x.r.name) + ' <span class="sm">' + esc(x.r.num) + '</span></td><td class="l">' + esc(x.s.name) + '</td><td>' + yen(x.cur) + '</td><td><b>' + yen(x.nv) + '</b></td></tr>'; }).join('') +
        '</tbody></table>';
      var go = d.querySelector('#go'); go.disabled = !todo.length;
      go.onclick = function () { run(todo, d); };
    });
  }
  async function run(list, d) {
    var go = d.querySelector('#go'); go.disabled = true; go.textContent = '変更中…';
    var ok = 0, ng = [];
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      try {
        await api('/api/store/' + x.s.id + '/item/' + x.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buy_price: x.nv }) });
        ok++;
        var st = x.r.st[x.s.id]; if (st) st.buy = x.nv;
      } catch (e) { ng.push(x.r.name + '（' + x.s.name + '）：' + e.message); }
      go.textContent = '変更中…（' + (i + 1) + '/' + list.length + '）';
    }
    d.querySelector('.mbox').innerHTML = '<div class="mh">' + (ng.length ? '一部変更できませんでした' : '買取価格を変更しました') + '</div>' +
      '<div class="ok">' + ok + '件 変更しました</div>' +
      (ng.length ? '<div class="ng" style="margin-top:6px">' + ng.map(esc).join('<br>') + '</div>' : '') +
      '<div class="sm" style="margin-top:8px">買取表・SNSの告知に使っている価格表がある場合は、そちらも合わせて確認してください。</div>' +
      '<div class="acts"><button class="b" data-x>OK</button></div>';
    d.querySelector('[data-x]').onclick = function () { d.remove(); S.sel = {}; render(); };
  }

  /* ---------- CSV ---------- */
  function csv() {
    var sts = activeStores(), list = filtered();
    var head = ['商品名', '型番', 'レアリティ', '弾', '種類', '全店在庫'].concat(sts.map(function (s) { return s.name; }))
      .concat(['在庫金額', '販売価格', '相場', '買取価格(最小)', '買取価格(最大)', '偏り', '最終販売(日前)', '最終買取(日前)']);
    var lines = [head].concat(list.map(function (r) {
      var c = r.c;
      return [r.name, r.num, r.rarity, r.exp, KIND[r.kind], c.t].concat(sts.map(function (s) { return r.st[s.id] ? r.st[s.id].stock : 0; }))
        .concat([Math.round(c.cost), r.sell, r.market, c.buyMin, c.buyMax, c.skew ? c.mxs.name + 'に' + Math.round(c.share * 100) + '%' : '', days(r.lastSell) == null ? '' : days(r.lastSell), days(r.lastBuy) == null ? '' : days(r.lastBuy)]);
    }));
    var t = lines.map(function (l) { return l.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + t], { type: 'text/csv' }));
    a.download = '全店舗在庫確認_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  load();
})();
