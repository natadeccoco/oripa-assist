/* ナタデココ eBayおすすめ在庫（マイカ上で動くブックマークレット本体）
 * マイカの最新在庫をeBay相場と比べて、eBayに出すと得なカードを順番に出す */
(function () {
  'use strict';
  if (location.hostname !== 'pos.mycalinks.com') { alert('マイカ（pos.mycalinks.com）を開いてから押してください'); return; }
  var old = document.getElementById('ndk-ebay-host'); if (old) old.remove();

  var SHORT = { 322: '柏', 323: '津田沼', 324: '松戸', 325: '横浜', 326: '中野', 327: '町田', 328: '千葉中央', 409: 'お台場' };
  var ORDER = [409, 322, 323, 324, 325, 326, 327, 328];
  var EBAY_URL = 'https://script.google.com/macros/s/AKfycbwRTgFmVWAZdwpHO0E9GTF8rebmNEZ8yfrdF2Hi0pDWE5NYXPW3UwyfU49SevycPcIJ/exec';
  var FB_URL = 'https://script.google.com/macros/s/AKfycbwl-ZCZ1LyefvSzEGkBEpTFTuFyvW0p-AYye6jBWaLP9t7-bC9_Owfeh4jKScNkFys6Fw/exec';
  var MIN_YEN = 5000;

  var S = { sid: 409, items: [], res: {}, left: 0, f: { show: 'good', q: '' }, run: 0 };

  var host = document.createElement('div'); host.id = 'ndk-ebay-host';
  host.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000');
  document.body.appendChild(host);
  var R = host.attachShadow({ mode: 'open' });
  R.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box}' +
    '.bg{position:fixed;inset:0;background:rgba(20,20,25,.45);display:flex;justify-content:center;padding:14px;font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;color:#1d1d22;font-size:13px}' +
    '.win{background:#f6f5f2;border-radius:14px;width:100%;max-width:1180px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.35)}' +
    '.hd{background:#1d1d22;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
    '.hd h1{font-size:16px;margin:0;font-weight:800}.hd h1 b{color:#e8c23a}.sp{flex:1}' +
    '.hd button{all:unset;cursor:pointer;color:#fff;font-weight:700;padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.12)}' +
    '.hd .fb{background:#2563eb;border-radius:999px;padding:6px 12px;font-size:12px}' +
    '.hd select{padding:4px 6px;border-radius:7px;border:0;font:inherit}' +
    '.how{padding:9px 16px;background:#fdf6dc;color:#6b5000;font-size:12.5px;line-height:1.6}' +
    '.bar{padding:9px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;border-bottom:1px solid #e5e2da;background:#fff}' +
    '.bar label{display:inline-flex;gap:4px;align-items:center;cursor:pointer}' +
    '.bar input[type=search]{width:220px;padding:5px 8px;border:1.5px solid #d6d2c8;border-radius:7px;font:inherit}' +
    '.prog{color:#555}.prog b{color:#c8102e}' +
    '.body{flex:1;overflow:auto}' +
    'table{border-collapse:separate;border-spacing:0;width:100%;font-size:12.5px}' +
    'th{position:sticky;top:0;background:#efede7;z-index:2;padding:6px 8px;text-align:right;white-space:nowrap;border-bottom:1px solid #d6d2c8}' +
    'td{padding:6px 8px;border-bottom:1px solid #eceae4;text-align:right;white-space:nowrap;background:#fff}' +
    'th.l,td.l{text-align:left}td.nm{white-space:normal;min-width:240px}td.nm .n{font-weight:700}td.nm .m{color:#888;font-size:11.5px}' +
    'img.th{width:38px;height:52px;object-fit:contain;border-radius:3px;background:#f2f0ea;display:block}' +
    '.j{display:inline-block;padding:1px 8px;border-radius:999px;font-weight:700;font-size:11.5px}' +
    '.j.a{background:#e8f6ea;color:#15803d}.j.b{background:#e3ecff;color:#1d4ed8}.j.c{background:#fff1d6;color:#a16207}.j.d{background:#eee;color:#666}' +
    '.st{color:#c8102e;font-weight:700;font-size:11.5px}.pl{color:#15803d;font-weight:700}.mi{color:#c8102e}' +
    '.msg{padding:40px;text-align:center;color:#666;font-size:14px}.err{color:#c8102e}' +
    '</style>' +
    '<div class="bg"><div class="win">' +
    '<div class="hd"><h1>eBay<b>おすすめ在庫</b></h1><select id="store"></select><span class="sp"></span>' +
    '<button class="fb" id="fb">意見を送る</button><button id="rl">再読み込み</button><button id="x">閉じる ✕</button></div>' +
    '<div class="how">上から順にカードを取り出し、LINE WORKSの「ナタデココ本部Bot」へ<b>値札の写真 → カードだけの写真（値札を写さない）</b>の順に送ると、そのままeBayに出品されます。</div>' +
    '<div class="bar" id="bar"></div>' +
    '<div class="body" id="body"><div class="msg">読み込み中…</div></div>' +
    '</div></div>';
  var $ = function (q) { return R.querySelector(q); };
  $('#x').onclick = function () { S.run++; host.remove(); };
  $('#rl').onclick = function () { load(); };
  $('#fb').onclick = function () { window.open(FB_URL + '?tool=' + encodeURIComponent('eBayおすすめ在庫') + '&store=' + encodeURIComponent(SHORT[S.sid] || ''), '_blank'); };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function yen(n) { return '¥' + Math.round(n || 0).toLocaleString('ja-JP'); }
  function signed(n) { return (n >= 0 ? '+' : '−') + yen(Math.abs(n)); }
  async function api(u) {
    var r = await fetch(u, { credentials: 'include' });
    var t = await r.text(), j = null; try { j = JSON.parse(t); } catch (e) { }
    if (!r.ok) throw new Error((j && (j.error || j.message)) || ('通信エラー ' + r.status));
    return j;
  }

  function categoryOf(p) {
    var h = p.item_category_handle || '', nm = String(p.display_name || '');
    if (/【@\s*\d+】/.test(nm)) return '';
    if (h === 'CARD') return 'カード';
    if (h === 'BOX') {
      var cost = Number(p.average_wholesale_price) || 0, mk = Number(p.item_market_price) || 0, bx = /BOX|ボックス/i.test(nm);
      if (/パック/.test(nm) && !bx) return '';
      if (cost > 0) return cost < 3000 ? '' : 'ボックス';
      if (mk > 0) return mk < 3000 ? '' : 'ボックス';
      return bx ? 'ボックス' : '';
    }
    return '';
  }
  async function products(sid) {
    var all = [];
    for (var skip = 0; ; skip += 500) {
      var j = await api('/api/store/' + sid + '/product?is_active=true&is_consignment_product=false&stock_number_gte=1&take=500&skip=' + skip);
      all = all.concat(j.products || []);
      if (!j.products || j.products.length < 500) break;
    }
    return all;
  }

  async function load() {
    var run = ++S.run;
    S.items = []; S.res = {}; S.left = 0;
    $('#body').innerHTML = '<div class="msg">' + esc(SHORT[S.sid]) + '店の在庫を読み込み中…</div>';
    drawBar('');
    try {
      var list = await products(S.sid);
      if (run !== S.run) return;
      S.items = list.map(function (p) {
        var cat = categoryOf(p), price = Number(p.actual_sell_price) || Number(p.item_sell_price) || 0;
        return { id: String(p.id), name: p.item_name || p.display_name || '', disp: p.displayNameWithMeta || p.display_name || '', cardnumber: p.item_cardnumber || '',
          rarity: p.item_rarity || '', expansion: p.item_expansion || '', condition: p.condition_option_display_name || '', specialty: p.specialty__display_name || '',
          category: cat, stock: Number(p.stock_number) || 0, price: price, cost: Number(p.average_wholesale_price) || 0, img: p.image_url || '' };
      }).filter(function (x) { return x.category && x.price >= MIN_YEN; });
      if (!S.items.length) { $('#body').innerHTML = '<div class="msg">店頭価格' + yen(MIN_YEN) + '以上のカード・BOXがありません。</div>'; return; }
      await judge(run);
    } catch (e) {
      if (run === S.run) $('#body').innerHTML = '<div class="msg err">読み込めませんでした：' + esc(e.message) + '</div>';
    }
  }

  async function judge(run) {
    var send = S.items.map(function (x) { return { id: x.id, name: x.name, cardnumber: x.cardnumber, rarity: x.rarity, expansion: x.expansion, condition: x.condition, specialty: x.specialty, category: x.category, stock: x.stock, price: x.price, cost: x.cost }; });
    for (var i = 0; i < 40; i++) {
      var r = await fetch(EBAY_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'picks', store: SHORT[S.sid] + '店', items: send }) });
      var j = JSON.parse(await r.text());
      if (run !== S.run) return;
      if (!j.ok) throw new Error(j.error || '判定できませんでした');
      (j.rows || []).forEach(function (x) { S.res[x.id] = x; });
      S.left = j.left || 0;
      draw(j.limited ? '今日の調査上限に達しました。続きは明日調べます' : '');
      if (!S.left || j.limited) return;
    }
  }

  function rank(x) { var c = String(x.judge || '').charAt(0); var o = ['◎', '○', '⚠', '－', '×'].indexOf(c); return o < 0 ? (x.wait ? 8 : 7) : o; }
  function cls(j) { var c = String(j || '').charAt(0); return c === '◎' ? 'a' : c === '○' ? 'b' : c === '⚠' ? 'c' : 'd'; }

  function drawBar(note) {
    var done = S.items.filter(function (x) { return S.res[x.id] && !S.res[x.id].wait; }).length;
    $('#bar').innerHTML =
      '<label><input type="radio" name="sh" value="good"' + (S.f.show === 'good' ? ' checked' : '') + '>◎○だけ</label>' +
      '<label><input type="radio" name="sh" value="best"' + (S.f.show === 'best' ? ' checked' : '') + '>◎だけ</label>' +
      '<label><input type="radio" name="sh" value="all"' + (S.f.show === 'all' ? ' checked' : '') + '>優先度低（高めに出品）も出す</label>' +
      '<input type="search" id="q" placeholder="カード名・型番で探す" value="' + esc(S.f.q) + '">' +
      '<span class="prog">' + (S.items.length ? (S.left ? 'eBay相場を調べ中… <b>' + done + '</b> / ' + S.items.length + '件' : '調査済み ' + done + '件') : '') + (note ? '　' + esc(note) : '') + '</span>';
    R.querySelectorAll('input[name=sh]').forEach(function (el) { el.onchange = function () { S.f.show = this.value; draw(''); }; });
    var q = $('#q'); q.oninput = function () { S.f.q = this.value; drawBody(); };
  }

  function drawBody() {
    var q = S.f.q.trim().toLowerCase();
    var rows = S.items.map(function (x) { return { it: x, r: S.res[x.id] || { wait: true } }; }).filter(function (o) {
      var c = String(o.r.judge || '').charAt(0);
      if (S.f.show === 'good' && c !== '◎' && c !== '○') return false;
      if (S.f.show === 'best' && c !== '◎') return false;
      if (q && (o.it.disp + ' ' + o.it.cardnumber).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var la = a.r.listed ? 1 : 0, lb = b.r.listed ? 1 : 0;
      return la - lb || rank(a.r) - rank(b.r) || (Number(b.r.diff) || -1e12) - (Number(a.r.diff) || -1e12) || b.it.price - a.it.price;
    });
    if (!rows.length) { $('#body').innerHTML = '<div class="msg">' + (S.left ? '調査が進むと、ここに表示されます。' : '該当するカードがありません。') + '</div>'; return; }
    var h = '<table><tr><th class="l"></th><th class="l">カード</th><th class="l">状態</th><th>在庫</th><th>店頭</th><th>eBay価格</th><th>eBay利益</th><th>店頭より</th><th class="l">判定</th></tr>';
    rows.slice(0, 300).forEach(function (o) {
      var x = o.it, r = o.r, d = r.diff;
      h += '<tr><td class="l">' + (x.img ? '<img class="th" loading="lazy" src="' + esc(x.img) + '">' : '') + '</td>' +
        '<td class="l nm"><div class="n">' + esc(x.name) + '</div><div class="m">' + esc([x.cardnumber, x.rarity, x.expansion].filter(Boolean).join(' / ')) + '</div>' + (r.listed ? '<div class="st">' + esc(r.listed) + '</div>' : '') + '</td>' +
        '<td class="l">' + esc([x.condition, x.specialty].filter(Boolean).join(' ')) + '</td><td>' + x.stock + '</td><td>' + yen(x.price) + '</td>' +
        '<td>' + (r.usd ? '$' + r.usd : '') + '</td><td>' + (r.profit !== '' && r.profit != null ? yen(r.profit) : '') + '</td>' +
        '<td class="' + (d > 0 ? 'pl' : 'mi') + '">' + (d !== '' && d != null ? signed(d) : '') + '</td>' +
        '<td class="l">' + (r.wait ? '<span class="j d">調査待ち</span>' : '<span class="j ' + cls(r.judge) + '">' + esc(String(r.judge || '').charAt(0) === '×' ? '優先度低（高めに出品）' : r.judge) + '</span>') + '</td></tr>';
    });
    $('#body').innerHTML = h + '</table>';
  }
  function draw(note) { var q = $('#q'), f = q && R.activeElement === q; drawBar(note); drawBody(); if (f) { var n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }

  (async function init() {
    try {
      var all = await api('/api/store/all');
      var st = (all.stores || []).filter(function (s) { return SHORT[s.id]; }).sort(function (a, b) { return ORDER.indexOf(a.id) - ORDER.indexOf(b.id); });
      var m = location.pathname.match(/store\/(\d+)/);
      var saved = null; try { saved = Number(localStorage.getItem('ndk_ebay_store')); } catch (e) { }
      var ids = st.map(function (s) { return s.id; });
      S.sid = (m && ids.indexOf(Number(m[1])) >= 0) ? Number(m[1]) : (ids.indexOf(saved) >= 0 ? saved : (ids[0] || 409));
      $('#store').innerHTML = st.map(function (s) { return '<option value="' + s.id + '"' + (s.id === S.sid ? ' selected' : '') + '>' + esc(SHORT[s.id]) + '店</option>'; }).join('');
      $('#store').onchange = function () { S.sid = Number(this.value); try { localStorage.setItem('ndk_ebay_store', String(S.sid)); } catch (e) { } load(); };
    } catch (e) { $('#body').innerHTML = '<div class="msg err">マイカにログインしてから押してください：' + esc(e.message) + '</div>'; return; }
    load();
  })();
})();
