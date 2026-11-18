/* ナタデココ 全店在庫の自動送信（マイカ上で動く。雄司PCのChrome拡張「ナタデココ 在庫自動送信」が毎晩読み込む）2026-11-18
   全店舗在庫確認（zaiko-check.js）と同じ方法で全店の在庫を読み、買取表GASに送る。画面は右下に小さく出すだけ。 */
(async function () {
  'use strict';
  if (location.hostname !== 'pos.mycalinks.com') return;
  if (window.__ndkZaikoPushRunning) return; window.__ndkZaikoPushRunning = true;
  var POST_URL = 'https://script.google.com/macros/s/AKfycbw-wkodhT2Gmt7pTDZJJDorXAjAT5lHzndPN-FoaGFDaOt8U_YycX9CCB-hk3bzjagh/exec';
  var TOKEN = document.documentElement.getAttribute('data-ndk-zaiko-token') || '';
  var SHORT = { 322: '柏', 323: '津田沼', 324: '松戸', 325: '横浜', 326: '中野', 327: '町田', 328: '千葉中央', 390: '通販', 409: 'お台場' };
  var ORDER = [328, 322, 327, 324, 326, 409, 323, 325, 390];

  var box = document.createElement('div');
  box.setAttribute('style', 'position:fixed;right:12px;bottom:12px;z-index:2147483000;background:#1d1d22;color:#fff;font:13px sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.3)');
  box.textContent = '在庫自動送信：準備中…';
  document.body.appendChild(box);
  function say(t) { box.textContent = '在庫自動送信：' + t; }
  function done(ok, info) { window.postMessage({ ndkZaiko: 'done', ok: ok, info: info }, '*'); }

  async function api(u) {
    var r = await fetch(u, { credentials: 'include' });
    var t = await r.text(), j = null; try { j = JSON.parse(t); } catch (e) { }
    if (!r.ok) throw new Error((j && (j.error || j.message)) || ('通信エラー ' + r.status));
    return j;
  }
  async function storeProducts(sid) {
    var all = [];
    for (var skip = 0; ; skip += 500) {
      var j = await api('/api/store/' + sid + '/product?is_active=true&is_consignment_product=false&stock_number_gte=1&take=500&skip=' + skip);
      all = all.concat(j.products || []);
      if (!j.products || j.products.length < 500) break;
    }
    return all;
  }
  /* 種類の分け方は zaiko-check.js と同じ */
  function kindOf(p) {
    var h = p.item_category_handle || '', cd = p.item_category_display_name || '';
    var spec = (p.specialty__display_name || '') + ' ' + (p.specialty__handle || '') + ' ' + (p.condition_option_display_name || '');
    if (/【@\s*\d+】/.test(p.display_name || '')) return null;
    if (h === 'CARD') return /PSA/i.test(spec + ' ' + p.display_name) ? 'psa' : 'card';
    if (h === 'BOX') {
      var nm = String(p.display_name || ''), bx = /BOX|ボックス|box/i.test(nm), cost = Number(p.average_wholesale_price) || 0, mk = Number(p.item_market_price) || 0;
      if (/パック/.test(nm) && !bx) return 'pack';
      if (cost > 0) return cost < 3000 ? 'pack' : 'box';
      if (mk > 0) return mk < 3000 ? 'pack' : 'box';
      return bx ? 'box' : 'pack';
    }
    if (h === 'PACK' || /パック/.test(cd)) return 'pack';
    return null;
  }
  async function post(body) {
    body.type = 'zaiko'; body.token = TOKEN;
    await fetch(POST_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  }

  try {
    say('店舗を確認中…');
    var st = await api('/api/store/all');
    var stores = (st.stores || []).slice().sort(function (a, b) {
      var ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }).map(function (s) { return { id: s.id, name: SHORT[s.id] || String(s.display_name).replace('ナタデココ', '').replace(/本?店$/, '') }; });
    var n = 0;
    var res = await Promise.all(stores.map(function (s) {
      return storeProducts(s.id).then(function (x) { n++; say('読み込み中 ' + n + '/' + stores.length + '店'); return x; }).catch(function () { return null; });
    }));
    var failed = [], map = {};
    res.forEach(function (list, i) {
      var s = stores[i];
      if (!list) { failed.push(s.name); return; }
      list.forEach(function (p) {
        var k = kindOf(p); if (!k) return;
        var key = p.item_myca_item_id ? 'm' + p.item_myca_item_id + '|' + (k === 'psa' ? 'card' : k) : 'n' + p.display_name + '|' + (p.item_cardnumber || '') + '|' + k;
        var row = map[key];
        if (!row) row = map[key] = { kind: k, myca: p.item_myca_item_id || null, name: p.item_name || p.display_name, num: p.item_cardnumber || '', rarity: p.item_rarity || '', exp: p.item_expansion || '', st: {}, total: 0, cost: 0, market: 0, sell: 0, lastSell: '', lastBuy: '' };
        if (k === 'psa') row.kind = 'psa';
        var c = Number(p.stock_number) || 0;
        row.st[s.id] = (row.st[s.id] || 0) + c; row.total += c;
        row.cost += (Number(p.average_wholesale_price) || 0) * c;
        row.market = Math.max(row.market, Number(p.item_market_price) || 0);
        row.sell = Math.max(row.sell, Number(p.actual_sell_price) || Number(p.item_sell_price) || 0);
        if (p.last_transaction_sell_at && p.last_transaction_sell_at > row.lastSell) row.lastSell = p.last_transaction_sell_at;
        if (p.last_transaction_buy_at && p.last_transaction_buy_at > row.lastBuy) row.lastBuy = p.last_transaction_buy_at;
      });
    });
    var rows = Object.keys(map).map(function (k) {
      var r = map[k]; r.avgCost = r.total > 0 ? Math.round(r.cost / r.total) : 0; delete r.cost;
      r.lastSell = String(r.lastSell).slice(0, 10); r.lastBuy = String(r.lastBuy).slice(0, 10);
      return r;
    });
    say('送信中…（' + rows.length + '件）');
    await post({ stores: stores, rows: rows, failed: failed });
    say('送信しました（' + rows.length + '件' + (failed.length ? '・読めなかった店：' + failed.join('、') : '') + '）');
    done(true, rows.length);
  } catch (e) {
    say('失敗：' + e.message);
    try { await post({ error: String(e.message || e), stores: [], rows: [] }); } catch (e2) { }
    done(false, String(e.message || e));
  }
})();
