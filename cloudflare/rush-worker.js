// カードラッシュ中継（Cloudflare Worker）
// 買取チェック（GAS）から ?q=検索語&key=合言葉 で呼ぶ。カードラッシュの一覧を読んで、商品ごとの
// 名前・弾・価格・在庫・画像をJSONで返す。ラッシュがGoogleのサーバーからの読み込みを拒否するため、ここを通す。
const KEY = '3cea41f2ef3ea5d87917a267';

function parse(h) {
  const seen = {};
  return String(h).split('<li class="list_item_cell').slice(1).map(function (p) {
    const id = (p.match(/data-product-id="(\d+)"/) || [])[1];
    const nm = ((p.match(/<span class="goods_name">([\s\S]*?)<\/span>\s*<wbr/) || [])[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const set = ((p.match(/model_number_value">([^<]*)/) || [])[1] || '').trim();
    const price = Number(((p.match(/class="figure">([\d,]+)円/) || [])[1] || '0').replace(/,/g, ''));
    const st = (p.match(/在庫数\s*(\d+)/) || [])[1];
    return { id: id, nm: nm, set: set, price: price, so: /stock soldout/.test(p), st: st ? Number(st) : 0, img: (p.match(/<img src="([^"]+)"/) || [])[1] || '' };
  }).filter(function (x) { if (!x.id || seen[x.id]) return false; seen[x.id] = 1; return true; });
}

export default {
  async fetch(req) {
    const u = new URL(req.url);
    const H = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };
    if (u.searchParams.get('key') !== KEY) return new Response(JSON.stringify({ ok: false, error: 'key' }), { status: 403, headers: H });
    const q = (u.searchParams.get('q') || '').slice(0, 100);
    if (!q) return new Response(JSON.stringify({ ok: false, error: 'q' }), { headers: H });
    const r = await fetch('https://www.cardrush-pokemon.jp/product-list?keyword=' + encodeURIComponent(q), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Accept-Language': 'ja,en;q=0.8', 'Accept': 'text/html' },
      cf: { cacheTtl: 600, cacheEverything: true }
    });
    if (r.status >= 300) return new Response(JSON.stringify({ ok: false, status: r.status }), { headers: H });
    return new Response(JSON.stringify({ ok: true, items: parse(await r.text()) }), { headers: H });
  }
};
