/* ナタデココ 販売値付け（マイカ上で動くブックマークレット本体）
 * 買取ごとに、買い取ったカードの販売価格を自動で出して、マイカに反映する。
 *   シングル：町田店の「値付けお助けツール」のやり方（原価とカードラッシュ同状態の価格から①〜④の候補）。
 *             ①から順に、ラッシュ同状態の価格以下になる最初の候補を使う。どれもラッシュより高ければ最後の候補（原価÷0.8＝粗利20%）。
 *   PSA10   ：スニダンの最安出品と直近の取引の高い方。粗利10%に届かなければ引き上げ。取れないときはラッシュの同じ鑑定品で上と同じ計算。
 *   BOX     ：カードラッシュの同じ状態の未開封BOXで、シングルの状態A／A-と同じ計算。
 *   値付けのルール（近い方に寄せる）：680円以下は 680・580・400・300・200・100・80・50・30／1万円未満は下2ケタ80／5万円未満は下3ケタ800／5万円以上は千円単位（紙幣だけで払える金額・現金のみ）
 *   今の価格か新しい価格が5万円以上なら、LINE WORKSで役員の承認を取ってから自動でマイカに反映（販売価格の承認と同じ仕組み・同じ履歴）。
 *   5万円未満は「マイカに反映」でその場で反映。 */
(function () {
  'use strict';
  if (location.hostname !== 'pos.mycalinks.com') { alert('マイカ（pos.mycalinks.com）を開いてから押してください'); return; }
  var old = document.getElementById('ndk-nezuke-host'); if (old) old.remove();

  var VERSION = '2026-11-28 版A';
  var GAS = 'https://script.google.com/macros/s/AKfycbwXHuu-X3L0qzJhvaszEIm-1xdeNIqJACQ0uM7mz5Q0hvwfdF9IuQiTKr3qmscNVmnhcQ/exec';
  var FB_URL = 'https://script.google.com/macros/s/AKfycbwl-ZCZ1LyefvSzEGkBEpTFTuFyvW0p-AYye6jBWaLP9t7-bC9_Owfeh4jKScNkFys6Fw/exec';
  var RUSH = 'https://natadecoco-rush.natadecoco-05d.workers.dev/?key=3cea41f2ef3ea5d87917a267&q=';
  var SHORT = { 322: '柏', 323: '津田沼', 324: '松戸', 325: '横浜', 326: '中野', 327: '町田', 328: '千葉中央', 409: 'お台場' };
  var LINE = 50000;        // 今の価格か新しい価格がこれ以上なら役員の承認
  var PSA_MIN = 0.1;       // PSA10の最低粗利
  var DAYS = 3;            // 買取一覧に出す日数（今日を含む）

  var S = { sid: null, stores: [], txs: [], tx: null, lines: [], staff: '', list: [], pollT: null, searchT: null, busy: false, tab: 'buy' };
  try { S.staff = localStorage.getItem('ndk_hanbai_staff') || localStorage.getItem('ndk_kaitori_staff') || localStorage.getItem('ndk_loss_staff') || ''; } catch (e) { }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function yen(n) { return Math.round(Number(n) || 0).toLocaleString() + '円'; }
  function N(s) { return String(s == null ? '' : s).normalize('NFKC').toUpperCase().replace(/[\s・･]/g, ''); }
  function hm(s) { if (!s) return ''; var d = new Date(s); if (isNaN(d)) return String(s); var x = new Date(d.getTime() + 9 * 3600e3); return (x.getUTCMonth() + 1) + '/' + x.getUTCDate() + ' ' + String(x.getUTCHours()).padStart(2, '0') + ':' + String(x.getUTCMinutes()).padStart(2, '0'); }
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
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

  /* ---------- 値付けのルール ---------- */
  var SMALL = [30, 50, 80, 100, 200, 300, 400, 580, 680];
  var VALID = (function () { var a = SMALL.slice(); for (var v = 780; v < 10000; v += 100) a.push(v); for (var w = 10800; w < 50000; w += 1000) a.push(w); return a; })();
  function cands(x) { var a = VALID.slice(); var f = Math.floor(x / 1000) * 1000; [f - 1000, f, f + 1000, f + 2000].forEach(function (v) { if (v >= 50000) a.push(v); }); a.push(50000); return a; }
  function snap(x) { // 値付けのルールに合う金額のうち、いちばん近いもの（同じ近さなら安い方）
    x = Number(x) || 0; if (x <= 0) return 0;
    var best = 0, bd = Infinity; cands(x).forEach(function (v) { var d = Math.abs(v - x); if (d < bd || (d === bd && v < best)) { best = v; bd = d; } });
    return best;
  }
  function nextUp(v) { var a = cands(v).filter(function (w) { return w > v; }); return a.length ? Math.min.apply(null, a) : v + 1000; }
  function okPrice(v) { return v > 0 && cands(v).indexOf(v) >= 0; }
  function marginOf(price, cost) { return price > 0 && cost > 0 ? (price - cost) / price : null; }
  function pct(x) { return x == null ? '—' : Math.round(x * 1000) / 10 + '%'; }
  function mid(a, b) { return (a - b) / 2 + b; }

  // 町田店の値付けお助けツールと同じ候補
  function machida(cost, rush, low) { // low=true：状態B以下
    var c7 = cost / 0.7, c8 = cost / 0.8, list = low
      ? [{ k: '①', v: cost * 2, why: '原価×2' }, { k: '②', v: mid(rush, c7), why: 'ラッシュと原価÷0.7の中間' }, { k: '③', v: mid(rush, c8), why: 'ラッシュと原価÷0.8の中間' }, { k: '④', v: c8, why: '原価÷0.8（粗利20%）' }]
      : [{ k: '①', v: mid(rush, c7), why: 'ラッシュと原価÷0.7の中間' }, { k: '②', v: mid(rush, c8), why: 'ラッシュと原価÷0.8の中間' }, { k: '③', v: c8, why: '原価÷0.8（粗利20%）' }];
    var use = null; for (var i = 0; i < list.length; i++) if (list[i].v <= rush) { use = list[i]; break; }
    if (!use) use = list[list.length - 1];
    list.forEach(function (c) { c.p = snap(c.v); c.use = c === use; });
    return { list: list, use: use, price: use.p };
  }

  /* ---------- 商品の見分け ---------- */
  function nowPrice(p) { return Number(p.actual_sell_price != null ? p.actual_sell_price : (p.specific_sell_price || p.sell_price)) || 0; }
  function kindOf(p) {
    var dn = String(p.displayNameWithMeta || p.display_name || ''), sp = String(p.specialty__display_name || '');
    var m = (sp + ' ' + (dn.match(/《([^》]*)》/) || [])[1]).match(/PSA\s*(\d+)/i);
    if (m) return { kind: 'PSA', grade: m[1] };
    var cat = String(p.item_category_display_name || '').replace(/（.*$/, '');
    if (cat === 'ボックス') return { kind: /BOX|ボックス/i.test(dn) ? 'BOX' : '未開封' };
    if (cat === 'カード' || !cat) return { kind: 'シングル' };
    return { kind: cat };
  }
  function condOf(p, kind) { // マイカの状態 → A / A- / B / C / D
    var s = String(p.condition_option_display_name || '').normalize('NFKC');
    if (kind === 'BOX') { var b = String(p.displayNameWithMeta || p.display_name || '').normalize('NFKC').match(/《BOX状態\s*([A-D]-?)》/); return b ? b[1] : 'A'; }
    var m = s.match(/状態\s*([A-D]-?)/); return m ? m[1] : '';
  }
  function model(n) { var m = String(n || '').normalize('NFKC').match(/([A-Za-z][A-Za-z0-9\-\+]*)\s+(\d{1,3})\/(\d{1,3}|[A-Za-z\-]+)/); return m ? { set: m[1], no: m[2], tot: m[3] } : null; }
  function cardName(n) { return String(n || '').normalize('NFKC').replace(/《[^》]*》/g, '').replace(/[（(].*$/, '').trim(); }

  /* ---------- カードラッシュ（中継から一覧を読む） ---------- */
  var rushCache = {};
  async function rushList(q) {
    if (rushCache[q]) return rushCache[q];
    var p = (async function () {
      for (var a = 0; a < 2; a++) {
        try { var j = await fetch(RUSH + encodeURIComponent(q)).then(function (r) { return r.json(); }); if (j && j.ok) return j.items || []; } catch (e) { }
        await new Promise(function (r) { setTimeout(r, 1200); });
      }
      throw new Error('カードラッシュを読めませんでした');
    })();
    rushCache[q] = p; p.catch(function () { delete rushCache[q]; });
    return p;
  }
  function rState(nm) { var m = nm.match(/^〔状態([^〕]+)〕/); return m ? m[1].normalize('NFKC') : (/^〔/.test(nm) ? null : 'A'); }
  function rItem(x, use, note) { return { price: x.price, so: x.so, st: x.st, url: 'https://www.cardrush-pokemon.jp/product/' + x.id, nm: x.nm, use: use, note: note || '' }; }
  async function rushSingle(name, cond, psaGrade) {
    var md = model(name), cname = cardName(name);
    if (!md || !cname) return { why: '型番がない（旧裏など）ので自動で探せません' };
    var items = (await rushList(cname + ' ' + md.no)).filter(function (x) {
      var body = x.nm.replace(/^〔[^〕]*〕/, ''), nm = body.replace(/[【{].*$/, '');
      if (N(nm).indexOf(N(cname)) !== 0) return false;
      var num = N((body.match(/\{([^}]*)\}/) || [])[1] || ''); if (num !== N(md.no + '/' + md.tot)) return false;
      var xs = N(x.set), ms = N(md.set);
      if (xs && !/その他|PROMO|鑑定|状態難/i.test(x.set) && xs.indexOf(ms) !== 0 && ms.indexOf(xs) !== 0) return false;
      return true;
    });
    if (psaGrade) {
      var g = items.filter(function (x) { return new RegExp('^〔PSA' + psaGrade + '鑑定済〕').test(x.nm); })[0];
      return g ? rItem(g, 'PSA' + psaGrade) : { why: 'ラッシュにPSA' + psaGrade + 'がありません' };
    }
    var by = {}; items.forEach(function (x) { var st = rState(x.nm); if (st && !by[st]) by[st] = x; });
    if (by[cond]) return rItem(by[cond], cond);
    return { why: 'ラッシュに状態' + cond + 'がありません', other: Object.keys(by).map(function (k) { return k + ' ' + yen(by[k].price); }).join('／') };
  }
  async function rushBox(name, cond) {
    var s = String(name || '').normalize('NFKC').replace(/《[^》]*》/g, '');
    var code = (s.match(/[（(]([A-Za-z0-9\-]+)[）)]/) || [])[1] || '', base = s.replace(/[（(].*$/, '').replace(/\s*(BOX|ボックス).*$/i, '').trim();
    if (!base) return { why: '名前がわかりません' };
    var items = (await rushList(base + ' BOX')).filter(function (x) {
      if (!/【未開封BOX】/.test(x.nm) || /サプライ|カードなし/.test(x.nm)) return false;
      var body = N(x.nm.replace(/^〔[^〕]*〕/, ''));
      if (body.indexOf(N(base)) < 0) return false;
      if (code) return body.indexOf('(' + N(code) + ')') >= 0;
      return true;
    });
    var by = {}, kinds = {};
    items.forEach(function (x) { var st = rState(x.nm); if (!st) return; kinds[N(x.nm.replace(/^〔[^〕]*〕/, ''))] = 1; if (!by[st]) by[st] = x; });
    if (Object.keys(kinds).length > 1) return { why: 'ラッシュに似たBOXが' + Object.keys(kinds).length + '種類あり、決められません' };
    if (by[cond]) return rItem(by[cond], cond);
    return { why: 'ラッシュに' + (cond === 'A' ? '未開封BOX' : '状態' + cond + 'のBOX') + 'がありません' };
  }

  /* ---------- 価格を決める ---------- */
  async function price(c) {
    c.loading = true; c.err = ''; c.plan = null; c.ref = null; c.snk = null;
    try {
      if (!c.cost) { c.err = '原価がわからないので、価格を手で入れてください'; return; }
      if (c.kind === 'シングル') {
        if (!c.cond) { c.err = 'マイカの状態がわからないので、価格を手で入れてください'; return; }
        c.ref = await rushSingle(c.name, c.cond);
        if (!c.ref.price) { c.err = c.ref.why + (c.ref.other ? '（ほかの状態：' + c.ref.other + '）' : '') + '。価格を手で入れてください'; return; }
        c.plan = machida(c.cost, c.ref.price, /^[BCD]/.test(c.cond)); c.how = '町田方式' + c.plan.use.k;
      } else if (c.kind === 'PSA') {
        if (c.grade === '10') {
          try { var j = await gas({ action: 'ksnkr', n: JSON.stringify([c.name]) }); c.snk = (j.r || [])[0] || null; } catch (e) { c.snk = { why: e.message }; }
          var low = Number(c.snk && c.snk.min) || 0, last = Number(c.snk && c.snk.price) || 0, mk = Math.max(low, last);
          if (mk) {
            var fl = Math.ceil(c.cost / (1 - PSA_MIN)), p = snap(mk); while (p < fl) p = nextUp(p);
            c.plan = { price: p, list: [{ k: 'スニダン', v: mk, p: snap(mk), use: true, why: '最安出品 ' + (low ? yen(low) : 'なし') + '／直近の取引 ' + (last ? yen(last) : 'なし') + 'の高い方' }], raised: p > snap(mk) };
            c.how = c.plan.raised ? 'スニダン（粗利10%に引き上げ）' : 'スニダン'; return;
          }
        }
        c.ref = await rushSingle(c.name, '', c.grade);
        if (!c.ref.price) { c.err = (c.grade === '10' ? 'スニダン：' + ((c.snk && c.snk.why) || '価格なし') + '／' : '') + c.ref.why + '。価格を手で入れてください'; return; }
        c.plan = machida(c.cost, c.ref.price, false); c.how = 'ラッシュPSA' + c.grade + '・町田方式' + c.plan.use.k;
      } else if (c.kind === 'BOX') {
        c.ref = await rushBox(c.name, c.cond || 'A');
        if (!c.ref.price) { c.err = c.ref.why + '。価格を手で入れてください'; return; }
        c.plan = machida(c.cost, c.ref.price, false); c.how = 'ラッシュBOX・町田方式' + c.plan.use.k;
      } else { c.err = c.kind + 'は自動で値付けしません。価格を手で入れてください'; }
    } catch (e) { c.err = '取得できませんでした（' + e.message + '）。価格を手で入れてください'; }
    finally {
      c.loading = false;
      if (c.plan && !c.manual) c.price = c.plan.price;
    }
  }
  function needApproval(c) { return Math.max(c.price || 0, c.now) >= LINE; }

  /* ---------- 画面 ---------- */
  var host = document.createElement('div'); host.id = 'ndk-nezuke-host';
  host.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000');
  document.body.appendChild(host);
  var R = host.attachShadow({ mode: 'open' });
  R.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box}' +
    '.bg{position:fixed;inset:0;background:rgba(20,20,25,.45);display:flex;justify-content:center;padding:14px;font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;color:#1d1d22;font-size:14px;line-height:1.55}' +
    '.win{background:#f6f5f2;border-radius:14px;width:100%;max-width:1280px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.35)}' +
    '.hd{background:#1d1d22;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}' +
    '.hd h1{font-size:17px;margin:0;font-weight:800}.hd h1 b{color:#e8c23a}.hd .v{font-size:11px;color:#e8c23a}.hd .sp{flex:1}' +
    '.hd select,.hd input{font:inherit;font-size:13px;padding:4px 8px;border-radius:7px;border:0}' +
    '.hd label{font-size:12px;display:inline-flex;gap:6px;align-items:center}' +
    '.hd button{all:unset;cursor:pointer;color:#fff;font-weight:700;padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.14)}.hd button.fbb{background:#2563eb}' +
    '.body{flex:1;overflow:auto;padding:14px 16px;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,8fr);gap:16px;align-items:start}' +
    '@media (max-width:900px){.body{grid-template-columns:1fr}}' +
    '.col{min-width:0}h2{font-size:15px;margin:2px 0 8px}h2 small{font-weight:400;color:#888}' +
    '.box{background:#fff;border:1.5px solid #e5e2da;border-radius:12px;padding:12px 14px;margin-bottom:12px}' +
    '.tabs{display:flex;gap:6px;margin-bottom:8px}.tabs button{all:unset;cursor:pointer;font-weight:800;font-size:13px;padding:6px 12px;border-radius:999px;background:#eeece6}.tabs button.on{background:#1d1d22;color:#fff}' +
    '#left{max-height:68vh;overflow:auto}' +
    'input.q,textarea.f,input.f{display:block;width:100%;padding:8px 10px;border:1.5px solid #d6d2c8;border-radius:8px;font:inherit;background:#fff}' +
    'input.f.big{font-size:20px;font-weight:800;text-align:right;width:150px;display:inline-block}' +
    '.tx{display:block;width:100%;text-align:left;border:1.5px solid #e5e2da;background:#fff;border-radius:10px;padding:8px 10px;margin-bottom:6px;cursor:pointer;font:inherit}.tx:hover{border-color:#1d1d22}.tx.on{border-color:#c8102e;background:#fff7f8}' +
    '.tx .a{font-weight:800}.tx .b{font-size:12px;color:#666}' +
    '.it{display:flex;gap:10px;align-items:center;padding:7px 0;border-top:1px solid #eceae4}.it:first-child{border-top:0}' +
    '.it img,.it .noimg{width:44px;height:62px;object-fit:contain;border-radius:4px;background:#f2f0ea;flex:none}' +
    '.it .g{flex:1;min-width:0}.it .n{font-weight:700;font-size:13px;word-break:break-all}.it .m{color:#777;font-size:12px}' +
    '.pill{display:inline-block;font-size:11px;font-weight:800;padding:0 7px;border-radius:999px;background:#1d1d22;color:#fff;margin-right:4px}.pill.psa{background:#2952a3}.pill.box{background:#7a5b00}.pill.mikai{background:#15803d}.pill.cash{background:#c8102e}' +
    'button.b{all:unset;cursor:pointer;font-weight:800;font-size:14px;padding:10px 18px;border-radius:10px;background:#1d1d22;color:#fff;text-align:center}' +
    'button.b.r{background:#c8102e}button.b.g{background:#fff;color:#1d1d22;border:1.5px solid #d6d2c8}button.b.s{font-size:12px;padding:5px 10px;border-radius:8px}' +
    'button.b[disabled]{opacity:.45;cursor:default}' +
    '.line{border-top:1px solid #d6d2c8;padding:10px 0}.line:first-child{border-top:0;padding-top:0}' +
    '.cd{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.cd span{font-size:12px;border:1px solid #d6d2c8;border-radius:8px;padding:2px 8px;color:#555}.cd span.use{border-color:#c8102e;color:#c8102e;font-weight:800;background:#fff7f8}' +
    '.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px}.row .lab{font-weight:800;font-size:13px}' +
    '.msg{padding:18px;text-align:center;color:#777}.err{color:#c8102e;font-weight:700}' +
    '.st{padding:8px 12px;border-radius:10px;font-weight:800;margin:6px 0;font-size:13px}.st.wait{background:#fff4c2;color:#5c4300}.st.ok{background:#e3f4e6;color:#15803d}.st.ng{background:#fff0f2;color:#c8102e}.st.info{background:#eef3ff;color:#1e3a8a}' +
    '.hint{font-size:12px;color:#7a5b00;background:#fdf6dc;border-radius:8px;padding:6px 10px;margin-top:6px}' +
    '.rq{border-top:1px solid #eceae4;padding:9px 0}.rq:first-child{border-top:0}.rq .t{color:#555;font-size:12px;white-space:pre-wrap;margin-top:3px}' +
    '.tag{font-size:11.5px;font-weight:800;padding:1px 8px;border-radius:999px}.tag.wait{background:#fff4c2;color:#7a5b00}.tag.ok{background:#e3f4e6;color:#15803d}.tag.ng{background:#fff0f2;color:#c8102e}' +
    '.rule{font-size:12px;color:#555;line-height:1.7}' +
    'a{color:#2563eb}' +
    '</style>' +
    '<div class="bg"><div class="win">' +
    '<div class="hd"><h1><b>販売値付け</b></h1><span class="v">' + VERSION + '</span>' +
    '<label>店舗 <select id="store"></select></label>' +
    '<label>担当 <input id="staff" placeholder="名前（必須）" style="width:120px"></label>' +
    '<span class="sp"></span><button id="reload">更新</button><button id="fb" class="fbb">意見を送る</button><button id="close">閉じる ×</button></div>' +
    '<div class="body" id="body">' +
    '<div class="col"><div class="box"><div class="tabs"><button id="tbuy" class="on">買取から選ぶ</button><button id="tsearch">在庫から探す</button></div>' +
    '<div id="left"><div class="msg">読み込み中…</div></div></div>' +
    '<div class="box"><h2>承認の依頼（この店・14日分）</h2><div id="list"><div class="msg">読み込み中…</div></div></div>' +
    '<div class="box rule"><b>値付けのルール</b><br>・680円以下：680・580・400・300・200・100・80・50・30<br>・1万円未満：下2ケタは「80」<br>・5万円未満：下3ケタは「800」<br>・5万円以上：紙幣だけで払える金額（現金のみ）<br>・5万円以上は役員の承認が取れたら自動でマイカに反映</div></div>' +
    '<div class="col"><div class="box"><h2 id="rtitle">販売価格 <small>左で買取を選んでください</small></h2><div id="lines"></div><div id="sum"></div>' +
    '<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap"><button class="b r" id="go" disabled>マイカに反映・承認を依頼</button><button class="b g" id="clear">全部やめる</button></div><div id="result"></div></div></div>' +
    '</div></div></div>';
  var $ = function (s) { return R.querySelector(s); };
  $('#close').onclick = function () { clearInterval(S.pollT); host.remove(); };
  $('#staff').value = S.staff;
  $('#staff').onchange = function () { S.staff = this.value.trim(); try { localStorage.setItem('ndk_hanbai_staff', S.staff); } catch (e) { } };
  $('#reload').onclick = function () { S.tab === 'buy' ? loadTxs() : search(($('#q') || {}).value || ''); loadList(); };
  $('#fb').onclick = function () { window.open(FB_URL + '?tool=' + encodeURIComponent('販売値付け') + '&store=' + encodeURIComponent(SHORT[S.sid] || ''), '_blank'); };
  $('#go').onclick = submit;
  $('#clear').onclick = function () { S.lines = []; S.tx = null; drawLines(); drawTxs(); $('#result').innerHTML = ''; };
  $('#tbuy').onclick = function () { setTab('buy'); };
  $('#tsearch').onclick = function () { setTab('search'); };
  function setTab(t) {
    S.tab = t; $('#tbuy').className = t === 'buy' ? 'on' : ''; $('#tsearch').className = t === 'search' ? 'on' : '';
    if (t === 'buy') drawTxs();
    else {
      $('#left').innerHTML = '<input class="q" id="q" placeholder="商品名で検索（例：リーリエの決心、BOX名）"><div id="res"><div class="msg">商品名を2文字以上入れてください（この店の在庫から探します）</div></div>';
      $('#q').oninput = function () { clearTimeout(S.searchT); var v = this.value.trim(); S.searchT = setTimeout(function () { search(v); }, 400); };
      $('#q').focus();
    }
  }

  /* ---------- 初期化 ---------- */
  (async function init() {
    try {
      var all = await api('/api/store/all');
      S.stores = (all.stores || []).filter(function (s) { return SHORT[s.id]; });
      var hdr = document.body.innerText.match(/店舗：\s*([^\n​]+)/); var hname = hdr ? hdr[1].trim() : '';
      var cur = S.stores.find(function (s) { return hname && hname.indexOf(s.display_name) >= 0; }) ||
        S.stores.find(function (s) { return hname.indexOf(SHORT[s.id]) >= 0; }) || S.stores[0];
      $('#store').innerHTML = S.stores.map(function (s) { return '<option value="' + s.id + '"' + (s.id === cur.id ? ' selected' : '') + '>' + esc(SHORT[s.id]) + '</option>'; }).join('');
      $('#store').onchange = function () { S.sid = Number(this.value); S.lines = []; S.tx = null; drawLines(); setTab(S.tab); loadTxs(); loadList(); };
      S.sid = cur.id;
      drawLines(); loadTxs(); loadList();
    } catch (e) { $('#body').innerHTML = '<div class="msg err">読み込みに失敗しました：' + esc(e.message) + '<br>マイカにログインした状態で、もう一度ボタンを押してください。</div>'; }
  })();

  /* ---------- 買取の一覧（完了した買取・直近3日） ---------- */
  function doneKey() { return 'ndk_nezuke_done_' + S.sid; }
  async function loadTxs() {
    if (S.tab === 'buy') $('#left').innerHTML = '<div class="msg">マイカの買取を読み込んでいます…</div>';
    try {
      var since = Date.now() - DAYS * 864e5, all = [];
      for (var sk = 0; sk < 600; sk += 100) {
        var j = await api('/api/store/' + S.sid + '/transaction?status=completed&transaction_kind=buy&take=100&skip=' + sk + '&orderBy=-finished_at');
        var got = (j.transactions || []); all = all.concat(got);
        if (got.length < 100 || new Date(got[got.length - 1].finished_at).getTime() < since) break;
      }
      S.txs = all.filter(function (t) { return !t.is_return && new Date(t.finished_at).getTime() >= since && (t.transaction_carts || []).length; });
      if (S.tab === 'buy') drawTxs();
    } catch (e) { if (S.tab === 'buy') $('#left').innerHTML = '<div class="msg err">買取を読み込めませんでした：' + esc(e.message) + '</div>'; }
  }
  function drawTxs() {
    if (S.tab !== 'buy') return;
    if (!S.txs.length) { $('#left').innerHTML = '<div class="msg">直近' + DAYS + '日の完了した買取はありません</div>'; return; }
    var done = store(doneKey()) || {};
    $('#left').innerHTML = '<div class="m" style="font-size:12px;color:#777;margin-bottom:6px">完了した買取（直近' + DAYS + '日）。押すとその買取のカードを全部値付けします。</div>' + S.txs.map(function (t) {
      var cs = t.transaction_carts || [], n = cs.reduce(function (a, c) { return a + (c.item_count || 0); }, 0);
      var top = cs.slice().sort(function (a, b) { return (b.unit_price || 0) - (a.unit_price || 0); })[0] || {};
      return '<button class="tx' + (S.tx && S.tx.id === t.id ? ' on' : '') + '" data-tx="' + t.id + '"><div class="a">' + hm(t.finished_at) + '　受付' + esc(t.reception_number || '') + '　' + yen(t.total_price) + (done[t.id] ? '　<span class="tag ok">値付け済み</span>' : '') + '</div>' +
        '<div class="b">' + cs.length + '種類・' + n + '点　' + esc(String(top.product__displayNameWithMeta || top.product_name || '').slice(0, 40)) + (cs.length > 1 ? ' ほか' : '') + '</div></button>';
    }).join('');
    R.querySelectorAll('[data-tx]').forEach(function (b) { b.onclick = function () { openTx(Number(b.dataset.tx)); }; });
  }
  async function openTx(id) {
    var t = S.txs.find(function (x) { return x.id === id; }); if (!t) return;
    S.tx = t; S.lines = []; S.skipped = 0; $('#result').innerHTML = ''; drawTxs();
    $('#rtitle').innerHTML = '販売価格 <small>受付' + esc(t.reception_number || '') + '（' + hm(t.finished_at) + '・買取 ' + yen(t.total_price) + '）</small>';
    $('#lines').innerHTML = '<div class="msg">カードを読み込んでいます…</div>';
    // 【@100】のようなまとめ買い（ポケモン/トレーナーズ）は振替して売るので、値付けの対象にしない
    var bulk = function (c) { return /【@|ポケモン\/トレーナーズ/.test(String(c.product__displayNameWithMeta || c.product_name || '')); };
    var carts = (t.transaction_carts || []).filter(function (c) { return c.product_id && !bulk(c); }), seen = {};
    S.skipped = (t.transaction_carts || []).filter(bulk).length;
    for (var k = 0; k < carts.length; k += 10) {
      if (S.tx !== t) return;
      await Promise.all(carts.slice(k, k + 10).map(async function (c) {
        if (seen[c.product_id]) return; seen[c.product_id] = 1;
        try { var j = await api('/api/store/' + S.sid + '/product?id=' + c.product_id); var p = ((j && j.products) || [])[0]; if (p) add(p, c.unit_price, true); } catch (e) { }
      }));
    }
    if (S.tx !== t) return;
    S.lines.sort(function (a, b) { return b.cost - a.cost; });
    drawLines(); S.lines.forEach(run);
    if (S.skipped) $('#result').innerHTML = '<div class="hint">【@○○】のまとめ買い（' + S.skipped + '件）は振替して売るので、ここでは値付けしません</div>';
    if (!S.lines.length) $('#lines').innerHTML = '<div class="msg">この買取には値付けするカードがありません</div>';
  }

  /* ---------- 在庫から探す ---------- */
  async function search(v) {
    if (S.tab !== 'search' || !$('#res')) return;
    if (!v || v.length < 2) { $('#res').innerHTML = '<div class="msg">商品名を2文字以上入れてください（この店の在庫から探します）</div>'; return; }
    $('#res').innerHTML = '<div class="msg">検索中…</div>';
    try {
      var j = await api('/api/store/' + S.sid + '/product?is_active=true&stock_number_gte=1&take=40&skip=0&display_name=' + encodeURIComponent(v));
      var rs = (j && j.products) || [];
      if (!rs.length) { $('#res').innerHTML = '<div class="msg">在庫のある商品が見つかりませんでした</div>'; return; }
      $('#res').innerHTML = rs.map(function (p, i) {
        var k = kindOf(p);
        return '<div class="it">' + (p.image_url ? '<img src="' + esc(p.image_url) + '" loading="lazy">' : '<span class="noimg"></span>') +
          '<div class="g"><div class="n">' + esc(p.displayNameWithMeta || p.display_name) + '</div><div class="m">' + pill(k) +
          (p.condition_option_display_name ? esc(p.condition_option_display_name) + '　' : '') + '在庫 ' + (p.stock_number || 0) + '　販売 ' + yen(nowPrice(p)) + '　原価 ' + yen(p.average_wholesale_price) + '</div></div>' +
          '<button class="b s" data-pick="' + i + '">追加</button></div>';
      }).join('');
      R.querySelectorAll('[data-pick]').forEach(function (b) { b.onclick = function () { var c = add(rs[Number(b.dataset.pick)], null); if (c) { drawLines(); run(c); } }; });
    } catch (e) { $('#res').innerHTML = '<div class="msg err">検索できませんでした：' + esc(e.message) + '</div>'; }
  }
  function pill(k) { return '<span class="pill' + (k.kind === 'PSA' ? ' psa' : k.kind === 'BOX' ? ' box' : k.kind === '未開封' ? ' mikai' : '') + '">' + esc(k.kind + (k.grade || '')) + '</span>'; }

  /* ---------- 値付けの行 ---------- */
  function add(p, buyUnit, quiet) {
    if (S.lines.some(function (x) { return x.id === p.id; })) return null;
    var k = kindOf(p), cost = Number(buyUnit) || Number(p.average_wholesale_price) || 0;
    var c = { id: p.id, name: p.displayNameWithMeta || p.display_name, condLabel: p.condition_option_display_name || '', kind: k.kind, grade: k.grade || '', cond: condOf(p, k.kind),
      cost: Math.round(cost), costFrom: buyUnit ? '今回の買取価格' : '平均原価', now: nowPrice(p), stock: p.stock_number || 0, img: p.image_url || '', price: 0, manual: false, loading: true, state: '' };
    S.lines.push(c); if (!quiet) $('#result').innerHTML = '';
    return c;
  }
  async function run(c) { await price(c); if (S.lines.indexOf(c) >= 0) drawLine(c); }
  function lineHtml(c) {
    var h = '<div class="line" data-line="' + c.id + '"><div class="it">' + (c.img ? '<img src="' + esc(c.img) + '">' : '<span class="noimg"></span>') +
      '<div class="g"><div class="n">' + esc(c.name) + '</div><div class="m">' + pill(c) + (c.condLabel ? esc(c.condLabel) + '　' : '') + '在庫 ' + c.stock + '　今 ' + yen(c.now) + '　原価 ' + (c.cost ? yen(c.cost) + '<small>（' + c.costFrom + '）</small>' : '不明') + '</div></div>' +
      '<button class="b s g" data-del="' + c.id + '">外す</button></div>';
    if (c.state === 'done') return h + '<div class="st ok">マイカに ' + yen(c.price) + ' で反映しました</div></div>';
    if (c.state === 'wait') return h + '<div class="st wait">' + yen(c.price) + ' で役員の承認待ち（' + esc(c.req || '') + '）。承認されたら自動でマイカに反映します</div></div>';
    if (c.loading) return h + '<div class="st info">価格を調べています…</div></div>';
    if (c.plan) {
      h += '<div class="cd">' + c.plan.list.map(function (x) { return '<span class="' + (x.use ? 'use' : '') + '" title="' + esc(x.why) + '">' + x.k + ' ' + yen(x.p) + '</span>'; }).join('') + '</div>';
      h += '<div class="m" style="font-size:12px;color:#555">' + (c.ref && c.ref.price ? 'ラッシュ' + (c.kind === 'PSA' ? '' : '状態') + esc(c.ref.use) + '：' + yen(c.ref.price) + (c.ref.so ? '（売切）' : '') + '　<a href="' + esc(c.ref.url) + '" target="_blank">ラッシュで見る</a>　' : '') +
        (c.snk && c.snk.url ? '<a href="' + esc(c.snk.url) + '" target="_blank">スニダン売買履歴</a>　' : '') + '使った候補：' + esc(c.plan.list.filter(function (x) { return x.use; })[0].why) + '</div>';
    }
    if (c.err) h += '<div class="hint">' + esc(c.err) + (c.cost ? '（参考：原価÷0.8＝' + yen(snap(c.cost / 0.8)) + '／原価÷0.7＝' + yen(snap(c.cost / 0.7)) + '）' : '') + '</div>';
    return h + '<div class="row"><span class="lab">販売価格</span><input class="f big" data-price="' + c.id + '" type="text" inputmode="numeric" autocomplete="off" value="' + (c.price || '') + '" placeholder="金額">' +
      (c.manual ? '<span class="tag wait">手で変更</span>' + (c.plan ? '<button class="b s g" data-reset="' + c.id + '">自動に戻す</button>' : '') : '') + '</div><div data-calc="' + c.id + '"></div></div>';
  }
  function bindLine(c) {
    var el = R.querySelector('[data-line="' + c.id + '"]'); if (!el) return;
    el.querySelector('[data-del]').onclick = function () { S.lines.splice(S.lines.indexOf(c), 1); drawLines(); };
    var rs = el.querySelector('[data-reset]'); if (rs) rs.onclick = function () { c.manual = false; c.price = c.plan.price; drawLine(c); };
    var inp = el.querySelector('[data-price]');
    if (inp) {
      inp.oninput = function () { c.price = Math.floor(Number(String(inp.value).normalize('NFKC').replace(/[,，円\s]/g, ''))) || 0; c.manual = !c.plan || c.price !== c.plan.price; drawCalc(c); drawSum(); };
      inp.onblur = function () { var was = !!el.querySelector('.tag.wait'); if (was !== c.manual) drawLine(c); };
      drawCalc(c);
    }
  }
  function drawLine(c) { var el = R.querySelector('[data-line="' + c.id + '"]'); if (!el) return; el.outerHTML = lineHtml(c); bindLine(c); drawSum(); }
  function drawLines() {
    if (!S.lines.length) { $('#lines').innerHTML = '<div class="msg">左で買取を選ぶか、在庫から探して「追加」してください</div>'; drawSum(); return; }
    $('#lines').innerHTML = S.lines.map(lineHtml).join('');
    S.lines.forEach(bindLine); drawSum();
  }
  function drawCalc(c) {
    var el = R.querySelector('[data-calc="' + c.id + '"]'); if (!el) return;
    if (!c.price) { el.innerHTML = ''; return; }
    var m = marginOf(c.price, c.cost), h = '<div class="m" style="font-size:13px;margin-top:4px">粗利 <b>' + (c.cost ? yen(c.price - c.cost) + '（' + pct(m) + '）' : '原価が不明です') + '</b>' +
      (c.price >= LINE ? '　<span class="pill cash">現金のみ</span>' : '') + (needApproval(c) ? '　<span class="tag wait">役員の承認が必要</span>' : '') + (c.price === c.now ? '　<span class="tag ok">今の価格と同じ</span>' : '') + '</div>';
    if (!okPrice(c.price)) h += '<div class="st ng">値付けのルールに合わない金額です（近い金額：' + yen(snap(c.price)) + '）</div>';
    if (m != null && m < 0) h += '<div class="st ng">原価割れです</div>';
    el.innerHTML = h;
  }
  function targets() { return S.lines.filter(function (c) { return !c.state && !c.loading && c.price > 0 && c.price !== c.now; }); }
  function drawSum() {
    var t = targets(), ap = t.filter(needApproval), now = t.filter(function (c) { return !needApproval(c); });
    var bad = t.filter(function (c) { return !okPrice(c.price) || (c.cost && c.price < c.cost); }), busy = S.lines.some(function (c) { return c.loading; });
    $('#sum').innerHTML = S.lines.length ? '<div style="margin-top:10px;font-weight:800">すぐ反映 ' + now.length + '件・承認の依頼 ' + ap.length + '件' +
      (busy ? '<span style="color:#777">（調べ中）</span>' : '') + (bad.length ? '<span class="err">（ルールに合わない金額・原価割れ：' + bad.length + '件）</span>' : '') + '</div>' : '';
    $('#go').disabled = !t.length || !!bad.length || busy || S.busy;
  }

  /* ---------- マイカに反映・承認を依頼 ---------- */
  async function putPrice(pid, price) {
    await api('/api/store/' + S.sid + '/product/' + pid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ specific_sell_price: price }) });
    var j = await api('/api/store/' + S.sid + '/product?id=' + pid), p = ((j && j.products) || [])[0];
    if (!p || Number(p.specific_sell_price) !== Number(price)) throw new Error('マイカの価格が変わっていません');
  }
  function markTx() { if (!S.tx) return; var d = store(doneKey()) || {}; d[S.tx.id] = Date.now(); Object.keys(d).forEach(function (k) { if (Date.now() - d[k] > 14 * 864e5) delete d[k]; }); store(doneKey(), d); }
  async function submit() {
    if (S.busy) return;
    var out = $('#result'), staff = $('#staff').value.trim(), t = targets();
    if (!staff) { out.innerHTML = '<div class="st ng">上の「担当」に名前を入れてください</div>'; return; }
    if (!t.length) return;
    S.staff = staff; try { localStorage.setItem('ndk_hanbai_staff', staff); } catch (e) { }
    S.busy = true; drawSum(); out.innerHTML = '<div class="st wait">送信中…</div>';
    var msgs = [], ap = t.filter(needApproval), now = t.filter(function (c) { return !needApproval(c); });
    var ok = 0, ng = [];
    for (var i = 0; i < now.length; i++) {
      try { await putPrice(now[i].id, now[i].price); now[i].state = 'done'; ok++; drawLine(now[i]); } catch (e) { ng.push(now[i].name + '：' + e.message); }
    }
    if (ok) msgs.push('<div class="st ok">' + ok + '件をマイカに反映しました</div>');
    if (ng.length) msgs.push('<div class="st ng">反映できなかったもの：<br>' + ng.map(esc).join('<br>') + '</div>');
    if (ap.length) {
      try {
        var body = { action: 'hanbai', store: SHORT[S.sid], requester: staff, comment: '販売値付けツール' + (S.tx ? '（買取 受付' + (S.tx.reception_number || '') + '）' : '') + '・承認されると自動でマイカに反映', lines: ap.map(function (c) {
          return { pid: c.id, name: c.name, cond: c.condLabel, kind: c.kind + c.grade, cost: c.cost, now: c.now, price: c.price,
            source: (c.manual ? '手入力' : '自動（' + (c.how || '') + '）') + (c.ref && c.ref.price ? '／ラッシュ' + c.ref.use + ' ' + yen(c.ref.price) : ''),
            low: c.snk ? c.snk.min || '' : '', last: c.snk ? c.snk.price || '' : '', url: (c.snk && c.snk.url) || (c.ref && c.ref.url) || '' };
        }) };
        var j = await fetch(GAS, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); });
        if (!j.ok) throw new Error(j.error || '送信できませんでした');
        var pend = store('ndk_nezuke_pend') || {};
        pend[j.id] = { sid: S.sid, at: Date.now(), items: ap.map(function (c) { return { pid: c.id, price: c.price, name: c.name }; }) };
        store('ndk_nezuke_pend', pend);
        ap.forEach(function (c) { c.state = 'wait'; c.req = j.id; drawLine(c); });
        msgs.push('<div class="st wait">LINE WORKSの店舗グループに ' + ap.length + '件の承認を依頼しました（' + esc(j.id) + '）。承認されたら自動でマイカに反映します。<br>※このツールを閉じていた場合は、次に開いたときに反映します。</div>');
      } catch (e) { msgs.push('<div class="st ng">承認の依頼を送れませんでした：' + esc(e.message) + '</div>'); }
    }
    if (!ng.length) markTx();
    out.innerHTML = msgs.join(''); S.busy = false; drawSum(); drawTxs(); loadList();
  }

  /* ---------- 承認の依頼（承認されたら自動で反映） ---------- */
  async function loadList() {
    clearInterval(S.pollT);
    try {
      var j = await gas({ action: 'hlist', store: SHORT[S.sid] });
      S.list = j.list || [];
      await applyApproved();
      drawList();
      var pend = store('ndk_nezuke_pend') || {};
      if (S.list.some(function (x) { return x.status === '承認待ち'; }) || Object.keys(pend).length) S.pollT = setInterval(loadList, 15000);
    } catch (e) { $('#list').innerHTML = '<div class="msg err">読み込めませんでした：' + esc(e.message) + '</div>'; }
  }
  async function applyApproved() {
    var pend = store('ndk_nezuke_pend') || {}, changed = false;
    for (var id in pend) {
      var p = pend[id]; if (p.sid !== S.sid) continue;
      var x = S.list.find(function (r) { return r.id === id; });
      if (!x) { if (Date.now() - p.at > 14 * 864e5) { delete pend[id]; changed = true; } continue; }
      if (x.status === '差し戻し' || x.status === '取り消し') { delete pend[id]; changed = true; markLines(id, 'back'); continue; }
      if (x.status !== '承認') continue;
      var left = [];
      for (var i = 0; i < p.items.length; i++) { try { await putPrice(p.items[i].pid, p.items[i].price); } catch (e) { left.push(p.items[i]); } }
      if (left.length) p.items = left; else delete pend[id];
      changed = true; markLines(id, left.length ? '' : 'done');
      $('#result').innerHTML = left.length ? '<div class="st ng">承認された ' + esc(id) + ' のうち ' + left.length + '件をマイカに反映できませんでした。15秒後にもう一度試します</div>' : '<div class="st ok">承認された ' + esc(id) + ' をマイカに反映しました</div>';
    }
    if (changed) store('ndk_nezuke_pend', pend);
  }
  function markLines(id, st) { S.lines.forEach(function (c) { if (c.req === id) { c.state = st === 'back' ? '' : st; if (st === 'back') { c.manual = true; c.err = '差し戻されました。LINE WORKSで直す点を確認してください'; } drawLine(c); } }); }
  function drawList() {
    var pend = store('ndk_nezuke_pend') || {};
    if (!S.list.length) { $('#list').innerHTML = '<div class="msg">この店の依頼はまだありません</div>'; return; }
    $('#list').innerHTML = S.list.slice(0, 15).map(function (x) {
      var cls = x.status === '承認' ? 'ok' : x.status === '差し戻し' ? 'ng' : 'wait';
      var lab = x.status === '承認' ? '✅ 承認' + (x.by ? '（' + x.by + '）' : '') : x.status === '差し戻し' ? '↩️ 差し戻し' + (x.by ? '（' + x.by + '）' : '') : '⏳ 承認待ち';
      var auto = pend[x.id] ? (x.status === '承認' ? '　<span class="tag ng">マイカ反映待ち</span>' : '　<span class="tag ok">承認後に自動反映</span>') : '';
      return '<div class="rq"><div><b>' + esc(x.id) + '</b> <span class="tag ' + cls + '">' + esc(lab) + '</span>' + auto + '</div>' +
        '<div class="t">' + esc(hm(x.at) + '　' + x.requester + '　' + x.items.length + '件\n' + x.items.map(function (t) { return t.name + '　' + yen(t.price) + '（今 ' + yen(t.now) + '）'; }).join('\n')) + '</div></div>';
    }).join('');
  }

  window.__ndkNezuke = { S: S, snap: snap, machida: machida, rushSingle: rushSingle, rushBox: rushBox, price: price };
})();
