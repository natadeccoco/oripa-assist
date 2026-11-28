/* ナタデココ 宅配見積書 → RECORE 入力（RECOREの宅配買取ケース画面で動くブックマークレット本体）
 * 見積書スプレッドシート（宅配買取ナタデココ🧊お見積りシート）のお客様タブを読み、
 * カード名からRECOREの商品を探して、明細（数量・単価・状態・備考）をまとめて入れる。
 * RECOREに無いカードは新規登録（買取サイトの画像を商品画像に。PSAは鑑定品とわかる画像を作る）。
 * 見積書には一切書き込まない。RECOREへの入力は「入力する」を押したときだけ。 */
(function () {
  'use strict';
  var VERSION = '2026-11-28 版C';
  var GAS = 'https://script.google.com/macros/s/AKfycbzF8w_dSwEnHnzhNUna2Q3FV9G7-U2X4z4ijguvs3kFLLK61PHc-HUXOGFm3_ZbJraeuQ/exec';
  var FB_URL = 'https://script.google.com/macros/s/AKfycbwl-ZCZ1LyefvSzEGkBEpTFTuFyvW0p-AYye6jBWaLP9t7-bC9_Owfeh4jKScNkFys6Fw/exec';
  var SITE_ITEMS = ['https://natadeccoco.github.io/kaitori-site/data/items.json'];
  var SINGLE_CAT = 34;             // ポケモン > シングル
  var GRADES = [[2, '中古A'], [7, '中古A-'], [3, '中古B'], [4, '中古C'], [5, '中古D'], [6, '未使用'], [1, '新品']];
  var HOST_ID = 'ndk-takuhai-host';

  if (location.hostname !== 'app.recore-pos.com') { window.alert('RECORE（app.recore-pos.com）の宅配買取のケース画面を開いてから押してください'); return; }
  var old = document.getElementById(HOST_ID); if (old) old.remove();

  var R = window.$nuxt && window.$nuxt.$resource;
  var S = { caseId: null, cs: null, tabs: [], tab: null, rows: [], siteItems: null, psaCat: null, busy: false };

  /* ---------- 小物 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function yen(n) { return n == null ? '—' : '¥' + Math.round(Number(n) || 0).toLocaleString(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function nfkc(s) { return String(s == null ? '' : s).normalize('NFKC'); }
  /* 比較用：全角→半角、空白・カッコ類・「グレード別グロス」などを除く */
  function norm(s) {
    return nfkc(s).toLowerCase()
      .replace(/グレード別\s*グロス|グロス/g, '')
      .replace(/[\s　【】\[\]{}()（）「」『』〔〕<>・,、。:：]/g, '')
      .replace(/[‐－―ー−-]/g, '-');
  }
  function cardNo(s) { var m = nfkc(s).match(/(\d{1,3})\s*\/\s*(\d{1,3})/); return m ? Number(m[1]) + '/' + Number(m[2]) : ''; }   // 008/076 と 8/76 を同じに扱う
  function rawNo(s) { var m = nfkc(s).match(/(\d{1,3})\s*\/\s*(\d{1,3})/); return m ? m[1] + '/' + m[2] : ''; }
  /* 検索用のカード名：カッコの中・PSA・番号・弾の記号を除く */
  function cleanName(s) {
    return nfkc(s).replace(/[\(（\[【{][^)）\]】}]*[\)）\]】}]/g, ' ').replace(/PSA\s*\d{1,2}/ig, ' ').replace(/鑑定(品|済)?/g, ' ')
      .replace(/(\d{1,3})\s*\/\s*(\d{1,3})/g, ' ').replace(/グレード別\s*グロス|グロス/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function psaOf(s) { var m = nfkc(s).match(/PSA\s*(\d{1,2})/i); return m ? Number(m[1]) : 0; }
  function baseName(s) {
    return norm(nfkc(s).replace(/(\d{1,3})\s*\/\s*(\d{1,3})/g, '').replace(/PSA\s*\d{1,2}/ig, '').replace(/鑑定(品|済)?/g, '').replace(/[\(（][^)）]*[\)）]/g, ''));
  }
  function gradeOf(state) {
    var s = nfkc(state).replace(/\s/g, '').toUpperCase();
    if (!s) return 2;
    if (/^A[-−ー]/.test(s)) return 7;
    if (/^A/.test(s) || s === 'S') return 2;
    if (/^B/.test(s)) return 3;
    if (/^C/.test(s)) return 4;
    if (/^D/.test(s)) return 5;
    if (/未使用/.test(s)) return 6;
    if (/新品|未開封/.test(s)) return 1;
    return 2;
  }
  /* ---------- お客様名の突き合わせ ---------- */
  function hira(s) { return nfkc(s).replace(/[\u30a1-\u30f6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }).replace(/[\s　]/g, ''); }
  function tabPerson(t) { var m = nfkc(t).match(/^(.*?)(様|さま|さん)/); return m ? m[1].replace(/^\d+\/\d+\s*/, '') : ''; }
  function tabCode(t) { var m = nfkc(t).match(/W\d{4}-\d{3}/); return m ? m[0] : ''; }
  function tabDate(t) {
    var m = nfkc(t).match(/(\d{1,2})[\/.](\d{1,2})/); if (!m) return null;
    var now = new Date(), d = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (d - now > 60 * 864e5) d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  function kanaTxt() { var k = (S.cs.lastKana || '') + (S.cs.firstKana || ''); return k ? '（' + k + '）' : ''; }
  function caseDate() { var t = S.cs.offeredAt || S.cs.createdAt; return t ? new Date(t * 1000) : null; }
  /* 戻り値 {level:'ok'|'warn', why:[...]} */
  function nameCheck(title) {
    var cs = S.cs, why = [], ok = false;
    var code = tabCode(title);
    var memo = [cs.note, cs.customerNote, cs.offerComment].join(' ');
    if (code) {
      if (memo.indexOf(code) >= 0) { ok = true; why.push('受付コード ' + code + ' がRECOREのケースに入っています'); }
      else why.push('タブは受付コード ' + code + ' ですが、RECOREのケースにこのコードがありません');
    }
    var person = hira(tabPerson(title));
    var keys = [cs.lastName, cs.firstName, cs.lastKana, cs.firstKana, (cs.lastName || '') + (cs.firstName || ''), (cs.lastKana || '') + (cs.firstKana || '')]
      .map(hira).filter(function (k) { return k.length >= 1; });
    if (person) {
      var hit = keys.some(function (k) { return person.indexOf(k) >= 0 || (person.length >= 2 && k.indexOf(person) >= 0); });
      if (hit) { ok = true; why.push('名前が一致：見積書「' + tabPerson(title) + '」／RECORE「' + custName() + kanaTxt() + '」'); }
      else { ok = false; why.push('名前が違います：見積書「' + tabPerson(title) + '」／RECORE「' + custName() + kanaTxt() + '」'); }
    } else if (!code) why.push('タブ名にお客様の名前がありません');
    var td = tabDate(title), cd = caseDate();
    if (td && cd) {
      var days = Math.round(Math.abs(td - new Date(cd.getFullYear(), cd.getMonth(), cd.getDate())) / 864e5);
      if (days > 10) { ok = false; why.push('日付が離れています：見積書 ' + (td.getMonth() + 1) + '/' + td.getDate() + '／RECOREの申込 ' + (cd.getMonth() + 1) + '/' + cd.getDate() + '（' + days + '日差）'); }
    }
    return { level: ok ? 'ok' : 'warn', why: why };
  }
  function list(r) { var d = r && r.data; return Array.isArray(d) ? d : ((d && (d.data || d.entries || d.items)) || []); }
  function errText(e) {
    var d = e && e.response && e.response.data;
    return (d && (d.message || d.error || (d.errors && JSON.stringify(d.errors)))) || (e && e.message) || String(e);
  }

  /* ---------- 通信 ---------- */
  async function gas(params) {
    var key = ''; try { key = localStorage.getItem('ndk_takuhai_key') || ''; } catch (e) { }
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var r = await fetch(GAS + '?key=' + encodeURIComponent(key) + '&' + q);
    var j = await r.json();
    if (!j.ok) throw new Error(j.error || '見積書を読めませんでした');
    return j;
  }
  var searchCache = {};
  /* RECOREの商品検索。pages ページまで（1ページ30件）めくる */
  async function search(kw, pages) {
    kw = nfkc(kw).replace(/\s+/g, ' ').trim();
    pages = pages || 1;
    if (!kw) return [];
    var ck = kw + '#' + pages;
    if (searchCache[ck]) return searchCache[ck];
    var all = [];
    for (var pg = 1; pg <= pages; pg++) {
      var l = list(await R.get('/products?keyword=' + encodeURIComponent(kw) + '&limit=30&page=' + pg + '&statuses=ACTIVE'));
      all = all.concat(l);
      if (l.length < 30) break;
    }
    return (searchCache[ck] = all);
  }
  async function loadCase() {
    S.cs = (await R.get('/bad_cases/' + S.caseId)).data;
    return S.cs;
  }
  async function siteItems() {
    if (S.siteItems) return S.siteItems;
    for (var i = 0; i < SITE_ITEMS.length; i++) {
      try { var j = await (await fetch(SITE_ITEMS[i])).json(); S.siteItems = j.items || []; return S.siteItems; } catch (e) { }
    }
    return (S.siteItems = []);
  }
  async function psaCategory() {
    if (S.psaCat) return S.psaCat;
    var l = await search('PSA10鑑定済');
    var p = l.find(function (x) { return x.category && /鑑定/.test(x.category.name); });
    S.psaCat = p ? p.category.id : SINGLE_CAT;
    return S.psaCat;
  }

  /* ---------- 照合 ---------- */
  async function matchRow(row) {
    var name = row.name, no = cardNo(name), rno = rawNo(name), psa = psaOf(name), base = baseName(name), cn = cleanName(name);
    var at = nfkc(name).match(/@\s*\d+/);
    // 検索する言葉（上から順に。見つかった候補は全部まとめて、あとで絞り込む）
    var kws = [];
    if (cn && rno) kws.push([cn + ' ' + rno, 1]);
    kws.push([name, 1]);
    if (cn && cn !== name) kws.push([cn, 3]);
    if (rno) kws.push([rno, 5]);
    if (no && no !== rno) kws.push([no, 5]);
    if (at) kws.push([at[0].replace(/\s/g, ''), 1]);
    var seen = {}, cands = [];
    for (var i = 0; i < kws.length; i++) {
      var l = await search(kws[i][0], kws[i][1]);
      l.forEach(function (p) { if (!seen[p.id]) { seen[p.id] = 1; cands.push(p); } });
    }
    cands = cands.filter(function (p) {
      var t = nfkc(p.title);
      var isPsa = /PSA|鑑定/.test(t);
      if (psa) { if (!new RegExp('PSA\\s*' + psa + '(?!\\d)', 'i').test(t)) return false; }
      else if (isPsa) return false;
      return true;
    });
    cands.forEach(function (p) {
      var bt = baseName(p.title), tno = cardNo(p.title), sc = 0;
      var nameHit = base && bt && (bt.indexOf(base) >= 0 || base.indexOf(bt) >= 0);
      if (nameHit) sc += 2;
      if (no) { if (tno === no) sc += 2; else if (tno) sc -= 3; }   // 番号が違うカードは下げる
      if (norm(p.title) === norm(name)) sc += 2;
      p._score = sc;
      p._ok = no ? (tno === no && nameHit) : nameHit;   // 名前も番号も合う＝確実
    });
    cands = cands.filter(function (p) { return p._score > 0; });
    cands.sort(function (a, b) { return b._score - a._score; });
    var sure = cands.filter(function (p) { return p._ok; });
    row.cands = cands.slice(0, 10);
    if (sure.length === 1 || (sure.length > 1 && sure[0]._score > sure[1]._score)) { row.pick = String(sure[0].id); row.how = 'auto'; }
    else if (cands.length) { row.pick = String(cands[0].id); row.how = 'choose'; }
    else { row.pick = 'new'; row.how = 'new'; }
    row.psa = psa; row.cno = no;
  }

  /* 買取サイトのデータから画像を探す */
  async function findImage(row) {
    var items = await siteItems();
    var no = row.cno, base = baseName(row.name);
    var hits = items.filter(function (it) { return it.img && (!no || cardNo(it.no) === no); });
    var best = null, score = -1;
    hits.forEach(function (it) {
      var b = baseName(it.name), sc = 0;
      if (b && base && (b.indexOf(base) >= 0 || base.indexOf(b) >= 0)) sc = 2;
      if (!no && sc < 2) return;
      if ((it.grade === 'PSA10') === !!row.psa) sc += 0.5;
      if (sc > score) { score = sc; best = it; }
    });
    return best && score >= (no ? 0 : 2) ? best.img : '';
  }

  /* 画像を作る：通常はカード画像そのまま（JPEG）、PSAは鑑定品とわかる帯付き */
  async function makeImage(row) {
    var url = await findImage(row);
    var bmp = null;
    if (url) { try { bmp = await createImageBitmap(await (await fetch(url)).blob()); } catch (e) { bmp = null; } }
    if (!bmp && !row.psa) return null;
    var c = document.createElement('canvas'), g = c.getContext('2d');
    if (!row.psa) {
      c.width = bmp.width; c.height = bmp.height; g.drawImage(bmp, 0, 0);
    } else {
      var W = 640, H = 1060; c.width = W; c.height = H;
      var gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#eef1f5'); gr.addColorStop(1, '#cfd6df');
      g.fillStyle = gr; roundRect(g, 0, 0, W, H, 36); g.fill();
      g.fillStyle = '#fff'; g.fillRect(34, 34, W - 68, 190);
      g.strokeStyle = '#c8102e'; g.lineWidth = 10; g.strokeRect(39, 39, W - 78, 180);
      g.fillStyle = '#c8102e'; g.font = '900 96px "Arial Black", Arial, sans-serif'; g.textBaseline = 'middle';
      g.fillText('PSA ' + row.psa, 66, 112);
      g.fillStyle = '#1d1d22'; g.font = '700 30px "Yu Gothic UI", Meiryo, sans-serif';
      g.fillText(clip(g, nfkc(row.name).replace(/PSA\s*\d+/ig, '').replace(/鑑定(品|済)?/g, '').trim(), W - 140), 66, 186);
      g.fillStyle = '#c8102e'; g.font = '900 34px "Yu Gothic UI", Meiryo, sans-serif'; g.textAlign = 'right';
      g.fillText('鑑定品', W - 66, 112); g.textAlign = 'left';
      var bx = 62, by = 256, bw = W - 124, bh = H - by - 50;
      g.fillStyle = '#fff'; g.fillRect(bx - 8, by - 8, bw + 16, bh + 16);
      if (bmp) {
        var r = Math.min(bw / bmp.width, bh / bmp.height), dw = bmp.width * r, dh = bmp.height * r;
        g.drawImage(bmp, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh);
      } else {
        g.fillStyle = '#9aa3ad'; g.font = '700 34px "Yu Gothic UI", Meiryo, sans-serif'; g.textAlign = 'center';
        g.fillText('画像なし', W / 2, by + bh / 2); g.textAlign = 'left';
      }
    }
    return await new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.9); });
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function clip(g, s, w) { if (g.measureText(s).width <= w) return s; while (s.length && g.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }

  async function uploadImage(blob) {
    var r = await R.post('/files/public', { mimeType: blob.type });
    var u = r.data && r.data.url;
    var put = await fetch(u, { method: 'PUT', body: blob });
    if (!put.ok) throw new Error('画像のアップロードに失敗しました（' + put.status + '）');
    return u.split('?')[0];
  }
  function newTitle(row) {
    var n = nfkc(row.name).replace(/\s+/g, ' ').trim();
    if (!row.psa) return n;
    var b = n.replace(/PSA\s*\d+/ig, '').replace(/鑑定(品|済)?/g, '').replace(/(\d{1,3})\s*\/\s*(\d{1,3})/g, '').replace(/\s+/g, ' ').trim();
    return '〔PSA' + row.psa + '鑑定済〕' + b + (rawNo(row.name) ? '{' + rawNo(row.name) + '}' : '');
  }
  async function createProduct(row) {
    var imgs = [];
    try { var blob = await makeImage(row); if (blob) imgs.push(await uploadImage(blob)); } catch (e) { row.imgErr = errText(e); }
    var body = {
      status: 'ACTIVE', title: newTitle(row), categoryId: row.psa ? await psaCategory() : SINGLE_CAT,
      grossMode: 'GRADE', hasAmount: false, taxRateType: 'GENERAL', taxFreeType: 'GENERAL', attribute: {}, imageUrls: imgs
    };
    var r = await R.post('/products', body);
    return r.data;
  }

  /* ---------- CSV（RECOREの「商品をエクスポート」と同じ列） ---------- */
  var HEAD = ['ID', '商品コード', 'JANコード', '商品名', '数量', '重量', '買取単価', '販売単価', 'グレードID', 'コンディションタグID', 'コンディション詳細', '商品メモ', '棚番号', 'ロケーションID', '単品不成約', 'PSAシリアル:custom_psa_number', 'ハッシュ'];
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function buildCsv(lines) {
    return [HEAD].concat(lines.map(function (l) {
      return ['', l.code, '', l.title, l.qty, '', l.price, 0, l.grade, '', l.note, '', '', 1, '', '', ''];
    })).map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }

  /* ---------- 画面 ---------- */
  var host = document.createElement('div'); host.id = HOST_ID;
  host.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000');
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box}' +
    '.bg{position:fixed;inset:0;background:rgba(15,23,42,.45)}' +
    '.pn{position:fixed;top:3vh;left:50%;transform:translateX(-50%);width:min(1180px,96vw);max-height:94vh;display:flex;flex-direction:column;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);font:14px/1.6 "Hiragino Sans","Yu Gothic UI",Meiryo,sans-serif;color:#1d1d22;overflow:hidden}' +
    '.hd{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#1d1d22;color:#fff}.hd b{font-size:16px}.hd .v{opacity:.6;font-size:11px}.sp{flex:1}' +
    'button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:7px 14px;background:#e5e7eb;color:#1d1d22;font-weight:700}' +
    'button.p{background:#c8102e;color:#fff}button.p:disabled{background:#e9a3ae;cursor:default}button.g{background:#2563eb;color:#fff}' +
    '.fbb{background:#2563eb;color:#fff;border-radius:999px;font-size:12px}' +
    '.bd{padding:14px 16px;overflow:auto}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}' +
    'select,input{font:inherit;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1d1d22}' +
    'table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #eef0f3;padding:6px;text-align:left;vertical-align:middle}th{background:#f8fafc;position:sticky;top:0;z-index:1}' +
    'td.n{text-align:right;white-space:nowrap}.pick{max-width:380px;width:calc(100% - 80px)}' +
    '.chip{display:inline-block;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:700;white-space:nowrap}' +
    '.ok{background:#dcfce7;color:#166534}.ch{background:#fef3c7;color:#92400e}.nw{background:#dbeafe;color:#1e40af}.sk{background:#f1f5f9;color:#64748b}.ng{background:#fee2e2;color:#991b1b}' +
    '.msg{padding:10px 12px;border-radius:10px;margin:8px 0}.msg.e{background:#fee2e2;color:#991b1b}.msg.i{background:#f1f5f9}.msg.s{background:#dcfce7;color:#166534}' +
    '.ft{display:flex;gap:10px;align-items:center;padding:12px 16px;border-top:1px solid #eef0f3;background:#fafafa}.tot{font-weight:700}' +
    'img.th{width:34px;height:46px;object-fit:contain;background:#f1f5f9;border-radius:4px}.mut{color:#64748b;font-size:12px}' +
    'button.sbtn{margin-left:6px;padding:5px 10px;font-size:12px;background:#eef2ff;color:#3730a3}.sbox{background:#f8fafc;border:1px solid #c7d2fe;border-radius:10px;padding:10px}' +
    '.sr{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:5px 2px;border-bottom:1px solid #eef0f3}.sr button{padding:4px 10px;font-size:12px;white-space:nowrap}tr.srow td{border-bottom:2px solid #c7d2fe}' +
    '</style><div class="bg"></div><div class="pn">' +
    '<div class="hd"><b>見積書からRECOREに入力</b><span class="v">' + VERSION + '</span><span class="sp"></span><button id="fb" class="fbb">意見を送る</button><button id="close">閉じる ×</button></div>' +
    '<div class="bd" id="bd"></div><div class="ft" id="ft"></div></div>';
  var $ = function (q) { return root.querySelector(q); };
  $('#close').onclick = function () { if (!S.busy) host.remove(); };
  $('#fb').onclick = function () { window.open(FB_URL + '?tool=' + encodeURIComponent('宅配見積書→RECORE入力') + '&store=' + encodeURIComponent('中野'), '_blank'); };
  function body(h) { $('#bd').innerHTML = h; }
  function foot(h) { $('#ft').innerHTML = h; }
  function fail(m) { body('<div class="msg e">' + esc(m) + '</div>'); foot(''); }

  /* ---------- 流れ ---------- */
  async function start() {
    if (!R) return fail('RECOREの画面がまだ読み込まれていません。少し待ってからもう一度押してください。');
    var m = location.pathname.match(/^\/bad\/case\/(\d+)/);
    if (!m) return fail('宅配買取のケース画面（宅配買取 → ケースリスト → お客様のケース）を開いてから押してください。');
    S.caseId = m[1];
    body('<div class="msg i">ケースと見積書を読み込んでいます…</div>');
    try { await loadCase(); } catch (e) { return fail('ケースを読み込めませんでした：' + errText(e)); }
    var live = (S.cs.goods || []).filter(function (g) { return !g.isCanceled; });
    if ((S.cs.goods || []).length) {
      return fail('このケースにはすでに買取商品が ' + S.cs.goods.length + ' 件入っています（不成約' + (S.cs.goods.length - live.length) + '件を含む）。二重入力を防ぐため、このツールは買取商品が空のケースだけで使えます。');
    }
    var key = ''; try { key = localStorage.getItem('ndk_takuhai_key') || ''; } catch (e) { }
    if (!key) return askKey();
    try { S.tabs = (await gas({ action: 'list' })).tabs; }
    catch (e) { if (/合言葉/.test(e.message)) return askKey(true); return fail(e.message); }
    chooseTab();
  }
  function askKey(wrong) {
    body((wrong ? '<div class="msg e">合言葉が違うようです。</div>' : '') +
      '<p>初回だけ、見積書を読むための<b>合言葉</b>を入れてください（本部から聞いてください）。このパソコンに保存され、次からは聞かれません。</p>' +
      '<div class="row"><input id="key" placeholder="合言葉" style="width:260px"><button class="g" id="ksv">保存</button></div>');
    foot('');
    $('#ksv').onclick = function () { try { localStorage.setItem('ndk_takuhai_key', $('#key').value.trim()); } catch (e) { } start(); };
  }
  function custName() { return ((S.cs.lastName || '') + (S.cs.firstName || '')).trim(); }
  function chooseTab() {
    var ln = (S.cs.lastName || '').trim();
    var mine = S.tabs.filter(function (t) { return nameCheck(t.title).level === 'ok'; });
    var opts = function (arr) { return arr.map(function (t) { return '<option value="' + esc(t.title) + '">' + esc(t.title) + '</option>'; }).join(''); };
    body('<div class="row"><b>ケース：</b>' + esc(S.cs.code) + '　<b>お客様：</b>' + esc(custName() || '（名前なし）') + '</div>' +
      '<div class="row"><b>見積書のタブ：</b><select id="tab" style="min-width:320px">' +
      (mine.length ? '<optgroup label="お客様の名前・日付が合うタブ">' + opts(mine) + '</optgroup>' : '') +
      '<optgroup label="すべてのタブ（新しい順）">' + opts(S.tabs) + '</optgroup></select>' +
      '<input id="flt" placeholder="タブ名でしぼりこみ" style="width:180px"><button class="g" id="go">読み込む</button></div>' +
      (mine.length ? '' : '<div class="msg e">RECOREのお客様「' + esc(custName()) + '」と名前・日付が合う見積書のタブが見つかりませんでした。見積書がまだ無いか、タブ名が違う可能性があります。</div>'));
    foot('');
    $('#flt').oninput = function () {
      var q = this.value.trim();
      $('#tab').innerHTML = '<optgroup label="しぼりこみ">' + opts(S.tabs.filter(function (t) { return !q || t.title.indexOf(q) >= 0; })) + '</optgroup>';
    };
    $('#go').onclick = function () { loadTab($('#tab').value); };
  }
  async function loadTab(title) {
    if (!title) return;
    body('<div class="msg i">「' + esc(title) + '」を読み込んで、RECOREの商品を探しています…</div>'); foot('');
    try { S.tab = (await gas({ action: 'get', sheet: title })).tab; } catch (e) { return fail(e.message); }
    S.rows = S.tab.rows.map(function (r) {
      var skip = '';
      if (/おまかせ査定/.test(r.name)) skip = 'おまかせ査定の行';
      else if ((r.price == null || r.price === '') && S.tab.layout === 'satei') skip = '査定金額が空欄';
      else if (r.price == null || r.price === '') skip = '金額が空欄';
      else if (!r.qty) skip = '数量が空欄';
      else if (Number(r.price) === 0) skip = '査定金額 0円（買い取らない）';
      return { no: r.no, name: r.name, price: r.price, applied: r.applied, qty: r.qty, state: r.state, note: r.note, grade: gradeOf(r.state), skip: skip, cno: cardNo(r.name), psa: psaOf(r.name) };
    });
    var todo = S.rows.filter(function (r) { return !r.skip; });
    var done = 0;
    async function worker() {
      while (todo.length) {
        var r = todo.shift();
        try { await matchRow(r); } catch (e) { r.pick = 'new'; r.how = 'new'; r.cands = []; r.err = errText(e); }
        done++; var el = $('#bd .msg'); if (el) el.textContent = 'RECOREの商品を探しています… ' + done + '/' + S.rows.filter(function (x) { return !x.skip; }).length;
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    render();
    S.rows.filter(function (r) { return r.how === 'new'; }).forEach(async function (r) {
      r.imgUrl = await findImage(r).catch(function () { return ''; });
      var td = root.querySelector('[data-img="' + S.rows.indexOf(r) + '"]');
      if (td) td.innerHTML = r.imgUrl ? '<img class="th" src="' + esc(r.imgUrl) + '">' : '<span class="mut">画像なし</span>';
    });
  }
  function status(r) {
    if (r.skip) return '<span class="chip sk">入力しない</span>';
    if (r.pick === 'skip') return '<span class="chip sk">入力しない</span>';
    if (r.pick === 'new') return '<span class="chip nw">🆕 新規登録</span>';
    if (r.how === 'auto') return '<span class="chip ok">✅ 一致</span>';
    if (r.how === 'manual') return '<span class="chip ok">🔍 検索で選択</span>';
    return '<span class="chip ch">⚠️ 確認</span>';
  }
  /* ---------- 手で検索（候補に正しいカードが無いとき） ---------- */
  function searchRow(i) {
    var q = S.srch;
    var res = q.res == null ? '' : (q.res.length ? q.res.map(function (p, k) {
      return '<div class="sr"><span>' + esc(p.title) + ' <span class="mut">（' + esc(p.code) + (p.category ? '・' + esc(p.category.name) : '') + '）</span></span><button class="g spick" data-k="' + k + '">これにする</button></div>';
    }).join('') : '<div class="mut">見つかりませんでした。言葉を短くする（例：カード名だけ／番号だけ）か、ひらがな・カタカナを変えて試してください。</div>');
    return '<tr class="srow"><td></td><td colspan="7"><div class="sbox">' +
      '<div class="row" style="margin:0 0 6px"><input id="sq" value="' + esc(q.q) + '" style="flex:1;min-width:260px" placeholder="カード名・番号（例：ミュウex 129/103）"><button class="g" id="sgo">検索</button><button id="sx">閉じる</button></div>' +
      '<div class="mut" style="margin-bottom:4px">カード名だけ・番号だけでも探せます。PSA は「PSA10 ミュウex」のように入れてください。</div>' +
      (q.busy ? '<div class="mut">検索中…</div>' : res) + '</div></td></tr>';
  }
  async function runSearch() {
    var q = S.srch; if (!q) return;
    q.q = ($('#sq') && $('#sq').value.trim()) || q.q;
    q.busy = true; render();
    try { q.res = (await search(q.q, 3)).slice(0, 60); } catch (e) { q.res = []; }
    q.busy = false; render();
    var el = $('#sq'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }
  function render() {
    var total = 0, n = 0;
    var trs = S.rows.map(function (r, i) {
      var use = !r.skip && r.pick !== 'skip';
      if (use) { total += (r.price || 0) * (r.qty || 0); n += r.qty || 0; }
      var pick;
      if (r.skip) pick = '<span class="mut">' + esc(r.skip) + '</span>';
      else {
        pick = '<select class="pick" data-i="' + i + '">' + (r.cands || []).map(function (p) {
          return '<option value="' + p.id + '"' + (String(r.pick) === String(p.id) ? ' selected' : '') + '>' + esc(p.title) + '（' + esc(p.code) + '）</option>';
        }).join('') +
          '<option value="new"' + (r.pick === 'new' ? ' selected' : '') + '>🆕 新規登録：' + esc(newTitle(r)) + '</option>' +
          '<option value="skip"' + (r.pick === 'skip' ? ' selected' : '') + '>入力しない</option></select>' +
          '<button class="sbtn" data-i="' + i + '" title="RECOREの商品を自分で検索する">🔍 検索</button>';
      }
      var gsel = r.skip ? '' : '<select class="gr" data-i="' + i + '">' + GRADES.map(function (g) { return '<option value="' + g[0] + '"' + (r.grade === g[0] ? ' selected' : '') + '>' + g[1] + '</option>'; }).join('') + '</select>';
      return '<tr><td class="mut">' + esc(r.no) + '</td><td>' + esc(r.name) + (r.note ? '<div class="mut">備考：' + esc(r.note) + '</div>' : '') + '</td>' +
        '<td class="n">' + (r.applied != null && Number(r.applied) !== Number(r.price) ? '<div class="mut" style="text-decoration:line-through">' + yen(r.applied) + '</div>' : '') + yen(r.price) + '</td><td class="n">' + esc(r.qty == null ? '—' : r.qty) + '</td><td>' + esc(r.state || '') + ' ' + gsel + '</td>' +
        '<td>' + status(r) + '</td><td>' + pick + '</td><td data-img="' + i + '">' + (r.pick === 'new' ? (r.imgUrl ? '<img class="th" src="' + esc(r.imgUrl) + '">' : '<span class="mut">…</span>') : '') + '</td></tr>' +
        (S.srch && S.srch.i === i ? searchRow(i) : '');
    }).join('');
    var nc = nameCheck(S.tab.title);
    var ncHtml = nc.level === 'ok'
      ? '<div class="msg s">✅ ' + nc.why.map(esc).join('<br>') + '</div>'
      : '<div class="msg e"><b>⚠️ お客様の確認が必要です</b><br>' + nc.why.map(esc).join('<br>') +
        '<br><label style="display:inline-flex;gap:6px;align-items:center;margin-top:6px;font-weight:700"><input type="checkbox" id="ncok"' + (S.ncOk === S.tab.title ? ' checked' : '') + '> RECOREのお客様と見積書を見比べて、同じお客様だと確認しました</label></div>';
    var diff = S.tab.total != null && Math.round(total) !== Math.round(S.tab.total);
    body('<div class="row"><b>ケース：</b>' + esc(S.cs.code) + '　<b>お客様：</b>' + esc(custName()) + '　<b>見積書：</b>' + esc(S.tab.title) + '　<button id="back">タブを選び直す</button></div>' +
      ncHtml + '<div class="mut">✅＝自動で一致　⚠️＝候補から正しい商品を選んでください　🆕＝RECOREに無いので新規登録します（画像は買取サイトから。PSAは鑑定品とわかる画像を作ります）。備考はRECOREの「コンディション詳細」に入ります。</div>' +
      '<table><thead><tr><th>#</th><th>見積書のカード名</th><th>' + (S.tab.layout === 'satei' ? '査定金額' : '単価') + '</th><th>数量</th><th>状態</th><th></th><th>RECOREの商品</th><th>画像</th></tr></thead><tbody>' + trs + '</tbody></table>' +
      (S.rows.some(function (r) { return r.skip === '査定金額が空欄'; }) ? '<div class="msg e"><b>査定金額が空欄の行があります。</b>見積書の「査定金額」を入れてから、「タブを選び直す」→「読み込む」でもう一度読み込んでください。（買い取らないカードは査定金額に 0 を入れてください）</div>' : '') +
      (diff ? '<div class="msg e">見積書の合計 ' + yen(S.tab.total) + ' と、入力する合計 ' + yen(total) + ' が違います。「入力しない」行や空欄の行を確認してください。</div>' : ''));
    var nBlank = S.rows.filter(function (r) { return r.skip === '査定金額が空欄'; }).length;
    var nNew = S.rows.filter(function (r) { return !r.skip && r.pick === 'new'; }).length;
    var nChk = S.rows.filter(function (r) { return !r.skip && r.how === 'choose' && !r.checked; }).length;
    foot('<span class="tot">入力する合計 ' + yen(total) + '（' + n + '点）</span>' + (S.tab.total != null ? '<span class="mut">見積書の合計 ' + yen(S.tab.total) + '</span>' : '') +
      '<span class="sp"></span>' + (nChk ? '<span class="chip ch">⚠️ 確認が ' + nChk + ' 件あります</span>' : '') +
      (nNew ? '<span class="chip nw">新規登録 ' + nNew + ' 件</span>' : '') +
      '<button class="p" id="apply">RECOREに入力する</button>');
    $('#back').onclick = chooseTab;
    if ($('#ncok')) $('#ncok').onchange = function () { S.ncOk = this.checked ? S.tab.title : null; render(); };
    if (nc.level !== 'ok' && S.ncOk !== S.tab.title) { $('#apply').disabled = true; $('#apply').title = 'お客様の確認にチェックを入れてください'; }
    if (nBlank) { $('#apply').disabled = true; $('#apply').title = '査定金額が空欄の行があります'; }
    root.querySelectorAll('select.pick').forEach(function (s) {
      s.onchange = function () { var r = S.rows[this.dataset.i]; r.pick = this.value; r.checked = true; if (r.pick === 'new' && r.imgUrl == null) { findImage(r).then(function (u) { r.imgUrl = u; render(); }); } render(); };
      s.onfocus = function () { S.rows[this.dataset.i].checked = true; };
    });
    root.querySelectorAll('select.gr').forEach(function (s) { s.onchange = function () { S.rows[this.dataset.i].grade = Number(this.value); }; });
    root.querySelectorAll('button.sbtn').forEach(function (b) {
      b.onclick = function () {
        var i = Number(this.dataset.i), r = S.rows[i];
        if (S.srch && S.srch.i === i) { S.srch = null; render(); return; }
        S.srch = { i: i, q: (cleanName(r.name) + ' ' + rawNo(r.name)).trim(), res: null };
        runSearch();
      };
    });
    if ($('#sgo')) $('#sgo').onclick = runSearch;
    if ($('#sq')) $('#sq').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } };
    if ($('#sx')) $('#sx').onclick = function () { S.srch = null; render(); };
    root.querySelectorAll('button.spick').forEach(function (b) {
      b.onclick = function () {
        var r = S.rows[S.srch.i], p = S.srch.res[Number(this.dataset.k)];
        r.cands = [p].concat((r.cands || []).filter(function (c) { return String(c.id) !== String(p.id); }));
        r.pick = String(p.id); r.how = 'manual'; r.checked = true;
        S.srch = null; render();
      };
    });
    $('#apply').onclick = function () {
      if (nameCheck(S.tab.title).level !== 'ok' && S.ncOk !== S.tab.title) return;
      if (S.rows.some(function (r) { return r.skip === '査定金額が空欄'; })) return;
      var left = S.rows.filter(function (r) { return !r.skip && r.how === 'choose' && !r.checked; });
      if (left.length) { left.forEach(function (r) { r.checked = true; }); render(); $('#ft').insertAdjacentHTML('afterbegin', '<span class="chip ch">⚠️の行の商品が正しいか見てから、もう一度押してください</span>'); return; }
      apply();
    };
  }

  async function apply() {
    if (S.busy) return; S.busy = true;
    var use = S.rows.filter(function (r) { return !r.skip && r.pick !== 'skip'; });
    var log = [];
    function step(m) { log.push(m); body('<div class="msg i">' + log.map(esc).join('<br>') + '</div>'); }
    foot('<span class="mut">入力中です。閉じないでください…</span>');
    try {
      await loadCase();
      if ((S.cs.goods || []).length) throw new Error('入力の直前に、このケースへ商品が入りました。二重入力を防ぐため中止しました。画面を更新して確認してください。');
      var lines = [];
      for (var i = 0; i < use.length; i++) {
        var r = use[i], prod;
        if (r.pick === 'new') {
          step('🆕 新規登録：' + newTitle(r));
          prod = await createProduct(r);
          if (r.imgErr) step('　（画像は付けられませんでした：' + r.imgErr + '）');
        } else {
          prod = (r.cands || []).find(function (p) { return String(p.id) === String(r.pick); });
        }
        if (!prod || !prod.code) throw new Error('商品コードが取れませんでした：' + r.name);
        lines.push({ code: prod.code, title: prod.title, qty: r.qty, price: r.price, grade: r.grade, note: r.note });
      }
      step('明細 ' + lines.length + ' 行をRECOREに取り込んでいます…');
      var fd = new FormData();
      fd.append('file', new File([buildCsv(lines)], '見積書から入力_' + S.cs.code + '.csv', { type: 'text/csv' }));
      fd.append('format', 'csv');
      await R.request({ method: 'PUT', url: '/bad_cases/' + S.caseId + '/goods/report', data: fd });
      var got = null;
      for (var t = 0; t < 30; t++) {
        await sleep(2000);
        await loadCase();
        if ((S.cs.goods || []).length >= lines.length) { got = S.cs.goods; break; }
      }
      if (!got) throw new Error('取り込みの完了を確認できませんでした。少し待ってから画面を更新し、RECOREのお知らせ（ベル）で取り込み結果を確認してください。');
      verify(lines, got);
      try { await window.$nuxt.$store.dispatch('bad/case/fetch'); } catch (e) { }
    } catch (e) {
      S.busy = false;
      body('<div class="msg e">止まりました：' + esc(errText(e)) + '</div>' + (log.length ? '<div class="msg i">' + log.map(esc).join('<br>') + '</div>' : ''));
      foot('<span class="sp"></span><button id="rl">画面を更新</button>');
      $('#rl').onclick = function () { location.reload(); };
      return;
    }
    S.busy = false;
  }
  function verify(lines, goods) {
    var want = {}, have = {};
    lines.forEach(function (l) { var k = l.code + '|' + l.price + '|' + l.grade; want[k] = (want[k] || 0) + Number(l.qty); });
    goods.forEach(function (g) { var k = g.product.code + '|' + g.unitPrice + '|' + (g.grade && g.grade.id); have[k] = (have[k] || 0) + Number(g.quantity); });
    var bad = Object.keys(want).filter(function (k) { return want[k] !== have[k]; }).concat(Object.keys(have).filter(function (k) { return !(k in want); }));
    var sum = goods.reduce(function (s, g) { return s + g.unitPrice * g.quantity; }, 0);
    body((bad.length ? '<div class="msg e">入力はできましたが、見積書と違う行があります。RECOREの画面で確認してください：<br>' + bad.map(esc).join('<br>') + '</div>'
      : '<div class="msg s">✅ 入力できました。' + goods.length + ' 行・合計 ' + yen(sum) + '（見積書の合計 ' + yen(S.tab.total) + '）</div>') +
      '<p>このあと、いつもどおりRECOREの画面で内容を確認し、見積書を送ってください。</p>');
    foot('<span class="sp"></span><button class="g" id="rl">RECOREの画面を更新して閉じる</button>');
    $('#rl').onclick = function () { location.reload(); };
  }

  start();
})();
