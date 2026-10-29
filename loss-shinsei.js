/* ナタデココ ロス申請（マイカ上で動くブックマークレット本体）
 * ロスしたい商品をマイカの在庫から選び、理由を書いて、LINE WORKSの「ロス申請」グループに承認を依頼する。
 * 役員が承認したら、マイカでロス登録（理由の欄に申請番号を入れる）。
 * 承認のないロスは、毎晩22時のチェックで「ロス申請」グループに警告が届く。 */
(function () {
  'use strict';
  if (location.hostname !== 'pos.mycalinks.com') { alert('マイカ（pos.mycalinks.com）を開いてから押してください'); return; }
  var old = document.getElementById('ndk-loss-host'); if (old) old.remove();

  var VERSION = '2026-10-30 版B';
  var GAS = 'https://script.google.com/macros/s/AKfycbwXHuu-X3L0qzJhvaszEIm-1xdeNIqJACQ0uM7mz5Q0hvwfdF9IuQiTKr3qmscNVmnhcQ/exec';
  var FB_URL = 'https://script.google.com/macros/s/AKfycbwl-ZCZ1LyefvSzEGkBEpTFTuFyvW0p-AYye6jBWaLP9t7-bC9_Owfeh4jKScNkFys6Fw/exec';
  var SHORT = { 322: '柏', 323: '津田沼', 324: '松戸', 325: '横浜', 326: '中野', 327: '町田', 328: '千葉中央', 390: '通販', 409: 'お台場' };

  var S = { sid: null, stores: [], genres: [], results: [], lines: [], photos: [], staff: '', list: [], pollT: null, searchT: null, sending: false };
  try { S.staff = localStorage.getItem('ndk_loss_staff') || localStorage.getItem('ndk_kaitori_staff') || ''; } catch (e) { }

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
  function price(p) { return Number(p.specific_sell_price || p.sell_price || 0); }

  /* ---------- 画面 ---------- */
  var host = document.createElement('div'); host.id = 'ndk-loss-host';
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
    '#res{max-height:44vh;overflow:auto;margin-top:6px}.col{min-width:0}h2{font-size:15px;margin:2px 0 8px}' +
    '.box{background:#fff;border:1.5px solid #e5e2da;border-radius:12px;padding:12px 14px;margin-bottom:12px}' +
    'input.q,select.f,textarea.f,input.f{display:block;width:100%;padding:8px 10px;border:1.5px solid #d6d2c8;border-radius:8px;font:inherit;font-weight:400;background:#fff}' +
    'textarea.f{min-height:70px;resize:vertical}' +
    '.lbl{display:block;font-weight:700;font-size:13px;margin:10px 0 3px}.lbl small{font-weight:400;color:#888}' +
    '.it{display:flex;gap:10px;align-items:center;padding:7px 0;border-top:1px solid #eceae4}.it:first-child{border-top:0}' +
    '.it img,.it .noimg{width:40px;height:56px;object-fit:contain;border-radius:4px;background:#f2f0ea;flex:none}' +
    '.it .g{flex:1;min-width:0}.it .n{font-weight:700;font-size:13px;word-break:break-all}.it .m{color:#777;font-size:12px}' +
    '.pill{display:inline-block;font-size:11px;font-weight:800;padding:0 7px;border-radius:999px;background:#1d1d22;color:#fff;margin-right:4px}' +
    'button.b{all:unset;cursor:pointer;font-weight:800;font-size:14px;padding:10px 18px;border-radius:10px;background:#1d1d22;color:#fff;text-align:center}' +
    'button.b.r{background:#c8102e}button.b.g{background:#fff;color:#1d1d22;border:1.5px solid #d6d2c8}button.b.s{font-size:12px;padding:5px 10px;border-radius:8px}' +
    'button.b[disabled]{opacity:.45;cursor:default}.it button.b{flex:none}' +
    '.cnt{display:flex;align-items:center;gap:4px}.cnt input{width:54px;text-align:center;padding:5px;border:1.5px solid #d6d2c8;border-radius:7px;font:inherit;font-weight:800}' +
    '.sum{display:flex;gap:16px;align-items:baseline;margin-top:8px;font-weight:800}.sum .big{font-size:22px}' +
    '.msg{padding:18px;text-align:center;color:#777}.err{color:#c8102e;font-weight:700}' +
    '.thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.thumbs span{position:relative}.thumbs img{width:64px;height:64px;object-fit:cover;border-radius:6px;display:block}.thumbs i{position:absolute;top:-6px;right:-6px;background:#c8102e;color:#fff;border-radius:999px;width:18px;height:18px;font:700 12px/18px sans-serif;text-align:center;cursor:pointer;font-style:normal}' +
    '.st{padding:10px 14px;border-radius:10px;font-weight:800;margin:10px 0}.st.wait{background:#fff4c2;color:#5c4300}.st.ok{background:#e3f4e6;color:#15803d}.st.ng{background:#fff0f2;color:#c8102e}' +
    '.code{display:inline-block;font:800 18px/1.2 ui-monospace,Consolas,monospace;background:#1d1d22;color:#e8c23a;padding:6px 12px;border-radius:8px;margin:6px 6px 0 0;letter-spacing:.03em}' +
    '.rq{border-top:1px solid #eceae4;padding:9px 0}.rq:first-child{border-top:0}.rq .h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rq .t{color:#555;font-size:12px;white-space:pre-wrap;margin-top:3px}' +
    '.tag{font-size:11.5px;font-weight:800;padding:1px 8px;border-radius:999px}.tag.wait{background:#fff4c2;color:#7a5b00}.tag.ok{background:#e3f4e6;color:#15803d}.tag.ng{background:#fff0f2;color:#c8102e}.tag.gr{background:#eee;color:#555}' +
    '.hint{font-size:12px;color:#7a5b00;background:#fdf6dc;border-radius:8px;padding:8px 10px;margin-top:8px}' +
    '</style>' +
    '<div class="bg"><div class="win">' +
    '<div class="hd"><h1><b>ロス</b>申請</h1><span class="v">' + VERSION + '</span>' +
    '<label>店舗 <select id="store"></select></label>' +
    '<label>申請者 <input id="staff" placeholder="名前（必須）" style="width:120px"></label>' +
    '<span class="sp"></span><button id="reload">更新</button><button id="fb" class="fbb">意見を送る</button><button id="close">閉じる ×</button></div>' +
    '<div class="body" id="body">' +
    '<div class="col">' +
    '<div class="box"><h2>① ロスする商品を探す</h2><input class="q" id="q" placeholder="商品名で検索（例：ピカチュウ、BOX名）">' +
    '<div id="res"><div class="msg">商品名を2文字以上入れてください（この店の在庫から探します）</div></div></div>' +
    '<div class="box"><h2>最近の申請（この店・14日分）</h2><div id="list"><div class="msg">読み込み中…</div></div></div>' +
    '</div>' +
    '<div class="col">' +
    '<div class="box"><h2>② 申請の中身</h2><div id="lines"></div><div class="sum" id="sum"></div>' +
    '<label class="lbl">ロス区分</label><select class="f" id="genre"></select>' +
    '<label class="lbl">理由 <small>（何が・なぜ・どうなったかを具体的に。例：「買取時に3点を5点で入力したため差分2点」）</small></label><textarea class="f" id="reason"></textarea>' +
    '<label class="lbl">写真 <small>（任意・4枚まで。破損・汚れなどの状態が分かるもの）</small></label><input type="file" id="ph" accept="image/*" multiple><div class="thumbs" id="thumbs"></div>' +
    '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap"><button class="b r" id="send">本部に承認を依頼する</button><button class="b g" id="clear">入力をクリア</button></div>' +
    '<div id="result"></div>' +
    '<div class="hint">承認されたら、マイカの「ロス」→「新規登録」でロスを登録し、<b>理由の欄に申請番号（L から始まる番号）</b>を入れてください。承認のないロスは毎晩22時に本部へ警告が届きます。</div>' +
    '</div></div></div></div></div>';
  var $ = function (s) { return R.querySelector(s); };
  $('#close').onclick = function () { clearInterval(S.pollT); host.remove(); };
  $('#staff').value = S.staff;
  $('#staff').onchange = function () { S.staff = this.value.trim(); try { localStorage.setItem('ndk_loss_staff', S.staff); } catch (e) { } };
  $('#reload').onclick = function () { loadList(); };
  $('#fb').onclick = function () { window.open(FB_URL + '?tool=' + encodeURIComponent('ロス申請') + '&store=' + encodeURIComponent(SHORT[S.sid] || ''), '_blank'); };
  $('#q').oninput = function () { clearTimeout(S.searchT); var v = this.value.trim(); S.searchT = setTimeout(function () { search(v); }, 400); };
  $('#clear').onclick = function () { resetForm(); $('#result').innerHTML = ''; };
  $('#send').onclick = submit;
  $('#ph').onchange = function () {
    var files = Array.prototype.slice.call(this.files || []).slice(0, 4 - S.photos.length);
    Promise.all(files.map(shrink)).then(function (a) { a.forEach(function (x) { if (x) S.photos.push(x); }); drawPhotos(); });
    this.value = '';
  };

  /* ---------- 初期化 ---------- */
  (async function init() {
    try {
      var all = await api('/api/store/all');
      S.stores = (all.stores || []).filter(function (s) { return SHORT[s.id] && SHORT[s.id] !== '通販'; });
      var hdr = document.body.innerText.match(/店舗：\s*([^\n​]+)/); var hname = hdr ? hdr[1].trim() : '';
      var cur = S.stores.find(function (s) { return hname && hname.indexOf(s.display_name) >= 0; }) ||
        S.stores.find(function (s) { return hname.indexOf(SHORT[s.id]) >= 0; }) || S.stores[0];
      $('#store').innerHTML = S.stores.map(function (s) { return '<option value="' + s.id + '"' + (s.id === cur.id ? ' selected' : '') + '>' + esc(SHORT[s.id] || s.display_name) + '</option>'; }).join('');
      $('#store').onchange = function () { S.sid = Number(this.value); S.lines = []; drawLines(); loadGenres(); loadList(); search($('#q').value.trim()); };
      S.sid = cur.id;
      drawLines(); loadGenres(); loadList();
    } catch (e) { $('#body').innerHTML = '<div class="msg err">読み込みに失敗しました：' + esc(e.message) + '<br>マイカにログインした状態で、もう一度ボタンを押してください。</div>'; }
  })();

  async function loadGenres() {
    try { S.genres = ((await api('/api/store/' + S.sid + '/loss/genre')) || []).filter(function (g) { return !g.is_deleted && g.display_name; }); } catch (e) { S.genres = []; }
    $('#genre').innerHTML = '<option value="">（選んでください）</option>' + S.genres.map(function (g) { return '<option>' + esc(g.display_name) + '</option>'; }).join('');
  }

  /* ---------- 検索 ---------- */
  async function search(v) {
    if (!v || v.length < 2) { $('#res').innerHTML = '<div class="msg">商品名を2文字以上入れてください（この店の在庫から探します）</div>'; return; }
    $('#res').innerHTML = '<div class="msg">検索中…</div>';
    try {
      var j = await api('/api/store/' + S.sid + '/product?is_active=true&stock_number_gte=1&take=40&skip=0&display_name=' + encodeURIComponent(v));
      S.results = (j && j.products) || [];
      if (!S.results.length) { $('#res').innerHTML = '<div class="msg">在庫のある商品が見つかりませんでした</div>'; return; }
      $('#res').innerHTML = S.results.map(function (p, i) {
        return '<div class="it">' + (p.image_url ? '<img src="' + esc(p.image_url) + '" loading="lazy">' : '<span class="noimg"></span>') +
          '<div class="g"><div class="n">' + esc(p.displayNameWithMeta || p.display_name) + '</div><div class="m">' +
          (p.condition_option_display_name ? '<span class="pill">' + esc(p.condition_option_display_name) + '</span>' : '') +
          '在庫 ' + (p.stock_number || 0) + '　販売 ' + yen(price(p)) + '　原価 ' + yen(p.average_wholesale_price) + '</div></div>' +
          '<button class="b s" data-add="' + i + '">追加</button></div>';
      }).join('');
      R.querySelectorAll('[data-add]').forEach(function (b) { b.onclick = function () { add(S.results[Number(b.dataset.add)]); }; });
    } catch (e) { $('#res').innerHTML = '<div class="msg err">検索できませんでした：' + esc(e.message) + '</div>'; }
  }
  function add(p) {
    var ex = S.lines.find(function (x) { return x.id === p.id; });
    if (ex) { if (ex.count < (p.stock_number || 99)) ex.count++; }
    else S.lines.push({ id: p.id, name: p.displayNameWithMeta || p.display_name, cond: p.condition_option_display_name || '', price: price(p), cost: Number(p.average_wholesale_price || 0), stock: p.stock_number || 0, img: p.image_url || '', count: 1 });
    drawLines();
  }

  /* ---------- 申請の中身 ---------- */
  function drawLines() {
    if (!S.lines.length) { $('#lines').innerHTML = '<div class="msg">左の検索から商品を「追加」してください</div>'; $('#sum').innerHTML = ''; return; }
    $('#lines').innerHTML = S.lines.map(function (x, i) {
      return '<div class="it">' + (x.img ? '<img src="' + esc(x.img) + '">' : '<span class="noimg"></span>') +
        '<div class="g"><div class="n">' + esc(x.name) + '</div><div class="m">' + (x.cond ? '<span class="pill">' + esc(x.cond) + '</span>' : '') +
        '販売 ' + yen(x.price) + '　原価 ' + yen(x.cost) + '　在庫 ' + x.stock + '</div></div>' +
        '<div class="cnt"><input type="number" min="1" value="' + x.count + '" data-c="' + i + '"><span>点</span></div>' +
        '<button class="b s g" data-del="' + i + '">削除</button></div>';
    }).join('');
    R.querySelectorAll('[data-c]').forEach(function (inp) { inp.onchange = function () { var n = Math.max(1, Math.floor(Number(inp.value) || 1)); S.lines[Number(inp.dataset.c)].count = n; drawLines(); }; });
    R.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { S.lines.splice(Number(b.dataset.del), 1); drawLines(); }; });
    var c = 0, t = 0, w = 0; S.lines.forEach(function (x) { c += x.count; t += x.price * x.count; w += x.cost * x.count; });
    $('#sum').innerHTML = '<span>合計 <span class="big">' + c + '</span> 点</span><span>販売価格 <span class="big">' + yen(t) + '</span></span><span style="color:#777">原価 ' + yen(w) + '</span>';
  }
  function drawPhotos() {
    $('#thumbs').innerHTML = S.photos.map(function (b, i) { return '<span><img src="data:image/jpeg;base64,' + b + '"><i data-p="' + i + '">×</i></span>'; }).join('');
    R.querySelectorAll('[data-p]').forEach(function (x) { x.onclick = function () { S.photos.splice(Number(x.dataset.p), 1); drawPhotos(); }; });
  }
  function shrink(f) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () { var im = new Image(); im.onload = function () { var s = Math.min(1, 1400 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.8).split(',')[1]); }; im.onerror = function () { res(''); }; im.src = fr.result; };
      fr.onerror = function () { res(''); }; fr.readAsDataURL(f);
    });
  }
  function resetForm() { S.lines = []; S.photos = []; $('#reason').value = ''; $('#genre').value = ''; drawLines(); drawPhotos(); }

  async function submit() {
    if (S.sending) return;
    var out = $('#result');
    var staff = $('#staff').value.trim(), reason = $('#reason').value.trim();
    var errs = [];
    if (!staff) errs.push('上の「申請者」に名前を入れてください');
    if (!S.lines.length) errs.push('ロスする商品を追加してください');
    if (S.genres.length && !$('#genre').value) errs.push('ロス区分を選んでください');
    if (reason.length < 8) errs.push('理由を具体的に書いてください（8文字以上）');
    if (errs.length) { out.innerHTML = '<div class="st ng">' + errs.map(esc).join('<br>') + '</div>'; return; }
    S.staff = staff; try { localStorage.setItem('ndk_loss_staff', staff); } catch (e) { }
    S.sending = true; $('#send').disabled = true; out.innerHTML = '<div class="st wait">送信中…</div>';
    try {
      var body = { action: 'loss', store: SHORT[S.sid], requester: staff, genre: $('#genre').value, reason: reason,
        lines: S.lines.map(function (x) { return { name: x.name, cond: x.cond, count: x.count, price: x.price, cost: x.cost }; }), photos: S.photos };
      var j = await fetch(GAS, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); });
      if (!j.ok) throw new Error(j.error || '送信できませんでした');
      resetForm();
      out.innerHTML = '<div class="st wait">LINE WORKSの「ロス申請」グループに承認を依頼しました。<br><span class="code">' + esc(j.id) + '</span><br>役員が承認すると、下の「最近の申請」に ✅ が付きます。</div>' + (j.imageErr ? '<div class="st ng">写真の送信に失敗しました。LINE WORKSのグループに直接送ってください。</div>' : '');
      loadList();
    } catch (e) { out.innerHTML = '<div class="st ng">送信できませんでした：' + esc(e.message) + '</div>'; }
    finally { S.sending = false; $('#send').disabled = false; }
  }

  /* ---------- 最近の申請 ---------- */
  async function loadList() {
    clearInterval(S.pollT);
    try {
      var j = await gas({ action: 'llist', store: SHORT[S.sid] });
      S.list = j.list || [];
      if (!j.channel) $('#result').innerHTML = '<div class="st ng">本部の準備中です（「ロス申請」グループがまだ登録されていません）</div>';
      drawList();
      if (S.list.some(function (x) { return x.status === '承認待ち'; })) S.pollT = setInterval(loadList, 15000);
    } catch (e) { $('#list').innerHTML = '<div class="msg err">読み込めませんでした：' + esc(e.message) + '</div>'; }
  }
  function drawList() {
    if (!S.list.length) { $('#list').innerHTML = '<div class="msg">この店の申請はまだありません</div>'; return; }
    $('#list').innerHTML = S.list.map(function (x) {
      var cls = x.status === '承認' ? 'ok' : x.status === '差し戻し' ? 'ng' : 'wait';
      var lab = x.status === '承認' ? '✅ 承認' + (x.by ? '（' + x.by + '）' : '') : x.status === '差し戻し' ? '↩️ 差し戻し' + (x.by ? '（' + x.by + '）' : '') : '⏳ 承認待ち';
      var done = x.myca ? '<span class="tag gr">マイカ登録済み</span>' : (x.status === '承認' ? '<span class="tag wait">マイカに未登録</span>' : '');
      return '<div class="rq"><div class="h"><b>' + esc(x.id) + '</b><span class="tag ' + cls + '">' + esc(lab) + '</span>' + done +
        (x.status === '承認' && !x.myca ? '<button class="b s" data-cp="' + esc(x.id) + '">番号をコピー</button>' : '') + '</div>' +
        '<div class="t">' + esc(hm(x.at) + '　' + x.requester + '　' + (x.genre || '') + '　' + x.count + '点・' + yen(x.total) + '\n理由：' + x.reason + '\n' + x.text) + '</div></div>';
    }).join('');
    R.querySelectorAll('[data-cp]').forEach(function (b) {
      b.onclick = function () { var v = b.dataset.cp; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { b.textContent = 'コピーしました'; }).catch(function () { b.textContent = v; }); };
    });
  }
})();
