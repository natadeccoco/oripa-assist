/* ナタデココ 販売価格の承認（マイカ上で動くブックマークレット本体）
 * 5万円以上のPSA・シングル・BOXの販売価格を、LINE WORKSの店舗グループで役員に承認してもらう。
 * シングル・BOX：スタッフが価格を入力。
 * PSA10：スニダンの最安出品と直近の取引の高い方を自動入力。ただし粗利10%以上になるまで引き上げる。 */
(function () {
  'use strict';
  if (location.hostname !== 'pos.mycalinks.com') { alert('マイカ（pos.mycalinks.com）を開いてから押してください'); return; }
  var old = document.getElementById('ndk-hanbai-host'); if (old) old.remove();

  var VERSION = '2026-11-02 版A';
  var GAS = 'https://script.google.com/macros/s/AKfycbwXHuu-X3L0qzJhvaszEIm-1xdeNIqJACQ0uM7mz5Q0hvwfdF9IuQiTKr3qmscNVmnhcQ/exec';
  var FB_URL = 'https://script.google.com/macros/s/AKfycbwl-ZCZ1LyefvSzEGkBEpTFTuFyvW0p-AYye6jBWaLP9t7-bC9_Owfeh4jKScNkFys6Fw/exec';
  var SHORT = { 322: '柏', 323: '津田沼', 324: '松戸', 325: '横浜', 326: '中野', 327: '町田', 328: '千葉中央', 409: 'お台場' };
  var LINE = 50000, MIN_MARGIN = 0.1;

  var S = { sid: null, stores: [], results: [], cur: null, staff: '', list: [], pollT: null, searchT: null, sending: false, seq: 0 };
  try { S.staff = localStorage.getItem('ndk_hanbai_staff') || localStorage.getItem('ndk_kaitori_staff') || localStorage.getItem('ndk_loss_staff') || ''; } catch (e) { }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function yen(n) { return Math.round(Number(n) || 0).toLocaleString() + '円'; }
  async function api(path) {
    var r = await fetch(path, { credentials: 'include' });
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
  function hm(s) { if (!s) return ''; var d = new Date(s); if (isNaN(d)) return String(s); var x = new Date(d.getTime() + 9 * 3600e3); return (x.getUTCMonth() + 1) + '/' + x.getUTCDate() + ' ' + String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0'); }

  /* ---------- 価格のルール ---------- */
  function nowPrice(p) { return Number(p.actual_sell_price != null ? p.actual_sell_price : (p.specific_sell_price || p.sell_price)) || 0; }
  function kindOf(p) {
    var dn = String(p.displayNameWithMeta || p.display_name || ''), sp = String(p.specialty__display_name || '');
    var m = (sp + ' ' + (dn.match(/《([^》]*)》/) || [])[1]).match(/PSA\s*(\d+)/i);
    if (m) return { kind: 'PSA', grade: m[1] };
    if (p.item_category_display_name === 'ボックス' || /BOX|ボックス/i.test(dn)) return { kind: 'BOX' };
    return { kind: 'シングル' };
  }
  function floorPrice(cost) { return cost > 0 ? Math.ceil(cost * 10 / 9 / 100) * 100 : 0; } // 粗利10%を確保する最低価格（100円単位で切り上げ）
  function psaAuto(snk, cost) {
    var low = Number(snk && snk.min) || 0, last = Number(snk && snk.price) || 0, market = Math.max(low, last);
    if (!market) return null;
    var fl = floorPrice(cost);
    return { price: Math.max(market, fl), market: market, low: low, last: last, floor: fl, raised: fl > market };
  }
  function marginOf(price, cost) { return price > 0 && cost > 0 ? (price - cost) / price : null; }
  function pct(x) { return x == null ? '—' : Math.round(x * 1000) / 10 + '%'; }

  /* ---------- 画面 ---------- */
  var host = document.createElement('div'); host.id = 'ndk-hanbai-host';
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
    '.hd button{all:unset;cursor:pointer;color:#fff;font-weight:700;padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.14)}.hd button.fbb{background:#2563eb}' +
    '.body{flex:1;overflow:auto;padding:14px 16px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}' +
    '@media (max-width:860px){.body{grid-template-columns:1fr}}' +
    '#res{max-height:52vh;overflow:auto;margin-top:6px}.col{min-width:0}h2{font-size:15px;margin:2px 0 8px}' +
    '.box{background:#fff;border:1.5px solid #e5e2da;border-radius:12px;padding:12px 14px;margin-bottom:12px}' +
    'input.q,textarea.f,input.f{display:block;width:100%;padding:8px 10px;border:1.5px solid #d6d2c8;border-radius:8px;font:inherit;font-weight:400;background:#fff}' +
    'textarea.f{min-height:56px;resize:vertical}input.f.big{font-size:22px;font-weight:800;text-align:right}input.f[readonly]{background:#f2f0ea}' +
    '.lbl{display:block;font-weight:700;font-size:13px;margin:10px 0 3px}.lbl small{font-weight:400;color:#888}' +
    '.it{display:flex;gap:10px;align-items:center;padding:7px 0;border-top:1px solid #eceae4}.it:first-child{border-top:0}' +
    '.it img,.it .noimg{width:40px;height:56px;object-fit:contain;border-radius:4px;background:#f2f0ea;flex:none}' +
    '.it .g{flex:1;min-width:0}.it .n{font-weight:700;font-size:13px;word-break:break-all}.it .m{color:#777;font-size:12px}' +
    '.pill{display:inline-block;font-size:11px;font-weight:800;padding:0 7px;border-radius:999px;background:#1d1d22;color:#fff;margin-right:4px}.pill.psa{background:#2952a3}.pill.box{background:#7a5b00}' +
    'button.b{all:unset;cursor:pointer;font-weight:800;font-size:14px;padding:10px 18px;border-radius:10px;background:#1d1d22;color:#fff;text-align:center}' +
    'button.b.r{background:#c8102e}button.b.g{background:#fff;color:#1d1d22;border:1.5px solid #d6d2c8}button.b.s{font-size:12px;padding:5px 10px;border-radius:8px}' +
    'button.b[disabled]{opacity:.45;cursor:default}.it button.b{flex:none}' +
    '.kv{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin-top:8px;font-size:13px}.kv dt{color:#777}.kv dd{margin:0;font-weight:700}' +
    '.msg{padding:18px;text-align:center;color:#777}.err{color:#c8102e;font-weight:700}' +
    '.st{padding:10px 14px;border-radius:10px;font-weight:800;margin:10px 0}.st.wait{background:#fff4c2;color:#5c4300}.st.ok{background:#e3f4e6;color:#15803d}.st.ng{background:#fff0f2;color:#c8102e}' +
    '.code{display:inline-block;font:800 18px/1.2 ui-monospace,Consolas,monospace;background:#1d1d22;color:#e8c23a;padding:6px 12px;border-radius:8px;margin:6px 6px 0 0;letter-spacing:.03em}' +
    '.rq{border-top:1px solid #eceae4;padding:9px 0}.rq:first-child{border-top:0}.rq .h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rq .t{color:#555;font-size:12px;white-space:pre-wrap;margin-top:3px}' +
    '.tag{font-size:11.5px;font-weight:800;padding:1px 8px;border-radius:999px}.tag.wait{background:#fff4c2;color:#7a5b00}.tag.ok{background:#e3f4e6;color:#15803d}.tag.ng{background:#fff0f2;color:#c8102e}' +
    '.hint{font-size:12px;color:#7a5b00;background:#fdf6dc;border-radius:8px;padding:8px 10px;margin-top:8px}' +
    'a{color:#2563eb}' +
    '</style>' +
    '<div class="bg"><div class="win">' +
    '<div class="hd"><h1><b>販売価格</b>の承認</h1><span class="v">' + VERSION + '</span>' +
    '<label>店舗 <select id="store"></select></label>' +
    '<label>依頼者 <input id="staff" placeholder="名前（必須）" style="width:120px"></label>' +
    '<span class="sp"></span><button id="reload">更新</button><button id="fb" class="fbb">意見を送る</button><button id="close">閉じる ×</button></div>' +
    '<div class="body" id="body">' +
    '<div class="col"><div class="box"><h2>① カードを探す</h2><input class="q" id="q" placeholder="商品名で検索（例：リーリエの決心、BOX名）">' +
    '<div id="res"><div class="msg">商品名を2文字以上入れてください（この店の在庫から探します）</div></div></div></div>' +
    '<div class="col"><div class="box"><h2>② 販売価格を決める</h2><div id="panel"><div class="msg">左の検索からカードを「選ぶ」を押してください</div></div></div>' +
    '<div class="box"><h2>最近の依頼（この店・14日分）</h2><div id="list"><div class="msg">読み込み中…</div></div></div></div>' +
    '</div></div></div>';
  var $ = function (s) { return R.querySelector(s); };
  $('#close').onclick = function () { clearInterval(S.pollT); host.remove(); };
  $('#staff').value = S.staff;
  $('#staff').onchange = function () { S.staff = this.value.trim(); try { localStorage.setItem('ndk_hanbai_staff', S.staff); } catch (e) { } };
  $('#reload').onclick = function () { loadList(); };
  $('#fb').onclick = function () { window.open(FB_URL + '?tool=' + encodeURIComponent('販売価格の承認') + '&store=' + encodeURIComponent(SHORT[S.sid] || ''), '_blank'); };
  $('#q').oninput = function () { clearTimeout(S.searchT); var v = this.value.trim(); S.searchT = setTimeout(function () { search(v); }, 400); };

  /* ---------- 初期化 ---------- */
  (async function init() {
    try {
      var all = await api('/api/store/all');
      S.stores = (all.stores || []).filter(function (s) { return SHORT[s.id]; });
      var hdr = document.body.innerText.match(/店舗：\s*([^\n​]+)/); var hname = hdr ? hdr[1].trim() : '';
      var cur = S.stores.find(function (s) { return hname && hname.indexOf(s.display_name) >= 0; }) ||
        S.stores.find(function (s) { return hname.indexOf(SHORT[s.id]) >= 0; }) || S.stores[0];
      $('#store').innerHTML = S.stores.map(function (s) { return '<option value="' + s.id + '"' + (s.id === cur.id ? ' selected' : '') + '>' + esc(SHORT[s.id]) + '</option>'; }).join('');
      $('#store').onchange = function () { S.sid = Number(this.value); S.cur = null; drawPanel(); loadList(); search($('#q').value.trim()); };
      S.sid = cur.id;
      loadList();
    } catch (e) { $('#body').innerHTML = '<div class="msg err">読み込みに失敗しました：' + esc(e.message) + '<br>マイカにログインした状態で、もう一度ボタンを押してください。</div>'; }
  })();

  /* ---------- 検索 ---------- */
  async function search(v) {
    if (!v || v.length < 2) { $('#res').innerHTML = '<div class="msg">商品名を2文字以上入れてください（この店の在庫から探します）</div>'; return; }
    $('#res').innerHTML = '<div class="msg">検索中…</div>';
    try {
      var j = await api('/api/store/' + S.sid + '/product?is_active=true&stock_number_gte=1&take=40&skip=0&display_name=' + encodeURIComponent(v));
      S.results = (j && j.products) || [];
      if (!S.results.length) { $('#res').innerHTML = '<div class="msg">在庫のある商品が見つかりませんでした</div>'; return; }
      $('#res').innerHTML = S.results.map(function (p, i) {
        var k = kindOf(p);
        return '<div class="it">' + (p.image_url ? '<img src="' + esc(p.image_url) + '" loading="lazy">' : '<span class="noimg"></span>') +
          '<div class="g"><div class="n">' + esc(p.displayNameWithMeta || p.display_name) + '</div><div class="m">' +
          '<span class="pill' + (k.kind === 'PSA' ? ' psa' : k.kind === 'BOX' ? ' box' : '') + '">' + k.kind + (k.grade || '') + '</span>' +
          (p.condition_option_display_name ? esc(p.condition_option_display_name) + '　' : '') +
          '在庫 ' + (p.stock_number || 0) + '　販売 ' + yen(nowPrice(p)) + '　原価 ' + yen(p.average_wholesale_price) + '</div></div>' +
          '<button class="b s" data-pick="' + i + '">選ぶ</button></div>';
      }).join('');
      R.querySelectorAll('[data-pick]').forEach(function (b) { b.onclick = function () { pick(S.results[Number(b.dataset.pick)]); }; });
    } catch (e) { $('#res').innerHTML = '<div class="msg err">検索できませんでした：' + esc(e.message) + '</div>'; }
  }

  /* ---------- 価格を決める ---------- */
  async function pick(p) {
    var k = kindOf(p), seq = ++S.seq;
    S.cur = { id: p.id, name: p.displayNameWithMeta || p.display_name, cond: p.condition_option_display_name || '', kind: k.kind, grade: k.grade || '', cost: Number(p.average_wholesale_price) || 0, now: nowPrice(p), stock: p.stock_number || 0, img: p.image_url || '', auto: null, snk: null, loading: k.kind === 'PSA' && k.grade === '10' };
    drawPanel();
    if (!S.cur.loading) return;
    var c = S.cur;
    try {
      var j = await gas({ action: 'ksnkr', n: JSON.stringify([c.name]) });
      if (seq !== S.seq) return;
      c.snk = (j.r || [])[0] || null;
      c.auto = psaAuto(c.snk, c.cost);
    } catch (e) { if (seq !== S.seq) return; c.snk = { why: e.message }; }
    c.loading = false;
    drawPanel();
  }
  function drawPanel() {
    var c = S.cur, el = $('#panel');
    if (!c) { el.innerHTML = '<div class="msg">左の検索からカードを「選ぶ」を押してください</div>'; return; }
    var isAuto = !!c.auto, h = '<div class="it">' + (c.img ? '<img src="' + esc(c.img) + '">' : '<span class="noimg"></span>') +
      '<div class="g"><div class="n">' + esc(c.name) + '</div><div class="m"><span class="pill' + (c.kind === 'PSA' ? ' psa' : c.kind === 'BOX' ? ' box' : '') + '">' + c.kind + c.grade + '</span>在庫 ' + c.stock + '</div></div></div>' +
      '<dl class="kv"><dt>今の販売価格</dt><dd>' + yen(c.now) + '</dd><dt>原価</dt><dd>' + (c.cost ? yen(c.cost) : '不明') + '</dd>';
    if (c.loading) h += '</dl><div class="st wait">スニダンの価格を取得中…</div>';
    else {
      if (c.auto) h += '<dt>スニダン最安出品</dt><dd>' + (c.auto.low ? yen(c.auto.low) : 'なし') + '</dd><dt>スニダン直近の取引</dt><dd>' + (c.auto.last ? yen(c.auto.last) + (c.snk.date ? '（' + esc(c.snk.date) + '）' : '') : 'なし') + '</dd>' +
        (c.snk.url ? '<dt>売買履歴</dt><dd><a href="' + esc(c.snk.url) + '" target="_blank">スニダンで見る</a></dd>' : '');
      h += '</dl>';
      if (c.kind === 'PSA' && !c.auto) h += '<div class="hint">' + (c.grade === '10' ? 'スニダンの価格を取得できなかったため（' + esc((c.snk && c.snk.why) || '不明') + '）、価格を手で入力してください。' : '自動入力はPSA10だけです。価格を手で入力してください。') + '</div>';
      if (c.auto && c.auto.raised) h += '<div class="hint">スニダンの価格（' + yen(c.auto.market) + '）では粗利10%に届かないため、' + yen(c.auto.price) + 'に引き上げました。</div>';
      h += '<label class="lbl">販売価格' + (isAuto ? ' <small>（スニダンから自動入力）</small>' : '') + '</label><input class="f big" id="price" type="text" inputmode="numeric" autocomplete="off"' + (isAuto ? ' readonly' : '') + ' value="' + (isAuto ? c.auto.price : '') + '" placeholder="金額を入力">' +
        '<div id="calc"></div><label class="lbl">コメント <small>（任意）</small></label><textarea class="f" id="comment"></textarea>' +
        '<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap"><button class="b r" id="send">本部に承認を依頼する</button><button class="b g" id="clear">やめる</button></div><div id="result"></div>';
    }
    el.innerHTML = h;
    if (c.loading) return;
    $('#price').oninput = drawCalc;
    $('#send').onclick = submit;
    $('#clear').onclick = function () { S.seq++; S.cur = null; drawPanel(); };
    drawCalc();
  }
  function priceVal() { return Math.floor(Number(String(($('#price') || {}).value || '').normalize('NFKC').replace(/[,，円\s]/g, ''))) || 0; }
  function needApproval(c, v) { return Math.max(v, c.now) >= LINE; }
  function drawCalc() {
    var c = S.cur, v = priceVal(), m = marginOf(v, c.cost), el = $('#calc'), btn = $('#send');
    if (!v) { el.innerHTML = ''; btn.disabled = true; return; }
    var h = '<dl class="kv"><dt>粗利</dt><dd>' + (c.cost ? yen(v - c.cost) + '（' + pct(m) + '）' : '原価が不明です') + '</dd></dl>';
    if (m != null && m < MIN_MARGIN) h += '<div class="st ng">粗利が10%未満です（10%以上にするには ' + yen(floorPrice(c.cost)) + ' 以上）</div>';
    var need = needApproval(c, v);
    if (!need) h += '<div class="st ok">今の価格も新しい価格も5万円未満なので、承認はいりません。</div>';
    el.innerHTML = h; btn.disabled = !need;
  }
  async function submit() {
    if (S.sending) return;
    var c = S.cur, out = $('#result'), staff = $('#staff').value.trim(), v = priceVal(), errs = [];
    if (!staff) errs.push('上の「依頼者」に名前を入れてください');
    if (!v) errs.push('販売価格を入れてください');
    if (errs.length) { out.innerHTML = '<div class="st ng">' + errs.map(esc).join('<br>') + '</div>'; return; }
    S.staff = staff; try { localStorage.setItem('ndk_hanbai_staff', staff); } catch (e) { }
    S.sending = true; $('#send').disabled = true; out.innerHTML = '<div class="st wait">送信中…</div>';
    try {
      var body = { action: 'hanbai', store: SHORT[S.sid], requester: staff, pid: c.id, name: c.name, cond: c.cond, kind: c.kind + c.grade, cost: c.cost, now: c.now, price: v,
        source: c.auto ? (c.auto.raised ? '自動（粗利10%に引き上げ）' : '自動（スニダン）') : '手入力', low: c.auto ? c.auto.low : '', last: c.auto ? c.auto.last : '', url: (c.snk && c.snk.url) || '', comment: $('#comment').value.trim() };
      var j = await fetch(GAS, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); });
      if (!j.ok) throw new Error(j.error || '送信できませんでした');
      out.innerHTML = '<div class="st wait">' + (j.dup ? 'このカードはすでに承認待ちです。' : 'LINE WORKSの店舗グループに承認を依頼しました。') + '<br><span class="code">' + esc(j.id) + '</span><br>役員が承認すると、下の「最近の依頼」に ✅ が付きます。</div>';
      loadList();
    } catch (e) { out.innerHTML = '<div class="st ng">送信できませんでした：' + esc(e.message) + '</div>'; $('#send').disabled = false; }
    finally { S.sending = false; }
  }

  /* ---------- 最近の依頼 ---------- */
  async function loadList() {
    clearInterval(S.pollT);
    try {
      var j = await gas({ action: 'hlist', store: SHORT[S.sid] });
      S.list = j.list || [];
      drawList();
      if (S.list.some(function (x) { return x.status === '承認待ち'; })) S.pollT = setInterval(loadList, 15000);
    } catch (e) { $('#list').innerHTML = '<div class="msg err">読み込めませんでした：' + esc(e.message) + '</div>'; }
  }
  function drawList() {
    if (!S.list.length) { $('#list').innerHTML = '<div class="msg">この店の依頼はまだありません</div>'; return; }
    $('#list').innerHTML = S.list.map(function (x) {
      var cls = x.status === '承認' ? 'ok' : x.status === '差し戻し' ? 'ng' : 'wait';
      var lab = x.status === '承認' ? '✅ 承認' + (x.by ? '（' + x.by + '）' : '') : x.status === '差し戻し' ? '↩️ 差し戻し' + (x.by ? '（' + x.by + '）' : '') : '⏳ 承認待ち';
      return '<div class="rq"><div class="h"><b>' + esc(x.id) + '</b><span class="tag ' + cls + '">' + esc(lab) + '</span></div>' +
        '<div class="t">' + esc(hm(x.at) + '　' + x.requester + '\n' + x.name + '\n販売価格 ' + yen(x.price) + '（今 ' + yen(x.now) + '）') + '</div>' +
        (x.status === '承認' ? '<div class="hint">マイカでこの価格に変更してください：<b>' + yen(x.price) + '</b></div>' : '') + '</div>';
    }).join('');
  }
})();
