/* ナタデココ オリパ作成アシスト v1  — マイカ(pos.mycalinks.com)上で動くスタッフ向けツール */
(function () {
  'use strict';
  if (location.hostname !== 'pos.mycalinks.com') { alert('マイカ（pos.mycalinks.com）を開いてから押してください'); return; }
  var old = document.getElementById('ndk-oripa-host'); if (old) { old.remove(); }
  // 全店モード（TikTok・通販オリパ用）：別のブックマークが window.ORIPA_MODE='all' を入れてから読み込む
  var ALL = window.ORIPA_MODE === 'all'; window.ORIPA_MODE = '';

  /* ---------- オリパ作成ルール（スプレッドシート「オリパ作成ルール」2026/10/28 版） ---------- */
  // 倍率はすべて「口単価の何倍」。カードの値段はマスタ価格で判定。原価率は原価で計算。
  // big/mid/small = 当たりの値段の範囲（倍）。nBig/nMid/nTotal = 枚数の範囲。小当たり＝合計の残り
  // kinds = 当たりに入れるもの（先頭が優先、後ろは難しい場合）。fill = 下枠（at:【@◯◯】商品 / single:マスタ◯円以上のシングル）
  var RULES = {
    500:   { init: 500, costMin: 0.60, costMax: 0.70, top: 40, last: 20, big: [20, 40],  mid: [10, 15],    small: [5, 10],     nBig: [3, 5], nMid: [5, 7], nTotal: [30, 30], kinds: [['card', 'box', 'pack', 'psa', 'supply']], fill: { at: 20 },  label: 'シングル・BOX・パック・PSA・サプライ' },
    1000:  { dupFirst: true, boxMinX: 8, init: 250, costMin: 0.65, costMax: 0.70, top: 20, last: 15, big: [10, 20], mid: [10, 20],   small: [1, 10],     nBig: [2, 3], nMid: [3, 5], nTotal: [15, 20], kinds: [['box'], ['card', 'psa']], fill: { at: 20 },  label: 'BOX（難しい場合はシングル・PSA）' },
    2000:  { dupFirst: true, boxMinX: 5, init: 200, costMin: 0.70, costMax: 0.75, top: 15, last: 10, big: [10, 20],  mid: [10, 20],    small: [1, 10],     nBig: [2, 3], nMid: [3, 5], nTotal: [15, 20], kinds: [['box'], ['card', 'psa']], fill: { at: 200 }, label: 'BOX（難しい場合はシングル・PSA）' },
    3000:  { init: 100, costMin: 0.70, costMax: 0.75, top: 15, last: 10, big: [10, 15],  mid: [4, 9],    small: [3, 4],     nBig: [2, 3], nMid: [3, 5], nTotal: [8, 12],  kinds: [['card'], ['box', 'psa']], fill: { at: 200, pack: true }, label: 'シングル（難しい場合はBOX・PSA）' },
    10000: { init: 60,  costMin: 0.75, costMax: 0.80, top: 10, last: 5,  big: [5, 10],  mid: [3, 4],  small: [2, 3],   nBig: [1, 2], nMid: [2, 4], nTotal: [4, 9],   kinds: [['card'], ['box', 'psa']], fill: { single: 1980 }, label: 'シングル（難しい場合はBOX・PSA）' },
    25000: { dupFirst: true, init: 25,  costMin: 0.80, costMax: 0.85, top: 6,  last: 3,  big: [4, 6],   mid: [2, 3],  small: [1, 2], nBig: [1, 2], nMid: [2, 4], nTotal: [4, 7],   kinds: [['box']], fill: { single: 7980, kind: 'box' }, label: 'BOXのみ（下枠もBOX）' }
  };
  var REFILL_UP = { 500: 0.17, 1000: 0.20, 2000: 0.26, 3000: 0.26, 10000: 0.27, 25000: 0.28 }; // 過去データ：補充で上がった原価率の平均
  // ReCORE（〜2026年7月）全店の過去オリパ1,141件から学習：価格帯ごとに「よく入れていた商品」と入れた回数
  var HIST = {"500":{"C:ナンジャモ":76,"C:ピカチュウ":66,"C:メガリザードンX":48,"C:アセロラ":46,"C:ロケット":36,"C:リザードンEX":35,"C:ゾロアークEX":34,"B:バトルパートナーズ":33,"B:テラスタルフェスEX":32,"B:メガシンフォニア":32,"B:メガブレイブ":32,"C:メガゲンガーEX":32,"B:MEGAドリームEX":32,"C:イーブイEX":31,"C:メガルカリオEX":31,"C:ピカチュウEX":30,"B:ムニキスゼロ":30,"C:リーリエ":29,"C:ニンフィアEX":29,"C:ミモザ":27,"C:ゼイユ":27,"C:マリィ":27,"C:エーフィEX":27,"C:メガサーナイトE":25,"C:エリカ":24,"C:サーナイトEX":23,"C:ユウリ":23,"C:ルチア":23,"C:コイキング":23,"C:カメックスEX":21,"C:サンダースEX":21,"C:リザードンV":20,"C:サザレ":20,"C:ヒビキ":20,"C:ミュウEX":19,"C:ブースターEX":19,"C:リーフィアEX":18,"C:シャワーズEX":18,"C:ピカチュウVMA":17,"C:リザードンVST":17},"1000":{"B:バトルパートナーズ":92,"B:テラスタルフェスEX":77,"B:ステラミラクル":65,"B:サイバージャッジ":62,"B:古代の咆哮":60,"B:ナイトワンダラー":59,"B:メガシンフォニア":59,"B:未来の一閃":58,"B:スノーハザード":54,"B:MEGAドリームEX":52,"B:メガブレイブ":50,"B:クレイバースト":42,"B:ムニキスゼロ":42,"B:変幻の仮面":38,"B:ワイルドフォース":38,"B:白熱のアルカナ":34,"B:ニンジャスピナー":33,"B:黒炎の支配者":32,"B:クリムゾンヘイズ":29,"B:楽園ドラゴーナ":29,"B:レイジングサーフ":26,"B:シャイニートレジャーEX":48,"B:インフェルノX":25,"B:ホワイトフレア":24,"B:ポケモンカード151":20,"C:ピカチュウ":20,"B:熱風のアリーナ":20,"B:ロケット団の栄光":18,"B:超電ブレイカー":16,"C:リーリエ":16,"B:パラダイムトリガー":15,"C:ナンジャモ":15,"B:アビスアイ":15,"C:ピカチュウEX":14,"B:ブラックボルト":14,"C:リザードンEX":12,"B:ロストアビス":11,"C:コイキング":11,"B:バトルリージョン":10},"2000":{"B:テラスタルフェスEX":55,"B:バトルパートナーズ":53,"B:インフェルノX":46,"B:クレイバースト":42,"B:メガブレイブ":39,"B:黒炎の支配者":37,"B:MEGAドリームEX":37,"B:メガシンフォニア":36,"B:VSTARユニバース":34,"B:ロケット団の栄光":28,"B:ホワイトフレア":36,"B:パラダイムトリガー":27,"B:ブラックボルト":26,"B:シャイニースターV":23,"B:シャイニートレジャーEX":35,"B:変幻の仮面":23,"B:ポケモンカード151":20,"B:超電ブレイカー":19,"B:クリムゾンヘイズ":19,"B:ムニキスゼロ":19,"B:ニンジャスピナー":19,"B:白熱のアルカナ":18,"B:楽園ドラゴーナ":18,"C:ピカチュウ":14,"B:トリプレットビート":14,"B:熱風のアリーナ":12,"B:レイジングサーフ":12,"B:スペースジャグラー":10,"B:ナイトワンダラー":10,"B:古代の咆哮":10,"B:ステラミラクル":10,"B:スノーハザード":9,"B:VMAXクライマックス":8,"B:ワイルドフォース":8,"B:未来の一閃":8,"C:イーブイ":7,"B:ポケモンセンタートウホク":7,"B:サイバージャッジ":7},"3000":{"C:リーリエ":73,"C:ピカチュウ":54,"B:テラスタルフェスEX":51,"C:ピカチュウEX":42,"C:ロケット":40,"C:メガサーナイトE":39,"C:ナンジャモ":38,"B:MEGAドリームEX":37,"C:コイキング":34,"C:ブラッキーEX":33,"C:メガカイリューE":33,"C:マリィ":27,"C:リザードンEX":25,"C:レシラムEX":24,"C:サーナイトEX":22,"C:リザードンV":22,"C:ニンフィアEX":20,"C:ゲンガーミミッ":20,"C:ルチア":20,"C:メガルカリオEX":20,"C:ゼクロムEX":19,"C:ミュウEX":18,"C:ギラティナVST":18,"C:メガゲッコウガE":18,"C:リザードンVST":17,"C:ミュウツーVST":17,"C:ミモザ":16,"C:ミラー":16,"C:アセロラ":15,"C:ミュウ":15,"C:メガゲンガーEX":15,"B:ニンジャスピナー":15,"C:トウホク":14,"B:イーブイヒーローズ":13,"C:ピカチュウVMA":12,"C:カスミ":12,"C:コダック":12,"C:ギラティナV":12,"C:ゼイユ":12,"C:アルセウスVST":11},"10000":{"C:リーリエ":30,"C:メガリザードンX":22,"C:メガゲンガーEX":22,"C:ピカチュウ":21,"C:リザードンEX":20,"C:ロケット":19,"C:メガカイリューE":18,"C:ブラッキーEX":17,"C:ピカチュウEX":17,"C:メガダークライE":14,"C:ミュウEX":12,"B:ポケモンカード151":11,"C:ナンジャモ":11,"C:メガゲッコウガE":11,"C:メガルカリオEX":10,"C:メガサーナイトE":10,"B:インフェルノX":10,"B:テラスタルフェスEX":9,"C:ゲッコウガEX":8,"C:マリィ":7,"C:ブルー":6,"B:イーブイヒーローズ":5,"B:VSTARユニバース":5,"C:エーフィVMAX":5,"C:ルギアV":5,"C:ゼクロムEX":5,"C:メガジガルデEX":5,"C:ソルガレオルナ":5,"B:ロケット団の栄光":5,"B:パラダイムトリガー":4,"C:ルチア":4,"C:ミラー":4,"C:ピカチュウVMA":4,"B:MEGAドリームEX":4,"C:コイキング":4,"C:レシラムEX":4,"C:リザードンV":4,"B:超電ブレイカー":4,"C:イーブイ":4,"B:ロストアビス":3},"25000":{"B:ポケモンカード151":56,"B:インフェルノX":49,"B:テラスタルフェスEX":39,"B:VSTARユニバース":37,"B:超電ブレイカー":34,"B:VMAXクライマックス":32,"B:ロストアビス":28,"B:ブラックボルト":24,"B:ロケット団の栄光":24,"B:シャイニースターV":19,"B:黒炎の支配者":17,"C:ピカチュウEX":15,"B:イーブイヒーローズ":15,"B:パラダイムトリガー":14,"B:スターバース":13,"B:ポケモンセンターヒロシマ":11,"B:シャイニートレジャーEX":11,"B:ポケモンセンターフクオカ":10,"B:漆黒のガイスト":10,"B:25THANNIVERSARYCOLLECTION":9,"B:熱風のアリーナ":9,"C:リザードンEX":9,"C:リーリエ":8,"B:楽園ドラゴーナ":8,"B:デラックスホワイトフレア":8,"C:メガカイリューE":8,"C:メガダークライE":8,"B:仰天のボルテッカー":7,"B:トリプレットビート":7,"C:ブラッキーEX":7,"B:ダークファンタズマ":7,"C:ピカチュウ":7,"B:ホワイトフレア":7,"B:ポケモンSVデラックスブラックボルト":7,"B:オルタージェネシス":6,"B:白銀のランス":6,"B:ダークオーダー":6,"C:メガサーナイトE":6,"C:メガゲッコウガE":6,"C:メガゲンガーEX":6}};
  function histKey(p) {
    var s = String(p.name || '').normalize('NFKC').toUpperCase();
    if (p.kind === 'box') {
      s = s.replace(/ポケモンカードゲーム|スカーレット|バイオレット|ソード|シールド|強化拡張パック|拡張パック|ハイクラスパック|スペシャル|BOX|ボックス|シュリンク(付|あり|なし)?|未開封|新品|使用禁止|\(.*?\)|（.*?）|【.*?】|[「」『』!！&＆\s・:：\-]/g, '');
      return s ? 'B:' + s : '';
    }
    if (p.kind === 'card' || p.kind === 'psa') {
      s = s.replace(/〔.*?〕|【.*?】|\[.*?\]|\{.*?\}|｛.*?｝|\(.*?\)|（.*?）/g, ' ');
      var m = s.match(/[ァ-ヶー]{2,}[ァ-ヶーA-Z&]*/); return m ? 'C:' + m[0].slice(0, 8) : '';
    }
    return '';
  }
  // スタッフの手直しから学ぶ：提案から外したものは下げ、足したものは上げる（本部のシート「オリパ学習」に記録）
  var LEARN = {};
  function loadLearn() { if (!APPROVAL_URL) return; fetch(APPROVAL_URL + '?action=learn').then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok && j.scores) LEARN = j.scores; }).catch(function () { }); }
  function learnScore(p, base) { var v = (LEARN[base] || {})[nk(p)] || 0; return Math.max(-3, Math.min(3, v)); }
  function sendLearn(pt) {
    try {
      if (!APPROVAL_URL || !pt.orig) return;
      var fin = {}; flatHits(pt.hits).forEach(function (h) { fin[nk(h.p)] = h.p.name; });
      var org = {}; pt.orig.forEach(function (o) { org[o.k] = o.name; });
      var rows = [];
      Object.keys(org).forEach(function (k) { rows.push({ k: k, name: org[k], r: fin[k] ? '残した' : '外した' }); });
      Object.keys(fin).forEach(function (k) { if (!org[k]) rows.push({ k: k, name: fin[k], r: '足した' }); });
      if (!rows.length) return;
      fetch(APPROVAL_URL, { method: 'POST', body: JSON.stringify({ action: 'learn', store: ALL ? '全店' : shortName(S.sname), base: pt.base || '', price: pt.price, rows: rows }) }).catch(function () { });
    } catch (e) { }
  }
  var histCache = {};
  function histCount(p, base) {
    var ck = base + '|' + p.id; if (histCache[ck] != null) return histCache[ck];
    var d = HIST[base] || {}, k = histKey(p), n = 0;
    if (k) {
      if (d[k]) n = d[k];
      else if (k.charAt(0) === 'B' && k.length > 4) Object.keys(d).forEach(function (x) { if (x.charAt(0) === 'B' && x.length > 4 && (x.indexOf(k.slice(2)) >= 0 || k.indexOf(x.slice(2)) >= 0)) n = Math.max(n, d[x]); });
      else if (k.charAt(0) === 'C') Object.keys(d).forEach(function (x) { if (x.charAt(0) === 'C' && x.length >= 5 && k.slice(2).indexOf(x.slice(2)) === 0) n = Math.max(n, Math.round(d[x] / 2)); });
    }
    return (histCache[ck] = n);
  }

  /* ---------- テーマで絞る（全店オリパ）：ピカチュウ系・ブイズ系など。チェックした複数のテーマを混ぜられる ---------- */
  var THEMES = [
    { k: 'pika', label: 'ピカチュウ系', re: /ピカチュウ|ピチュー|ライチュウ/ },
    { k: 'eevee', label: 'ブイズ系', re: /イーブイ|シャワーズ|サンダース|ブースター|エーフィ|ブラッキー|リーフィア|グレイシア|ニンフィア/ },
    { k: 'girls', label: 'ガールズ系', re: /リーリエ|ナンジャモ|マリィ|シロナ|カトレア|アセロラ|エリカ|カスミ|カンナ|スイレン|マオ|ルザミーネ|サナ(?!ギ)|セレナ|ミモザ|ボタン|ネモ|ゼイユ|ルチア|アイリス|フウロ|コルニ|ナタネ|ヒカリ|メイ|ベル|スズナ|ミカン|アカネ|ハルカ|ユウリ|ソニア|ルリナ|サイトウ|メロン|ポプラ|クララ|ヒガナ|カリン|アズサ|オモダカ|チリ(?!ー)|ポピー|ライム|リップ|タロ|カキツバタ|スグリ|ミニスカート|おねえさん|おじょうさま|かんこうきゃく|ガールズ|センパイとコウハイ|モノマネむすめ|ブルーの|ナツメ|マーシャ(?!ドー)|イリマ|ライチ(?!ュウ)|アローラの仲間/ },
    { k: 'legend', label: '伝説系', re: /ミュウツー|ミュウ|ルギア|ホウオウ|レックウザ|グラードン|カイオーガ|ディアルガ|パルキア|ギラティナ|アルセウス|レシラム|ゼクロム|キュレム|ゼルネアス|イベルタル|ジガルデ|ソルガレオ|ルナアーラ|ネクロズマ|ザシアン|ザマゼンタ|ムゲンダイナ|コライドン|ミライドン|テラパゴス|ファイヤー|サンダー(?!ス)|フリーザー|ライコウ|エンテイ|スイクン|ラティアス|ラティオス|ジラーチ|デオキシス|セレビィ|ダークライ|シェイミ|ビクティニ|ケルディオ|メロエッタ|ゲノセクト|ディアンシー|フーパ|ボルケニオン|マギアナ|マーシャドー|ゼラオラ|メルタン|メルメタル|ザルード|バドレックス|レジ|ヒードラン|クレセリア|ユクシー|エムリット|アグノム|コバルオン|テラキオン|ビリジオン|トルネロス|ボルトロス|ランドロス|カプ・|オーガポン|モモワロウ/ },
    { k: 'starter', label: '御三家系', re: /フシギダネ|フシギソウ|フシギバナ|ヒトカゲ|リザード|ゼニガメ|カメール|カメックス|チコリータ|ベイリーフ|メガニウム|ヒノアラシ|マグマラシ|バクフーン|ワニノコ|アリゲイツ|オーダイル|キモリ|ジュプトル|ジュカイン|アチャモ|ワカシャモ|バシャーモ|ミズゴロウ|ヌマクロー|ラグラージ|ナエトル|ハヤシガメ|ドダイトス|ヒコザル|モウカザル|ゴウカザル|ポッチャマ|ポッタイシ|エンペルト|ツタージャ|ジャノビー|ジャローダ|ポカブ|チャオブー|エンブオー|ミジュマル|フタチマル|ダイケンキ|ハリマロン|ハリボーグ|ブリガロン|フォッコ|テールナー|マフォクシー|ケロマツ|ゲコガシラ|ゲッコウガ|モクロー|フクスロー|ジュナイパー|ニャビー|ニャヒート|ガオガエン|アシマリ|オシャマリ|アシレーヌ|サルノリ|バチンキー|ゴリランダー|ヒバニー|ラビフット|エースバーン|メッソン|ジメレオン|インテレオン|ニャオハ|ニャローテ|マスカーニャ|ホゲータ|アチゲータ|ラウドボーン|クワッス|ウェルカモ|ウェーニバル/ }
  ];
  function themeHit(p) { var t = S.themes || []; if (!t.length) return true; if (p.kind !== 'card' && p.kind !== 'psa') return false; var nm = String(p.name || ''); return THEMES.some(function (x) { return t.indexOf(x.k) >= 0 && x.re.test(nm); }); }
  function themeHTML() {
    if (!ALL) return '';
    var t = S.themes || [];
    return '<div class="f"><div class="lb">テーマで絞る（混ぜられます）</div><div class="tchk">' + THEMES.map(function (x) { return '<label><input type="checkbox" data-t="' + x.k + '"' + (t.indexOf(x.k) >= 0 ? ' checked' : '') + '>' + x.label + '</label>'; }).join('') + '</div><div class="hint">チェックすると、当たりはそのテーマのシングル・PSAだけになります（下枠はそのまま）</div></div>';
  }
  function readThemes() { S.themes = [].slice.call(root.querySelectorAll('.tchk input:checked')).map(function (x) { return x.dataset.t; }); }
  function isEnergy(p) { return (p.kind === 'card' || p.kind === 'psa') && /エネルギー/.test(p.name || ''); }
  function isDeck(p) { return /デッキビルド|スターター|スタートデッキ|デッキセット|構築済み|プレミアムデッキ|デッキ/.test(p.name); }
  function suspectPrice(p) { return p.kind === 'box' && p.cost > 0 && (p.cost < p.sell * 0.3 || (!/BOX|ボックス|box/i.test(p.name) && /パック/.test(p.name))); }
  function learnFor(price) {
    var ks = Object.keys(RULES).map(Number).sort(function (a, b) { return a - b; });
    var best = ks[0]; ks.forEach(function (k) { if (Math.abs(Math.log(k / price)) < Math.abs(Math.log(best / price))) best = k; });
    var L = Object.assign({}, RULES[best]); L.base = best; L.refillUp = REFILL_UP[best]; L.costr = L.costMax;
    if (best !== price) L.init = Math.max(5, Math.round(RULES[best].init * best / price / 5) * 5);
    return L;
  }

  /* ---------- 状態 ---------- */
  var S = { stores: [], sid: null, sname: '', inv: [], loaded: false, me: null, cat: null, genre: null, patterns: [], tab: 'make' };
  function yen(n) { return '¥' + Math.round(n || 0).toLocaleString(); }
  function pct(n) { return Math.round((n || 0) * 100) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  async function api(path, opt) {
    var r = await fetch(path, Object.assign({ credentials: 'include' }, opt || {}));
    var t = await r.text(); var j = null; try { j = JSON.parse(t); } catch (e) { }
    if (!r.ok) throw new Error((j && (j.error || j.message)) || ('通信エラー ' + r.status));
    return j;
  }

  /* ---------- 画面 ---------- */
  var host = document.createElement('div'); host.id = 'ndk-oripa-host';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;';
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' + CSS() + '</style><div class="wrap"><div class="win">' +
    '<div class="hd"><div class="ttl">' + (ALL ? '全店オリパ作成（TikTok・通販）' : 'オリパ作成アシスト') + ' <span style="font-size:11px;color:#e8c23a;font-weight:700">2026-10-31 版AW</span></div>' + (ALL ? '<div class="store" id="allst">全店の在庫</div>' : '<div class="store"><label>店舗 <select id="store"></select></label></div>') +
    (ALL ? '' : '<div class="tabs"><button data-tab="make" class="on">新しく作る</button><button data-tab="refill">補充する</button></div>') +
    '<button class="x" id="close" title="閉じる">×</button></div>' +
    '<div class="bd" id="body"><div class="msg">読み込み中…</div></div></div></div>';
  var $ = function (s) { return root.querySelector(s); };
  $('#close').onclick = function () { host.remove(); };
  root.querySelectorAll('.tabs button').forEach(function (b) {
    b.onclick = function () { root.querySelectorAll('.tabs button').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); S.tab = b.dataset.tab; render(); };
  });

  /* ---------- 初期化 ---------- */
  (async function init() {
    try {
      var ses = await api('/api/auth/session'); S.me = ses && ses.user && ses.user.id;
      loadLearn();
      var all = await api('/api/store/all');
      if (ALL) { S.stores = all.stores || []; await loadAllStores(); return; }
      S.stores = (all.stores || []).filter(function (s) { return !/通販/.test(s.display_name); });
      var hdr = document.body.innerText.match(/店舗：\s*([^\n​]+)/); var hname = hdr ? hdr[1].trim() : '';
      var cur = S.stores.find(function (s) { return hname && hname.indexOf(s.display_name) >= 0; }) || S.stores.find(function (s) { return hname.indexOf(s.display_name.replace('ナタデココ', '').replace(/本?店$/, '')) >= 0; }) || S.stores[0];
      $('#store').innerHTML = S.stores.map(function (s) { return '<option value="' + s.id + '"' + (s.id === cur.id ? ' selected' : '') + '>' + esc(s.display_name.replace('ナタデココ', '')) + '</option>'; }).join('');
      $('#store').onchange = function () { selectStore(Number(this.value)); };
      await selectStore(cur.id);
    } catch (e) { $('#body').innerHTML = '<div class="msg err">マイカの読み込みに失敗しました：' + esc(e.message) + '<br>マイカにログインした状態で、もう一度ボタンを押してください。</div>'; }
  })();

  async function selectStore(sid) {
    S.sid = sid; S.sname = (S.stores.find(function (s) { return s.id === sid; }) || {}).display_name || ''; S.loaded = false; S.patterns = [];
    $('#body').innerHTML = '<div class="msg">' + esc(S.sname) + 'の在庫を読み込み中…</div>';
    var cats = await api('/api/store/' + sid + '/item/category'); var gens = await api('/api/store/' + sid + '/item/genre');
    S.cat = (cats.itemCategories || []).find(function (c) { return c.handle === 'ORIGINAL_PACK'; });
    S.genre = (gens.itemGenres || []).find(function (g) { return /ポケモン/.test(g.display_name); }) || (gens.itemGenres || [])[0];
    S.invBase = await loadInv(sid, S.sname); refreshInv();
    S.loaded = true; render();
  }
  function shortName(n) { return String(n || '').replace('ナタデココ', '').replace(/本?店$/, ''); }
  async function fetchProducts(sid) {
    var inv = [], skip = 0;
    while (true) {
      var r = await api('/api/store/' + sid + '/product?is_active=true&is_consignment_product=false&stock_number_gte=1&take=500&skip=' + skip);
      inv = inv.concat(r.products || []); if (!r.products || r.products.length < 500) break; skip += 500;
    }
    return inv;
  }
  // 全店モード：全店舗の在庫をまとめて読む（どの店の在庫かを p.sname に持つ）
  async function loadAllStores() {
    $('#body').innerHTML = '<div class="msg">全店舗の在庫を読み込み中…（' + S.stores.length + '店）</div>';
    var lists = await Promise.all(S.stores.map(function (st) { return loadInv(st.id, st.display_name).catch(function () { return null; }); }));
    S.invAll = []; S.failed = [];
    lists.forEach(function (l, i) { if (l) S.invAll = S.invAll.concat(l); else S.failed.push(shortName(S.stores[i].display_name)); });
    S.useStores = S.useStores || S.stores.map(function (st) { return st.id; });
    S.sname = '全店'; S.sid = null;
    applyStoreFilter();
    S.loaded = true; render();
  }
  function applyStoreFilter() { S.invBase = S.invAll.filter(function (p) { return S.useStores.indexOf(p.sid) >= 0; }); refreshInv(); S.patterns = []; }
  // カード・BOXの状態で使う在庫をしぼる（ふだんはシングル＝状態A・A-、BOX＝全部。「任意の金額」で傷オリパなどに変えられる）
  var DEF_CARD_CONDS = ['状態A', '状態A-'];
  function boxState(p) { return p.bst ? (/^B/.test(p.bst) ? 'B' : p.bst) : '通常'; }
  function condPass(p) {
    var c = S.conds;
    if (p.kind === 'card') return (c && c.card ? c.card : DEF_CARD_CONDS).indexOf(p.cond) >= 0;
    if (p.kind === 'box' && c && c.box) return c.box.indexOf(boxState(p)) >= 0;
    return true;
  }
  function refreshInv() { S.inv = (S.invBase || []).filter(condPass); }
  function setConds(c) { S.conds = c || null; refreshInv(); }
  function cardConds() { var o = {}; (S.invBase || []).forEach(function (p) { if (p.kind === 'card' && p.cond) o[p.cond] = (o[p.cond] || 0) + 1; }); return Object.keys(o).sort(); }
  function storeChips() {
    if (!ALL) return '';
    return '<div class="stchips"><span class="lb">使う店舗</span>' + S.stores.map(function (st) {
      var n = S.invAll.filter(function (p) { return p.sid === st.id && p.kind !== 'filler'; }).length;
      return '<label><input type="checkbox" data-st="' + st.id + '"' + (S.useStores.indexOf(st.id) >= 0 ? ' checked' : '') + '>' + esc(shortName(st.display_name)) + '<small>' + n + '</small></label>';
    }).join('') + (S.failed && S.failed.length ? '<span class="err">読み込めなかった店舗：' + esc(S.failed.join('・')) + '</span>' : '') + '</div>';
  }
  function bindStoreChips() {
    root.querySelectorAll('[data-st]').forEach(function (c) {
      c.onchange = function () { S.useStores = [].slice.call(root.querySelectorAll('[data-st]:checked')).map(function (x) { return Number(x.dataset.st); }); applyStoreFilter(); renderMake(); };
    });
  }
  async function loadInv(sid, sname) {
    var inv = await fetchProducts(sid);
    return inv.map(function (p) {
      var bm = p.display_name.match(/【@\s*(\d+)】/);
      var cat = p.item_category_handle || '', catName = p.item_category_display_name || '';
      var cond = p.condition_option_display_name || '';
      var spec = p.specialty__display_name || '';
      var isPsa = /PSA/i.test(spec + ' ' + (p.specialty__handle || '') + ' ' + cond + ' ' + p.display_name);
      var kind = bm ? 'filler' : (cat === 'CARD' ? (isPsa ? 'psa' : 'card') : (cat === 'BOX' ? 'box' : (cat === 'PACK' || /パック/.test(catName) ? 'pack' : (/サプライ/.test(catName) ? 'supply' : 'other'))));
      // マスタ価格 = 商品マスタの販売価格（item_sell_price）。店頭価格 = この在庫の実際の販売価格（actual_sell_price）
      var bst = ((spec.match(/BOX状態\s*(\S+)/) || [])[1] || ''); // BOXの状態（A-・B など。Bはシュリンクなし）
      var shop = Number(p.actual_sell_price != null ? p.actual_sell_price : p.sell_price) || 0;
      var sell = Number(p.item_sell_price) || shop;
      return { id: p.id, name: p.display_name, img: p.image_url, sell: sell, shop: shop, cost: Number(p.average_wholesale_price) || 0, stock: p.stock_number, kind: kind,
        bst: kind === 'box' ? bst : '', cond: kind === 'box' && bst ? cond + '・' + bst + (/^B/.test(bst) ? '（シュリンクなし）' : '') : cond, noShrink: kind === 'box' && /^B/.test(bst), exp: p.item_expansion || '', rarity: p.item_rarity || '', fv: bm ? Number(bm[1]) : 0, spec: spec, sid: sid, sname: shortName(sname) };
    }).filter(function (p) {
      if (p.kind === 'other') return false;
      if (p.kind === 'filler') return true;
      if (p.cost <= 0 || p.sell <= 0) return false;          // 原価・マスタ価格が入っていないものは使わない
      if (p.cost <= p.sell * 0.1 && p.sell >= 3000) { p.costRaw = p.cost; p.cost = Math.round(p.sell * 0.7); p.costTmp = true; } // 原価がマスタの1/10以下＝原価の登録ミスとみて、マスタの70%を仮の原価にして計算する
      // シングルの状態（ふだんは状態A・A-だけ）は condPass でしぼる
      if (suspectPrice(p)) { p.kind = 'pack'; p.mis = true; } // BOX扱いだが中身はパックらしいもの（原価がマスタの3割未満）→パック扱い。当たりには使わず、下枠（3000円など）にだけ使う
      return true;
    });
  }

  /* ---------- 提案ロジック（ルールどおりに1パターン作る） ---------- */
  function propose(price, init, costr, free, kinds) {
    var L = learnFor(price);
    if (free) L = applyFree(L, free, price);
    else if (kinds && kinds.length && kinds.slice().sort().join() !== L.kinds[0].slice().sort().join()) { // 本部ルール：当たりの種類をスタッフが変えたとき
      L = Object.assign({}, L);
      L.kinds = [kinds.slice()]; L.dupFirst = kinds.length === 1 && kinds[0] === 'box'; L.allowMis = kinds.indexOf('pack') >= 0;
      L.label = kinds.map(function (k) { return KIND_NAMES[k]; }).join('・') + '（種類を変更）';
    }
    var pt0 = build(price, init, costr, L); pt0.base = L.base;
    pt0.orig = flatHits(pt0.hits).map(function (h) { return { k: nk(h.p), name: h.p.name }; }); // 最初の提案（スタッフの手直しと比べて学ぶ）
    return [pt0];
  }
  // 本部ルールを使わない「自由設定」：原価率の上限・下限、当たりの種類、下枠の入れ方を自分で決める
  var KIND_NAMES = { box: 'BOX', card: 'シングル', psa: 'PSA', pack: 'パック', supply: 'サプライ' };
  function applyFree(L, f, price) {
    L = Object.assign({}, L);
    L.free = true; L.costMin = f.cmin; L.costMax = f.cmax; L.costr = f.cmax;
    ['top', 'last', 'big', 'mid', 'small', 'nBig', 'nMid', 'nTotal', 'init'].forEach(function (k) { if (f[k] != null) L[k] = Array.isArray(f[k]) ? f[k].slice() : f[k]; });
    var ks = (f.kinds && f.kinds.length) ? f.kinds.slice() : ['card', 'box', 'psa'];
    L.kinds = [ks]; L.dupFirst = ks.length === 1 && ks[0] === 'box'; L.allowMis = ks.indexOf('pack') >= 0;
    L.label = ks.map(function (k) { return KIND_NAMES[k]; }).join('・');
    if (f.fill === 'at') L.fill = { at: Number(f.fillVal) || (L.fill.at || 200) };
    else if (f.fill === 'card' || f.fill === 'box') L.fill = { single: Number(f.fillVal) || 0, kind: f.fill };
    else if (f.fill === 'pack') L.fill = { packOnly: true };
    return L;
  }
  function geo(a, b, t) { return a * Math.pow(b / a, t); }
  /* ---------- セット当たり（関連する2枚を1つの当たりに。3,000円・1万円・2.5万円のTOP・大当たり） ---------- */
  var SET_PRICES = [3000, 10000, 25000];
  function setsOK(price) { return Number(price) > 0; } // セットは全部の価格帯で使える（スタッフが手で組む：2026/10/29）
  var FAMS = [
    ['イーブイ', 'シャワーズ', 'サンダース', 'ブースター', 'エーフィ', 'ブラッキー', 'リーフィア', 'グレイシア', 'ニンフィア'],
    ['ヒトカゲ', 'リザード', 'リザードン'], ['ゼニガメ', 'カメール', 'カメックス'], ['フシギダネ', 'フシギソウ', 'フシギバナ'], ['ピチュー', 'ピカチュウ', 'ライチュウ'],
    ['ミニリュウ', 'ハクリュー', 'カイリュー'], ['ヨーギラス', 'サナギラス', 'バンギラス'], ['フカマル', 'ガバイト', 'ガブリアス'], ['ラルトス', 'キルリア', 'サーナイト', 'エルレイド'],
    ['ゴース', 'ゴースト', 'ゲンガー'], ['ヒノアラシ', 'マグマラシ', 'バクフーン'], ['ワニノコ', 'アリゲイツ', 'オーダイル'], ['チコリータ', 'ベイリーフ', 'メガニウム'],
    ['ニャオハ', 'ニャローテ', 'マスカーニャ'], ['ホゲータ', 'アチゲータ', 'ラウドボーン'], ['クワッス', 'ウェルカモ', 'ウェーニバル'], ['ケロマツ', 'ゲコガシラ', 'ゲッコウガ'],
    ['モクロー', 'フクスロー', 'ジュナイパー'], ['ピィ', 'ピッピ', 'ピクシー'], ['ププリン', 'プリン', 'プクリン'], ['コイキング', 'ギャラドス'], ['ダンバル', 'メタング', 'メタグロス'],
    ['タツベイ', 'コモルー', 'ボーマンダ'], ['ポッチャマ', 'ポッタイシ', 'エンペルト'], ['ヒコザル', 'モウカザル', 'ゴウカザル'], ['ナエトル', 'ハヤシガメ', 'ドダイトス'],
    ['リオル', 'ルカリオ'], ['ゾロア', 'ゾロアーク'], ['メリープ', 'モココ', 'デンリュウ'], ['キモリ', 'ジュプトル', 'ジュカイン'], ['アチャモ', 'ワカシャモ', 'バシャーモ'],
    ['ミズゴロウ', 'ヌマクロー', 'ラグラージ'], ['ニャビー', 'ニャヒート', 'ガオガエン'], ['アシマリ', 'オシャマリ', 'アシレーヌ'], ['ヒバニー', 'ラビフット', 'エースバーン'],
    ['ラティアス', 'ラティオス'], ['コスモッグ', 'ソルガレオ', 'ルナアーラ', 'ネクロズマ'], ['ゼクロム', 'レシラム', 'キュレム'], ['ディアルガ', 'パルキア', 'ギラティナ'],
    ['グラードン', 'カイオーガ', 'レックウザ'], ['ザシアン', 'ザマゼンタ'], ['ホウオウ', 'ルギア'], ['ミュウ', 'ミュウツー'], ['コライドン', 'ミライドン'],
    ['ゼルネアス', 'イベルタル', 'ジガルデ'], ['ファイヤー', 'サンダー', 'フリーザー'], ['ライコウ', 'エンテイ', 'スイクン']
  ];
  var BOX_PAIRS = [['スカーレットex', 'バイオレットex'], ['古代の咆哮', '未来の一閃'], ['ワイルドフォース', 'サイバージャッジ'], ['ブラックボルト', 'ホワイトフレア'],
    ['メガブレイブ', 'メガシンフォニア'], ['スペースジャグラー', 'タイムゲイザー'], ['白銀のランス', '漆黒のガイスト'], ['一撃マスター', '連撃マスター'],
    ['摩天パーフェクト', '蒼空ストリーム'], ['ソード', 'シールド'], ['コレクションサン', 'コレクションムーン'], ['コレクションX', 'コレクションY'], ['ブラックコレクション', 'ホワイトコレクション']];
  var FAM_OF = {}; FAMS.forEach(function (f, i) { f.forEach(function (n) { FAM_OF[n] = i; }); });
  // カード名から「関連のしるし」を作る（同じポケモン・進化系統・仲間・トレーナーとそのポケモン・伝説のペア）
  function relKeys(p) {
    if (p._rk) return p._rk;
    var keys = {}, n = String(p.name || '').replace(/[（(【\[].*$/, '').replace(/\s+/g, ' ').trim();
    if (p.kind === 'box') { // BOXは同じ弾（名前の違う別商品）と、同じ日に出た対の弾
      var b = n.replace(/(シュリンク|未開封|強化拡張パック|拡張パック|ハイクラスパック|スペシャルBOX|BOX|ボックス|box)/g, ' ').replace(/(付き|あり|なし)/g, ' ').replace(/\s+/g, ' ').trim();
      if (b) keys['B:' + b] = 1;
      BOX_PAIRS.forEach(function (pr, i) { if (pr.some(function (w) { return n.indexOf(w) >= 0; })) keys['BP:' + i] = 1; });
      return (p._rk = Object.keys(keys));
    }
    n.split(/[&＆]/).forEach(function (part) {
      part = part.trim(); if (!part) return;
      var poke = part, mt = part.match(/^(.+?)の(.+)$/);
      if (mt) { keys['T:' + mt[1]] = 1; poke = mt[2]; } else keys['T:' + part] = 1;
      for (var k = 0; k < 3; k++) {
        poke = poke.replace(/^(メガ|M|ヒスイ|アローラ|ガラル|パルデア|ひかる|かがやく|テラスタル|オリジン|ゲンシ|げんしの|ダーク|ブラック|ホワイト)\s*/, '')
          .replace(/\s*(ex|EX|GX|V|VMAX|VSTAR|V-UNION|BREAK|LV\.X|☆|δ|◇|プリズムスター|\s[XY])$/i, '').trim();
      }
      if (poke) { keys['P:' + poke] = 1; if (FAM_OF[poke] != null) keys['F:' + FAM_OF[poke]] = 1; }
    });
    return (p._rk = Object.keys(keys));
  }
  function related(a, b) { if (a.id === b.id || a.name === b.name) return false; var ka = relKeys(a), kb = relKeys(b); return ka.some(function (k) { return kb.indexOf(k) >= 0; }); }
  function mkSet(a, b) {
    if (b.sell > a.sell) { var t = a; a = b; b = t; }
    return { id: 'S' + a.id + '_' + b.id, set: [a, b], kind: 'set', name: a.name + ' ＋ ' + b.name, img: a.img, img2: b.img, sell: a.sell + b.sell,
      shop: (a.shop != null && b.shop != null) ? a.shop + b.shop : null, cost: a.cost + b.cost, stock: 1, cond: 'セット',
      sid: a.sid, sname: a.sname === b.sname ? a.sname : (a.sname || '') + '・' + (b.sname || '') };
  }
  function members(p) { return p.set || [p]; }
  // 在庫からセットの候補を作る（シングル・PSAのみ。lo〜hi は2枚の合計マスタ価格）
  function setPool(list, lo, hi, ok, kinds) {
    kinds = kinds || ['card', 'psa', 'box'];
    var grp = function (p) { return p.kind === 'box' ? 'b' : 'c'; };
    var cards = list.filter(function (p) { return kinds.indexOf(p.kind) >= 0 && !p.mis && p.sell > 0 && p.sell < hi && ok(p); })
      .sort(function (a, b) { return b.sell - a.sell; }).slice(0, 800);
    var by = {}; cards.forEach(function (p) { relKeys(p).forEach(function (k) { (by[k] = by[k] || []).push(p); }); });
    var seen = {}, out = [];
    Object.keys(by).forEach(function (k) {
      var g = by[k].slice(0, 40);
      for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++) {
        var a = g[i], b = g[j], key = a.id < b.id ? a.id + '_' + b.id : b.id + '_' + a.id;
        if (seen[key] || a.id === b.id || a.name === b.name || grp(a) !== grp(b)) continue; seen[key] = 1;
        var sm = a.sell + b.sell; if (sm >= lo && sm < hi) out.push(mkSet(a, b));
      }
    });
    return out;
  }
  function roleOf(L, price, p) { return p.sell >= L.big[0] * price ? '大当たり' : (p.sell >= L.mid[0] * price ? '中当たり' : '小当たり'); }

  // 同じ商品かどうか（別の在庫行・別の店舗の同じBOXも同じものとして数える）
  function nk(p) { return 'N:' + p.kind + ':' + String(p.name || '').replace(/[\s　]/g, '') + (p.kind === 'psa' ? ':' + (p.spec || '') + (p.cond || '') : ''); }
  var _stk = null, _stkInv = null;
  function stockOf(p) { if (_stkInv !== S.inv) { _stk = {}; _stkInv = S.inv; S.inv.forEach(function (q) { _stk[nk(q)] = (_stk[nk(q)] || 0) + (Number(q.stock) || 0); }); } return _stk[nk(p)] || 0; }
  var MAX_SAME = 2; // 同じ商品を当たりに入れるのは2個まで
  function usedOf(u, p) { return !!(u[p.id] || u[nk(p)]); }
  function markUsed(u, p) { u[p.id] = 1; u[nk(p)] = (u[nk(p)] || 0) + 1; }
  function build(price, init, costr, L) {
    var rev = price * init, budget = rev * costr, warn = [];
    var left = {}; S.inv.forEach(function (p) { left[p.id] = p.stock; });
    // 過去事例：1000円のBOX当たりはほぼ¥10,000以上（下位10%で約11倍）、2000円は約6倍以上。安いデッキ・スターター等は当たりに使わない
    var HINV = S.inv.filter(function (p) {
      if (p.kind === 'box' && L.boxMinX && p.sell < L.boxMinX * price * 0.97) return false; // 7,980円のBOXは8,000円帯として使う
      if (isEnergy(p)) return false; // エネルギーカードは自動では提案しない（手で足すのはOK）
      if (!themeHit(p)) return false; // 全店オリパ：テーマで絞っているときは、テーマのシングル・PSAだけ
      if (p.mis && !L.allowMis) return false; // マスタ価格が間違っているパックは当たりに使わない（自由設定でパックを選んだときは使う）
      return true;
    });
    var lastOneMode = false;
    var usedIds = {};
    var allKinds = [].concat.apply([], L.kinds);
    var rho = (function () { // 在庫の「原価÷マスタ価格」の中央値（枚数の見積もり用）
      var r = S.inv.filter(function (p) { return p.kind !== 'filler' && p.sell > 0; }).map(function (p) { return p.cost / p.sell; }).sort(function (a, b) { return a - b; });
      return r.length ? Math.min(Math.max(r[Math.floor(r.length / 2)], 0.3), 1) : 0.6;
    })();

    // 当たり1枚を選ぶ：値段（マスタ）の範囲内で、優先する種類から、狙いの原価に近いもの
    function pickOne(loX, hiX, wantSellX, wantCost, strict) {
      var lo = loX * price, hi = hiX * price, ws = wantSellX * price;
      // BOX帯（1000/2000/25000円）は過去事例どおり「同じBOXを複数」をシングルより先に使う
      var order = [];
      if (L.dupFirst) { for (var g0 = 0; g0 < L.kinds.length; g0++) { order.push([g0, 0]); order.push([g0, 1]); if (g0 === 0) { order.push([0, 0, 1]); order.push([0, 1, 1]); } } }
      else { for (var p0 = 0; p0 < 2; p0++) for (var g1 = 0; g1 < L.kinds.length; g1++) order.push([g1, p0]); }
      for (var oi = 0; oi < order.length; oi++) {
        var g = order[oi][0], pass = order[oi][1], hiU = order[oi][2] ? Math.max(hi, L.mid[1] * price) : hi; // BOXが範囲内に無ければ少し上のBOXを使う（シングルより優先）
        {
          var kinds = L.kinds[g];
          var c = HINV.filter(function (p) { return kinds.indexOf(p.kind) >= 0 && left[p.id] > 0 && p.sell >= lo && p.sell < hiU && (pass || !usedOf(usedIds, p)) && (usedIds[nk(p)] || 0) < MAX_SAME && !(lastOneMode && isDeck(p)); });
          if (!c.length) continue;
          c.sort(function (a, b) { return sc(b) - sc(a); });
          return c[0];
        }
      }
      if (strict) return null;
      return null;
      function sc(p) {
        var s = -Math.abs(Math.log(p.sell / ws)) * 1.5;
        if (wantCost) s -= Math.abs(Math.log(Math.max(p.cost, 1) / Math.max(wantCost, 1))) * 2.5;
        if (usedOf(usedIds, p)) s -= 4 * Math.max(1, usedIds[nk(p)] || 0); // 同じ商品（別の在庫・別の店でも）は基本1つまで
        s += Math.log(1 + stockOf(p)) * 1.6 + Math.log(1 + (Number(p.stock) || 0)) * 0.4; // 在庫の多い商品を優先（全店モードは全店の合計）
        s += Math.log(1 + histCount(p, L.base)) * 0.7; // 過去によく入れていた商品を優先
        s += learnScore(p, L.base) * 0.8; // スタッフが手直しで足した商品は上げ、外した商品は下げる
        return s;
      }
    }
    var hits = [];
    function take(p, role) { left[p.id]--; markUsed(usedIds, p); var h = hits.find(function (x) { return x.p.id === p.id && x.role === role; }); if (h) h.n++; else hits.push({ p: p, n: 1, role: role }); }
    function hitCost() { return hits.reduce(function (s, h) { return s + h.p.cost * h.n; }, 0); }
    function nOf(roles) { return hits.reduce(function (s, h) { return s + (roles.indexOf(h.role) >= 0 ? h.n : 0); }, 0); }

    // セット当たり（3,000円・1万円・2.5万円）：TOP・大当たりにちょうどいい1枚が無いとき、関連する2枚のセットを使う
    var setOn = false; // セットはスタッフが手で組む（自動では入れない：2026/10/29）
    function useSet(sp, role) { sp.set.forEach(function (m) { left[m.id]--; markUsed(usedIds, m); }); usedIds[sp.id] = 1; hits.push({ p: sp, n: 1, role: role }); }
    var setGroups = L.dupFirst || L.kinds[0].indexOf('box') >= 0 && L.kinds[0].indexOf('card') < 0 ? [['box'], ['card', 'psa']] : [['card', 'psa'], ['box']]; // 2.5万円などBOX優先の値段はBOX同士を先に
    function bestSet(lo, hi, ws, wantCost) {
      var sc2 = function (sp) { return Math.abs(Math.log(sp.sell / ws)) * 1.5 + (wantCost ? Math.abs(Math.log(Math.max(sp.cost, 1) / Math.max(wantCost, 1))) * 2.5 : 0); };
      for (var gi = 0; gi < setGroups.length; gi++) {
        var c = setPool(HINV, lo, hi, function (p) { return left[p.id] > 0 && !usedOf(usedIds, p); }, setGroups[gi]);
        if (c.length) return c.sort(function (a, b) { return sc2(a) - sc2(b); })[0];
      }
      return null;
    }
    // 1) TOP と ラストワン賞
    var top = pickOne(L.top * 0.75, L.top * 1.35, L.top) || pickOne(L.big[0], 1e9, L.top);
    var forceSet = setOn && S.forceSet, bigSetDone = false;
    var topSet = setOn && (forceSet || !top || top.sell < L.top * 0.75 * price || top.sell >= L.top * 1.35 * price) ? bestSet(L.top * 0.75 * price, L.top * 1.35 * price, L.top * price) : null;
    if (topSet) { useSet(topSet, 'TOP'); top = topSet; }
    else if (top) { take(top, 'TOP'); if (top.sell < L.top * 0.75 * price || top.sell >= L.top * 1.35 * price) warn.push('TOPの狙いはマスタ' + yen(L.top * price) + '前後ですが、在庫にないので近いもの（' + yen(top.sell) + '）にしています'); }
    else warn.push('TOPにできる在庫がありません（狙い：マスタ' + yen(L.top * price) + '前後）');
    lastOneMode = true; // デッキビルドBOX・スターター等はラストワンに使わない
    var last = pickOne(L.last * 0.7, L.last * 1.4, L.last) || pickOne(L.mid[0], L.top * 1.35, L.last);
    lastOneMode = false;
    if (last) take(last, 'ラストワン'); else warn.push('ラストワン賞にできる在庫がありません（狙い：マスタ' + yen(L.last * price) + '前後）');

    // 2) 枚数を決める（予算に入る範囲で、中→大→小の順に増やす）
    var est = function (r) { return rho * geo(r[0], r[1], 0.5) * price; };
    var nBig = L.nBig[0], nMid = L.nMid[0], nTot = Math.max(L.nTotal[0], nBig + nMid);
    var fillEst = fillUnitEst();
    function estCost(b, m, t) { var sm = t - b - m; return (top ? top.cost : 0) + (last ? last.cost : 0) + Math.max(b - 1, 0) * est(L.big) + m * est(L.mid) + sm * est(L.small) + (init - t) * fillEst; } // ラストワン賞は口数に含めない
    for (var guard = 0; guard < 50; guard++) {
      var tried = false;
      if (nMid < L.nMid[1] && nBig + nMid + 1 <= nTot && estCost(nBig, nMid + 1, nTot) <= budget) { nMid++; tried = true; }
      else if (nBig < L.nBig[1] && nBig + nMid + 1 <= nTot && estCost(nBig + 1, nMid, nTot) <= budget) { nBig++; tried = true; }
      else if (nTot < L.nTotal[1] && estCost(nBig, nMid, nTot + 1) <= budget) { nTot++; tried = true; }
      if (!tried) break;
    }
    var nSmall = Math.max(0, nTot - nBig - nMid);

    // 3) 下枠を先に決める
    var fillN = Math.max(0, init - nTot); // ラストワン賞は口数に含めない（当たり＋下枠＝口数）
    var filler = makeFillerByRule(L, fillN, left, usedIds, price, warn);
    var fillCost = filler.reduce(function (s, f) { return s + f.p.cost * f.n; }, 0);

    // 4) 残りの予算を、大→中→小の各枠に見積もりの比率で配って選ぶ
    var slots = [];
    for (var i = 1; i < nBig; i++) slots.push({ role: '大当たり', r: [L.big[0], Math.min(L.big[1], L.top)], t: nBig > 2 ? (i - 1) / (nBig - 2) : 0.5 });
    for (i = 0; i < nMid; i++) slots.push({ role: '中当たり', r: L.mid, t: nMid > 1 ? i / (nMid - 1) : 0.5 });
    for (i = 0; i < nSmall; i++) slots.push({ role: '小当たり', r: L.small, t: nSmall > 1 ? i / (nSmall - 1) : 0.5 });
    slots.forEach(function (s) { s.e = rho * geo(s.r[0], s.r[1], 0.25 + s.t * 0.5) * price; });
    for (i = 0; i < slots.length; i++) {
      var rem = budget - fillCost - hitCost();
      var restEst = slots.slice(i).reduce(function (a, s) { return a + s.e; }, 0);
      var want = Math.max(rem, 0) * slots[i].e / Math.max(restEst, 1);
      var s = slots[i];
      var fsp = forceSet && !bigSetDone && s.role === '大当たり' ? bestSet(s.r[0] * price, s.r[1] * price, geo(s.r[0], s.r[1], 0.25 + s.t * 0.5) * price, want) : null;
      if (fsp) { useSet(fsp, '大当たり'); bigSetDone = true; continue; }
      var p = pickOne(s.r[0], s.r[1], geo(s.r[0], s.r[1], 0.25 + s.t * 0.5), want);
      if (p) take(p, s.role);
      else if (setOn && s.role === '大当たり') { var sp = bestSet(s.r[0] * price, s.r[1] * price, geo(s.r[0], s.r[1], 0.25 + s.t * 0.5) * price, want); if (sp) useSet(sp, '大当たり'); }
    }
    var short = { '大当たり': nBig - nOf(['TOP', '大当たり']), '中当たり': nMid - nOf(['中当たり']), '小当たり': nSmall - nOf(['小当たり']) };
    Object.keys(short).forEach(function (k) { if (short[k] > 0) warn.push(k + 'の在庫が足りず、' + short[k] + '枚少なくなっています'); });

    // 5) 予算オーバーなら、小当たり→中当たりの高いものを範囲内の安いものに替える
    for (guard = 0; guard < 60 && hitCost() + fillCost > budget; guard++) {
      var cand = hits.filter(function (h) { return h.role === '小当たり' || h.role === '中当たり'; }).sort(function (a, b) { return b.p.cost - a.p.cost; });
      var done = false;
      for (var ci = 0; ci < cand.length && !done; ci++) {
        var h = cand[ci], r = h.role === '小当たり' ? L.small : L.mid;
        var cheaper = HINV.filter(function (q) { return allKinds.indexOf(q.kind) >= 0 && left[q.id] > 0 && !usedOf(usedIds, q) && q.sell >= r[0] * price && q.sell < r[1] * price && q.cost < h.p.cost * 0.85; }).sort(function (a, b) { return b.cost - a.cost; })[0];
        if (cheaper) { left[h.p.id]++; h.n--; if (h.n <= 0) hits.splice(hits.indexOf(h), 1); take(cheaper, h.role); done = true; }
      }
      if (!done) break;
    }
    // 小当たりは最低枚数まで減らしてよい
    while (hitCost() + fillCost > budget && nOf(['小当たり']) > 0 && nOf(['TOP', '大当たり', '中当たり', '小当たり']) > L.nTotal[0]) {
      var sm = hits.filter(function (h) { return h.role === '小当たり'; }).sort(function (a, b) { return b.p.cost - a.p.cost; })[0];
      left[sm.p.id]++; sm.n--; if (sm.n <= 0) hits.splice(hits.indexOf(sm), 1);
      var more = makeFillerByRule(L, 1, left, usedIds, price, []); more.forEach(function (m) { var ex = filler.find(function (f) { return f.p.id === m.p.id; }); if (ex) ex.n += m.n; else filler.push(m); });
      fillCost = filler.reduce(function (s, f) { return s + f.p.cost * f.n; }, 0);
    }
    // 5.5) 優先する種類（例：1,000円・2,000円はBOX）を最優先。範囲外でもシングルより優先する種類を入れ、
    //      予算が足りなければ当たりの枚数を最低枚数まで減らしてでも優先する種類にする
    if (L.kinds.length > 1) {
      var pref = L.kinds[0], bigHi = Math.max(L.big[1], L.top) * price;
      var fitRole = function (q, cur) {
        var r0 = cur === '大当たり' ? [L.big[0], Math.max(L.big[1], L.top)] : cur === '中当たり' ? L.mid : L.small;
        if (q.sell >= r0[0] * price && q.sell < r0[1] * price) return cur;
        return q.sell >= L.big[0] * price ? '大当たり' : q.sell >= L.mid[0] * price ? '中当たり' : '小当たり';
      };
      for (guard = 0; guard < 120; guard++) {
        var nonPref = hits.filter(function (h) { return ['大当たり', '中当たり', '小当たり'].indexOf(h.role) >= 0 && pref.indexOf(h.p.kind) < 0 && !h.p.set; })
          .sort(function (a, b) { return b.p.cost - a.p.cost; });
        if (!nonPref.length) break;
        var room3 = budget - hitCost() - fillCost, swapped = false;
        var boxes = HINV.filter(function (q) { return pref.indexOf(q.kind) >= 0 && left[q.id] > 0 && (L.dupFirst || !usedOf(usedIds, q)) && (usedIds[nk(q)] || 0) < MAX_SAME && q.sell >= L.small[0] * price && q.sell < bigHi; })
          .sort(function (a, b) { return a.cost - b.cost; });
        for (var ni = 0; ni < nonPref.length && !swapped; ni++) {
          var hs = nonPref[ni];
          var bq = boxes.filter(function (q) { return q.cost <= hs.p.cost + room3 && q.sell >= hs.p.sell * 0.9; }).sort(function (a, b) { return (usedIds[nk(a)] || 0) - (usedIds[nk(b)] || 0) || a.sell - b.sell || stockOf(b) - stockOf(a) || a.cost - b.cost; })[0]; // まだ使っていないBOXを先に。置き換える当たりより安っぽくならないBOX
          if (bq) { left[hs.p.id]++; hs.n--; if (hs.n <= 0) hits.splice(hits.indexOf(hs), 1); take(bq, fitRole(bq, hs.role)); swapped = true; }
        }
        if (swapped) continue;
        // 入る優先品が無い：最低枚数より多ければ、いちばん安い優先外の当たりを外して下枠に戻し、予算を空ける
        var nh = nOf(['TOP', '大当たり', '中当たり', '小当たり']);
        if (nh > L.nTotal[0] && (boxes.length || L.dupFirst)) {
          var cheap = nonPref[nonPref.length - 1];
          left[cheap.p.id]++; cheap.n--; if (cheap.n <= 0) hits.splice(hits.indexOf(cheap), 1);
          makeFillerByRule(L, 1, left, usedIds, price, []).forEach(function (m) { var ex = filler.find(function (f) { return f.p.id === m.p.id; }); if (ex) ex.n += m.n; else filler.push(m); });
          fillCost = filler.reduce(function (s, f) { return s + f.p.cost * f.n; }, 0);
          continue;
        }
        break;
      }
    }
    // 6) 予算が余っていれば、同じ枠の中で少しずつ良いものに替える（原価率を狙いに近づける）
    var rangeOf = function (role) { return role === '大当たり' ? [L.big[0], Math.min(L.big[1], L.top)] : role === '中当たり' ? L.mid : role === '小当たり' ? L.small : null; };
    for (guard = 0; guard < 400; guard++) {
      var room = budget * 0.99 - hitCost() - fillCost; if (room <= price * 0.2) break;
      var order = hits.filter(function (h) { return rangeOf(h.role) && !h.p.set; }).sort(function (a, b) { return a.p.cost / Math.max(a.p.sell, 1) - b.p.cost / Math.max(b.p.sell, 1) || a.p.cost - b.p.cost; });
      var moved = false;
      for (var oi = 0; oi < order.length && !moved; oi++) {
        var h0 = order[oi], rr = rangeOf(h0.role);
        var up = HINV.filter(function (q) { return allKinds.indexOf(q.kind) >= 0 && left[q.id] > 0 && !usedOf(usedIds, q) && q.sell >= rr[0] * price && q.sell < rr[1] * price && q.cost >= h0.p.cost * 1.1 && q.cost - h0.p.cost <= room; });
        var kr0 = L.kinds.findIndex(function (ks) { return ks.indexOf(h0.p.kind) >= 0; }); if (kr0 < 0) kr0 = L.kinds.length - 1;
        for (var g2 = 0; g2 <= kr0 && !moved; g2++) { // 優先する種類を先に（今より優先度の低い種類には替えない）
          var ok = up.filter(function (q) { return L.kinds[g2].indexOf(q.kind) >= 0; }).sort(function (a, b) { return a.cost - b.cost; });
          if (ok.length) { var nq = ok[0]; left[h0.p.id]++; h0.n--; if (h0.n <= 0) hits.splice(hits.indexOf(h0), 1); take(nq, h0.role); moved = true; }
        }
      }
      if (!moved) break;
    }
    // 7) それでも原価率が下限に届かなければ、当たりを一つ上の枠へ格上げ（小→中、中→大）。枚数はそのまま
    var floor = rev * (L.costMin || 0), upTo = { '小当たり': '中当たり', '中当たり': '大当たり' };
    for (guard = 0; guard < 200 && L.costMin && hitCost() + fillCost < floor; guard++) {
      var room2 = budget - hitCost() - fillCost, lifted = false;
      ['小当たり', '中当たり'].forEach(function (from) {
        if (lifted) return;
        var lows = hits.filter(function (h) { return h.role === from; }).sort(function (a, b) { return a.p.cost - b.p.cost; });
        if (!lows.length) return;
        var h1 = lows[0], to = upTo[from], tr = rangeOf(to);
        var need = floor - hitCost() - fillCost;
        var c3 = HINV.filter(function (q) { return allKinds.indexOf(q.kind) >= 0 && left[q.id] > 0 && !usedOf(usedIds, q) && q.sell >= tr[0] * price && q.sell < tr[1] * price && q.cost > h1.p.cost && q.cost - h1.p.cost <= room2; });
        if (!c3.length) c3 = HINV.filter(function (q) { return allKinds.indexOf(q.kind) >= 0 && left[q.id] > 0 && L.kinds[0].indexOf(q.kind) >= 0 && q.sell >= tr[0] * price && q.sell < tr[1] * price && q.cost > h1.p.cost && q.cost - h1.p.cost <= room2; }); // 難しい場合は同じBOXを複数
        if (!c3.length) return;
        // 足りない分をちょうど埋めるもの（無ければ一番高いもの）を、優先する種類から
        var kr1 = L.kinds.findIndex(function (ks) { return ks.indexOf(h1.p.kind) >= 0; }); if (kr1 < 0) kr1 = L.kinds.length - 1;
        for (var g3 = 0; g3 <= kr1 && !lifted; g3++) {
          var ok3 = c3.filter(function (q) { return L.kinds[g3].indexOf(q.kind) >= 0; }).sort(function (a, b) { return a.cost - b.cost; });
          if (!ok3.length) continue;
          var pick3 = ok3.find(function (q) { return q.cost - h1.p.cost >= need; }) || ok3[ok3.length - 1];
          left[h1.p.id]++; h1.n--; if (h1.n <= 0) hits.splice(hits.indexOf(h1), 1); take(pick3, to); lifted = true;
        }
      });
      if (!lifted) break;
    }
    // 大・中・小は最後に値段順で振り直す（大当たりより高い中当たりが出ないように）
    (function () {
      var roles = ['TOP', '大当たり', '中当たり', '小当たり'], cnt = {}, units = [];
      roles.forEach(function (r) { cnt[r] = 0; });
      hits.filter(function (h) { return roles.indexOf(h.role) >= 0; }).forEach(function (h) { cnt[h.role] += h.n; for (var u = 0; u < h.n; u++) units.push(h.p); });
      units.sort(function (a, b) { return b.sell - a.sell; });
      var keep = hits.filter(function (h) { return roles.indexOf(h.role) < 0; }), k = 0;
      roles.forEach(function (r) { for (var u = 0; u < cnt[r]; u++, k++) { var p = units[k], ex = keep.find(function (h) { return h.p.id === p.id && h.role === r; }); if (ex) ex.n++; else keep.push({ p: p, n: 1, role: r }); } });
      hits.length = 0; keep.forEach(function (h) { hits.push(h); });
      // セットは TOP・大当たりだけ：中・小に下がったセットは、大当たりの一番安いシングルと入れ替える
      hits.filter(function (h) { return h.p.set && (h.role === '中当たり' || h.role === '小当たり'); }).forEach(function (hs) {
        var b = hits.filter(function (x) { return x.role === '大当たり' && !x.p.set; }).sort(function (a, c) { return a.p.sell - c.p.sell; })[0];
        if (b) { var r = hs.role; hs.role = '大当たり'; if (b.n > 1) { b.n--; hits.push({ p: b.p, n: 1, role: r }); } else b.role = r; }
      });
    })();
    hits.sort(function (a, b) { return roleRank(a.role) - roleRank(b.role) || b.p.sell - a.p.sell; });
    var cost = hitCost() + fillCost;
    if (cost > rev * L.costMax + 1) warn.push('原価率が上限（' + pct(L.costMax) + '）を超えています：' + pct(cost / rev));
    if (L.costMin && cost < rev * L.costMin - 1) warn.push('この在庫では原価率が下限（' + pct(L.costMin) + '）に届きません：' + pct(cost / rev) + '。当たりを入れ替えるか足してください');
    var fillTotal = filler.reduce(function (s, f) { return s + f.n; }, 0);
    if (fillTotal < fillN) warn.push('下枠が ' + (fillN - fillTotal) + '口分 足りません');
    var nameRule = (L.free ? '任意の金額（' + L.label + '）：原価率' : 'ルール：原価率') + (L.costMin ? pct(L.costMin) + '〜' : '上限') + pct(L.costMax) + '・TOP ' + L.top + '倍・大当たり' + L.big[0] + '〜' + L.big[1] + '倍' + (L.free ? '・中当たり' + L.mid[0] + '〜' + L.mid[1] + '倍・小当たり' + L.small[0] + '〜' + L.small[1] + '倍' : '') + '・ラストワン ' + L.last + '倍・当たり' + L.nTotal[0] + (L.nTotal[1] !== L.nTotal[0] ? '〜' + L.nTotal[1] : '') + '枚';
    var need = { 'TOP': top ? 0 : 1, '大当たり': Math.max(0, short['大当たり'] - (top ? 0 : 1)), '中当たり': Math.max(0, short['中当たり']), '小当たり': Math.max(0, short['小当たり']), 'ラストワン': last ? 0 : 1 };
    var cnt0 = { '大当たり': nOf(['TOP', '大当たり']), '中当たり': nOf(['中当たり', '当たり']), '小当たり': nOf(['小当たり']) };
    return { need: need, miss0: { '大当たり': need['TOP'] + need['大当たり'], '中当たり': need['中当たり'], '小当たり': need['小当たり'] }, cnt0: cnt0, key: '', name: 'おすすめ構成', note: nameRule, price: price, init: init, rev: rev, hits: hits, filler: filler, cost: cost, costr: cost / rev,
      value: hits.reduce(function (s, h) { return s + h.p.sell * h.n; }, 0), L: L, warn: warn };

    function fillUnitEst() {
      if (L.fill.packOnly) { var pk = packPool(price, {}); return pk.length ? pk[Math.floor(pk.length / 3)].cost : price * 0.3; }
      if (L.fill.at) { var f = fillerAt(L.fill.at); return f.length ? f[0].cost : L.fill.at; }
      var c = singleFillPool(L, price, {}, {}).slice(0, 40); if (!c.length) return L.fill.single * 0.6;
      return c.reduce(function (s, p) { return s + p.cost; }, 0) / c.length;
    }
  }

  function packPool(price, left) { return S.inv.filter(function (p) { return p.kind === 'pack' && (left[p.id] == null ? p.stock : left[p.id]) > 0 && p.cost > 0 && p.cost < price * 0.8; }).sort(function (a, b) { return a.cost - b.cost; }); }
  function fillerAt(n) { return S.inv.filter(function (p) { return p.kind === 'filler' && p.fv === n; }).sort(function (a, b) { return b.stock - a.stock; }); }
  function fillKindName(L) { return L.fill.kind === 'box' ? 'BOX' : 'シングル'; }
  function singleFillPool(L, price, left, usedIds) {
    return S.inv.filter(function (p) { return p.kind === (L.fill.kind || 'card') && !p.mis && !isEnergy(p) && (left[p.id] == null ? p.stock : left[p.id]) > 0 && !usedOf(usedIds, p) && p.sell >= L.fill.single && p.sell < L.small[0] * price && p.cost >= p.sell * 0.1; }) // 原価が極端に安い（登録ミスらしい）ものは除く
      .sort(function (a, b) { return a.sell - b.sell || stockOf(b) - stockOf(a) || a.cost - b.cost; }); // マスタ価格の安い順（ルールの下限に近いもの）、同じ値段なら在庫の多い順
  }
  // ルールどおりの下枠を n口分 作る
  function makeFillerByRule(L, n, left, usedIds, price, warn) {
    var out = [], got = 0;
    function add(p, k) { left[p.id] -= k; got += k; var ex = out.find(function (o) { return o.p.id === p.id; }); if (ex) ex.n += k; else out.push({ p: p, n: k }); }
    if (n <= 0) return out;
    if (L.fill.packOnly) {
      packPool(price, left).forEach(function (p) { if (got < n && left[p.id] > 0) add(p, Math.min(n - got, left[p.id])); });
      if (got < n) warn.push('下枠用のパックが ' + (n - got) + '口分 足りません');
      return out;
    }
    if (L.fill.at) {
      fillerAt(L.fill.at).forEach(function (f) { if (got < n && left[f.id] > 0) add(f, Math.min(n - got, left[f.id])); });
      if (got < n && L.fill.pack) { // 3000円など：BOXを解体したパックも下枠に使う（原価の安い順）
        var packs = S.inv.filter(function (p) { return p.kind === 'pack' && left[p.id] > 0 && p.cost > 0 && p.cost < price * 0.5; }).sort(function (a, b) { return a.cost - b.cost; });
        var before = got; packs.forEach(function (p) { if (got < n && left[p.id] > 0) add(p, Math.min(n - got, left[p.id])); });
        if (got > before) warn.push('【@' + L.fill.at + '】が足りない分の ' + (got - before) + '口は、パックを下枠に入れています');
      }
      if (got < n) { // 足りなければ近い値段の【@◯◯】で補う
        warn.push('【@' + L.fill.at + '】の在庫が足りないので、' + (n - got) + '口分は近い【@◯◯】で入れています');
        S.inv.filter(function (p) { return p.kind === 'filler' && p.fv !== L.fill.at && left[p.id] > 0; })
          .sort(function (a, b) { return Math.abs(Math.log(a.fv / L.fill.at)) - Math.abs(Math.log(b.fv / L.fill.at)); })
          .forEach(function (f) { if (got < n && left[f.id] > 0) add(f, Math.min(n - got, left[f.id])); });
      }
    } else {
      var pool = singleFillPool(L, price, left, usedIds);
      pool.forEach(function (p) { if (got < n) { add(p, 1); markUsed(usedIds, p); } }); // まずは1種類1枚
      for (var i = 0; got < n && i < pool.length; i++) { var p = pool[i]; if (left[p.id] > 0) add(p, Math.min(n - got, left[p.id])); }
      if (got < n) warn.push('マスタ' + yen(L.fill.single) + '以上の下枠用' + fillKindName(L) + 'が ' + (n - got) + (L.fill.kind === 'box' ? '個' : '枚') + '足りません');
    }
    return out;
  }
  function fillerList() { return S.inv.filter(function (p) { return p.kind === 'filler'; }).sort(function (a, b) { return a.cost - b.cost; }); }

  /* ---------- 描画 ---------- */
  function render() {
    if (!S.loaded) return;
    if (S.tab === 'make') renderMake(); else renderRefill();
  }

  function renderMake() {
    var F = S.free || (S.free = { on: false, kinds: ['box', 'card', 'psa'], fill: 'rule', fillVal: '' });
    if (F.on) return renderFree(F);
    var prices = [500, 1000, 2000, 3000, 10000, 25000];
    var cur = S.form || { price: 1000 };
    var L = learnFor(cur.price);
    var init = cur.init || L.init, costr = cur.costr || L.costr, kinds = cur.kinds || L.kinds[0];
    $('#body').innerHTML = modeTabs(false) +
      '<div class="form">' +
      '<div class="f"><div class="lb">1回の値段</div><div class="chips">' + prices.map(function (p) { return '<button class="chip' + (p === cur.price ? ' on' : '') + '" data-p="' + p + '">' + p.toLocaleString() + '円</button>'; }).join('') +
      '<input id="pfree" type="number" placeholder="その他" value="' + (prices.indexOf(cur.price) < 0 ? cur.price : '') + '"></div></div>' +
      '<div class="f"><div class="lb">口数</div><input id="init" type="number" value="' + init + '"> 口</div>' +
      '<div class="f"><div class="lb">最初の原価率（上限）</div><input id="costr" type="number" step="1" value="' + Math.round(costr * 100) + '"> %<div class="hint">ルール：' + pct(L.costMin) + '〜' + pct(L.costMax) + '（' + L.base.toLocaleString() + '円帯）</div></div>' +
      '<div class="f"><div class="lb">当たりに入れる種類</div><div class="kchk">' + ['box', 'card', 'psa', 'pack', 'supply'].map(function (k) { return '<label><input type="checkbox" data-k="' + k + '"' + (kinds.indexOf(k) >= 0 ? ' checked' : '') + '>' + KIND_NAMES[k] + '</label>'; }).join('') + '</div><div class="hint">最初は本部ルールの種類（' + esc(L.label) + '）</div></div>' +
      themeHTML() +
      '<div class="f go"><button class="primary" id="go">提案する</button></div>' +
      '</div>' + afterForm();
    bindModeTabs(); bindStoreChips();
    root.querySelectorAll('.chip').forEach(function (b) { b.onclick = function () { S.form = { price: Number(b.dataset.p), useSet: cur.useSet }; S.patterns = []; renderMake(); }; });
    $('#pfree').onchange = function () { var v = Number(this.value); if (v > 0) { S.form = { price: v }; S.patterns = []; renderMake(); } };
    $('#go').onclick = function () {
      var p = cur.price, n = Number($('#init').value) || L.init, c = Math.min((Number($('#costr').value) || Math.round(L.costr * 100)) / 100, 1.5);
      readThemes();
      var ks = [].slice.call(root.querySelectorAll('.kchk input[data-k]:checked')).map(function (x) { return x.dataset.k; });
      if ((S.themes || []).length) ks = ks.filter(function (k) { return k === 'card' || k === 'psa'; }).concat(ks.some(function (k) { return k === 'card' || k === 'psa'; }) ? [] : ['card', 'psa']);
      if (!ks.length) { alert('当たりに入れる種類を1つ以上選んでください'); return; }
      S.form = { price: p, init: n, costr: c, kinds: ks };
      setConds(null); S.patterns = propose(p, n, c, null, ks); renderMake();
      var r = $('#res'); if (r) r.scrollIntoView({ behavior: 'smooth' });
    };
    bindPatternButtons();
  }
  function modeTabs(free) {
    return '<div class="mtabs"><button class="mtab' + (free ? '' : ' on') + '" data-mode="rule">値段のルールで作る</button><button class="mtab' + (free ? ' on' : '') + '" data-mode="free">任意の金額で作る</button></div>';
  }
  function bindModeTabs() {
    root.querySelectorAll('[data-mode]').forEach(function (b) {
      b.onclick = function () {
        var on = b.dataset.mode === 'free'; if (S.free.on === on) return;
        S.free.on = on; S.patterns = []; if (!on) setConds(null);
        if (on && !S.free.price) seedFree(S.free, (S.form && S.form.price) || 1500);
        renderMake();
      };
    });
  }
  function afterForm() {
    return storeChips() + '<div class="info">在庫：当たり候補 ' + S.inv.filter(function (p) { return p.kind !== 'filler'; }).length + '種類／下枠 ' + fillerList().length + '種類（' + esc(S.sname) + '）</div>' +
      '<div id="res">' + (S.patterns.length ? patternsHTML() : '<div class="msg sub">条件を入れて「提案する」を押してください</div>') + '</div>';
  }
  // 任意の金額：近い値段帯のルールを目安として入れておく（すべて書き換えられる）
  function seedFree(F, price) {
    var L = learnFor(price);
    F.price = price; F.init = L.init; F.cmin = L.costMin || Math.max(L.costMax - 0.05, 0); F.cmax = L.costMax;
    F.top = L.top; F.last = L.last; F.big = L.big.slice(); F.mid = L.mid.slice(); F.small = L.small.slice();
    F.nBig = L.nBig.slice(); F.nMid = L.nMid.slice(); F.nTotal = L.nTotal.slice(); F.base = L.base;
    if (F.fill === 'at') F.fillVal = ''; 
  }
  function renderFree(F) {
    if (!F.price) seedFree(F, 1500);
    var condList = cardConds(); if (!condList.length) condList = DEF_CARD_CONDS.slice();
    if (!F.cardConds) F.cardConds = DEF_CARD_CONDS.filter(function (c) { return condList.indexOf(c) >= 0; });
    if (!F.boxConds) F.boxConds = ['通常', 'A-', 'B'];
    var L = learnFor(F.price);
    var fillDef = { at: L.fill.at || 200, card: L.fill.single || 1980, box: L.fill.single || 7980 };
    function num(id, v, w) { return '<input class="n' + (w || '') + '" id="' + id + '" type="number" step="any" value="' + v + '">'; }
    function rng(id, r, unit) { return num(id + '0', r[0]) + ' 〜 ' + num(id + '1', r[1]) + ' ' + unit; }
    $('#body').innerHTML = modeTabs(true) +
      '<div class="form free">' +
      '<div class="fgrid">' +
        '<div class="f"><div class="lb">1回の値段</div>' + num('fprice', F.price, ' w') + ' 円</div>' +
        '<div class="f"><div class="lb">口数</div>' + num('finit', F.init) + ' 口</div>' +
        '<div class="f"><div class="lb">原価率</div>' + num('fcmin', Math.round(F.cmin * 100)) + ' % 〜 ' + num('fcmax', Math.round(F.cmax * 100)) + ' %</div>' +
      '</div>' +
      '<div class="lb2">当たりの倍率（1回の値段の何倍のマスタ価格か）</div>' +
      '<div class="fgrid">' +
        '<div class="f"><div class="lb">TOP</div>' + num('ftop', F.top) + ' 倍</div>' +
        '<div class="f"><div class="lb">大当たり</div>' + rng('fbig', F.big, '倍') + '</div>' +
        '<div class="f"><div class="lb">中当たり</div>' + rng('fmid', F.mid, '倍') + '</div>' +
        '<div class="f"><div class="lb">小当たり</div>' + rng('fsmall', F.small, '倍') + '</div>' +
        '<div class="f"><div class="lb">ラストワン</div>' + num('flast', F.last) + ' 倍</div>' +
      '</div>' +
      '<div class="lb2">当たりの枚数</div>' +
      '<div class="fgrid">' +
        '<div class="f"><div class="lb">大当たり（TOP込み）</div>' + rng('fnbig', F.nBig, '枚') + '</div>' +
        '<div class="f"><div class="lb">中当たり</div>' + rng('fnmid', F.nMid, '枚') + '</div>' +
        '<div class="f"><div class="lb">当たりの合計</div>' + rng('fntot', F.nTotal, '枚') + '</div>' +
      '</div>' +
      '<div class="fgrid">' +
        '<div class="f"><div class="lb">当たりに入れる種類</div><div class="kchk">' + ['box', 'card', 'psa', 'pack', 'supply'].map(function (k) { return '<label><input type="checkbox" data-k="' + k + '"' + (F.kinds.indexOf(k) >= 0 ? ' checked' : '') + '>' + KIND_NAMES[k] + '</label>'; }).join('') + '</div></div>' +
        '<div class="f"><div class="lb">シングルの状態</div><div class="kchk cchk">' + condList.map(function (c) { return '<label><input type="checkbox" data-c="' + esc(c) + '"' + (F.cardConds.indexOf(c) >= 0 ? ' checked' : '') + '>' + esc(c.replace('状態', '')) + '</label>'; }).join('') + '</div><div class="hint">傷オリパはB・Cなどにチェック（ふだんはA・A-）</div></div>' +
        '<div class="f"><div class="lb">BOXの状態</div><div class="kchk bchk">' + [['通常', '通常'], ['A-', 'A-'], ['B', 'B（シュリンクなし）']].map(function (c) { return '<label><input type="checkbox" data-c="' + c[0] + '"' + (F.boxConds.indexOf(c[0]) >= 0 ? ' checked' : '') + '>' + c[1] + '</label>'; }).join('') + '</div></div>' +
        '<div class="f"><div class="lb">下枠</div><select id="ffill">' +
          [['rule', (L.fill.at ? '【@' + L.fill.at + '】' + (L.fill.pack ? '（足りなければパック）' : '') : 'マスタ' + yen(L.fill.single) + '以上の' + fillKindName(L)) + '（' + L.base.toLocaleString() + '円のオリパと同じ）'], ['at', '【@◯◯】商品'], ['card', 'シングル'], ['box', 'BOX'], ['pack', 'パック']].map(function (o) { return '<option value="' + o[0] + '"' + (F.fill === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          (F.fill === 'at' ? ' 【@' + num('fval', F.fillVal || fillDef.at) + '】' : (F.fill === 'card' || F.fill === 'box') ? ' マスタ ' + num('fval', F.fillVal || fillDef[F.fill], ' w') + ' 円以上' : '') +
        '</div>' +
        themeHTML() +
        '<div class="f go"><button class="primary" id="go">提案する</button></div>' +
      '</div>' +
      '<div class="hint">値段を変えると、倍率・枚数・原価率に近い値段帯（' + L.base.toLocaleString() + '円）の目安が入り直します。そのあと自由に書き換えてください。</div>' +
      '</div>' + afterForm();
    bindModeTabs(); bindStoreChips();
    function v(id) { var e = $('#' + id); return e ? Number(e.value) : NaN; }
    function pair(id, d) { var a = v(id + '0'), b = v(id + '1'); a = a >= 0 ? a : d[0]; b = b >= 0 ? b : d[1]; return a <= b ? [a, b] : [b, a]; }
    function read() {
      F.init = Math.max(1, Math.round(v('finit')) || F.init);
      var a = v('fcmin'), b = v('fcmax'); if (a >= 0) F.cmin = Math.min(a, 150) / 100; if (b > 0) F.cmax = Math.min(b, 150) / 100;
      if (F.cmin > F.cmax) { var t = F.cmin; F.cmin = F.cmax; F.cmax = t; }
      F.top = v('ftop') > 0 ? v('ftop') : F.top; F.last = v('flast') > 0 ? v('flast') : F.last;
      F.big = pair('fbig', F.big); F.mid = pair('fmid', F.mid); F.small = pair('fsmall', F.small);
      F.nBig = pair('fnbig', F.nBig).map(Math.round); F.nMid = pair('fnmid', F.nMid).map(Math.round); F.nTotal = pair('fntot', F.nTotal).map(Math.round);
      F.kinds = [].slice.call(root.querySelectorAll('.kchk input[data-k]:checked')).map(function (x) { return x.dataset.k; }); readThemes();
      if ((S.themes || []).length && !F.kinds.some(function (k) { return k === 'card' || k === 'psa'; })) F.kinds = F.kinds.concat(['card', 'psa']);
      F.cardConds = [].slice.call(root.querySelectorAll('.cchk input:checked')).map(function (x) { return x.dataset.c; });
      F.boxConds = [].slice.call(root.querySelectorAll('.bchk input:checked')).map(function (x) { return x.dataset.c; });
      F.fill = $('#ffill').value; var fv = $('#fval'); F.fillVal = fv ? fv.value : '';
    }
    $('#fprice').onchange = function () { var p = Number(this.value); if (p > 0) { read(); seedFree(F, p); S.patterns = []; renderMake(); } };
    $('#ffill').onchange = function () { read(); F.fillVal = ''; renderMake(); };
    $('#go').onclick = function () {
      read();
      if (!F.kinds.length) { alert('当たりに入れる種類を1つ以上選んでください'); return; }
      if (F.kinds.indexOf('card') >= 0 && !F.cardConds.length) { alert('シングルの状態を1つ以上選んでください'); return; }
      if (F.kinds.indexOf('box') >= 0 && !F.boxConds.length) { alert('BOXの状態を1つ以上選んでください'); return; }
      setConds({ card: F.cardConds, box: F.boxConds });
      S.patterns = propose(F.price, F.init, F.cmax, F); renderMake();
      var r = $('#res'); if (r) r.scrollIntoView({ behavior: 'smooth' });
    };
    bindPatternButtons();
  }

  // attrs があるとクリックできるカード（入れ替え用）
  function psaLabel(p) { var m = ((p.spec || '') + ' ' + p.name + ' ' + p.cond).match(/PSA\s*(\d{1,2})(?!\d)/i); return m ? 'PSA' + m[1] : 'PSA'; }
  function condText(p) { return p.kind === 'psa' ? psaLabel(p) + '（鑑定品）' : p.cond; }
  // 当たりなのに原価がマスタ価格の1/10以下（原価の登録ミスかもしれない）。使ってよいが目立たせて知らせる
  function tmpCost(p) { return !!(p && (p.costTmp || (p.set && p.set.some(tmpCost)))); }
  function lowCost(p) { if (!p || p.kind === 'filler') return false; if (p.set) return p.set.some(lowCost); return !!p.costTmp || (p.sell > 0 && p.cost <= p.sell * 0.1); }
  function rawCost(pt) { // 仮の原価のカードがあるとき、マイカの原価のままの合計（なければ null）
    var d = 0, any = false; flatHits(pt.hits).concat(pt.filler).forEach(function (h) { if (h.p.costRaw != null) { any = true; d += (h.p.cost - h.p.costRaw) * h.n; } });
    return any ? pt.cost - d : null;
  }
  function lowCostNote(pt) {
    var l = flatHits(pt.hits).filter(function (h) { return lowCost(h.p); });
    if (!l.length) return '';
    return '<div class="warn lowcw">⚠️ 原価がマスタ価格の10分の1以下の当たりがあります（原価の登録ミスかもしれません）。原価率・粗利は<b>マスタ価格の70%を仮の原価</b>にして計算しています。マイカの原価を確認・修正してください<br>' + l.map(function (h) { return '・' + esc(h.role) + '：' + esc(h.p.name) + '（マイカの原価 ' + yen(h.p.costRaw != null ? h.p.costRaw : h.p.cost) + '→仮の原価 ' + yen(h.p.cost) + '／マスタ ' + yen(h.p.sell) + '）'; }).join('<br>') + '</div>';
  }
  function card(h, big, attrs) {
    var im1 = function (u, nm) { return u ? '<img src="' + esc(u) + '" loading="lazy">' : '<div class="noimg">' + esc(String(nm).slice(0, 14)) + '</div>'; };
    var img = h.p.set ? im1(h.p.set[0].img, h.p.set[0].name) + im1(h.p.set[1].img, h.p.set[1].name) : im1(h.p.img, h.p.name);
    var tag = attrs ? 'button' : 'div';
    return '<' + tag + ' class="cd ' + (big ? 'big ' : '') + (attrs ? 'swap' : '') + '" ' + (attrs || '') + '><div class="im' + (h.p.set ? ' duo' : '') + '">' + img + (h.p.set ? '<span class="settag">セット</span>' : '') + (h.role !== '下枠' && lowCost(h.p) ? '<span class="lowc">原価は仮（マスタの70%）</span>' : '') + (h.n > 1 ? '<span class="cnt">×' + h.n + '</span>' : '') + '<span class="role r-' + esc(h.role) + '">' + esc(h.role) + '</span>' +
      (h.p.kind === 'psa' ? '<span class="psa">' + esc(psaLabel(h.p)) + '</span>' : '') +
      (attrs ? '<span class="edit">入れ替え</span>' : '') + '</div>' +
      (ALL && h.p.sname ? '<div class="sttag">' + esc(h.p.sname) + '</div>' : '') + '<div class="nm">' + (h.p.kind === 'psa' ? '《' + esc(psaLabel(h.p)) + '》' : '') + esc(h.p.name) + '</div>' + (h.p.kind === 'psa' ? '<div class="cond psa2">PSA鑑定品</div>' : (h.p.cond && !h.p.set ? '<div class="cond' + (h.p.noShrink ? ' nosh' : '') + '">' + esc(h.p.cond) + '</div>' : '')) +
      (h.p.set ? '<div class="cond">' + esc(h.p.set.map(function (m) { return m.kind === 'psa' ? psaLabel(m) : (m.cond || ''); }).join('＋')) + '</div>' : '') + '<div class="pr">マスタ ' + yen(h.p.sell) + (h.p.set ? '（2枚合計）' : '') + '</div>' + (h.p.shop != null ? '<div class="cs">店頭 ' + yen(h.p.shop) + '</div>' : '') + '<div class="cs">原価 ' + yen(h.p.cost) + (tmpCost(h.p) ? '<b style="color:#c0392b">（仮）</b>' : '') + '</div>' + (h.p.costRaw != null ? '<div class="cs" style="color:#c0392b">マイカの原価 ' + yen(h.p.costRaw) + '</div>' : '') + '</' + tag + '>';
  }

  /* ---------- 入れ替え・追加・外す ---------- */
  function usedIn(pt, id) { return pt.hits.concat(pt.filler).reduce(function (s, h) { return s + members(h.p).reduce(function (a, m) { return a + (m.id === id ? h.n : 0); }, 0); }, 0); }
  // セットを2枚に分けた中身（マイカ保存・一覧・集め先リスト用）
  function flatHits(list) { var out = []; list.forEach(function (h) { if (h.p.set) h.p.set.forEach(function (m) { out.push({ p: m, n: h.n, role: h.role + '（セット）', setOf: h.p }); }); else out.push(h); }); return out; }
  function recalc(pt) {
    pt.cost = pt.hits.concat(pt.filler).reduce(function (s, h) { return s + h.p.cost * h.n; }, 0);
    pt.costr = pt.cost / pt.rev;
    pt.value = pt.hits.reduce(function (s, h) { return s + h.p.sell * h.n; }, 0);
    pt.edited = true;
    if (pt.appr) { pt.appr = null; pt.apprNote = '中身を変えたので、承認はやり直しです'; }
  }
  // 当たりを1枚減らした/増やした分、下枠で口数を合わせる（delta>0 で下枠を増やす）
  function adjustFiller(pt, delta) {
    if (!delta) return;
    if (delta > 0) {
      var f = pt.filler.slice().sort(function (a, b) { return b.n - a.n; })[0];
      if (f && f.p.stock - usedIn(pt, f.p.id) >= delta) { f.n += delta; return; }
      var lf = {}; S.inv.forEach(function (x) { lf[x.id] = x.stock - usedIn(pt, x.id); });
      var uid = {}; pt.hits.concat(pt.filler).forEach(function (h) { uid[h.p.id] = 1; });
      var add = makeFillerByRule(pt.L, delta, lf, uid, pt.price, []);
      add.forEach(function (a) { var ex = pt.filler.find(function (x) { return x.p.id === a.p.id; }); if (ex) ex.n += a.n; else pt.filler.push(a); });
      return;
      var cand = null;
      if (cand) { var ex = pt.filler.find(function (x) { return x.p.id === cand.id; }); if (ex) ex.n += delta; else pt.filler.push({ p: cand, n: delta }); }
    } else {
      var need = -delta;
      pt.filler.sort(function (a, b) { return b.p.cost - a.p.cost; }); // 高い下枠から減らす
      for (var i = 0; i < pt.filler.length && need > 0; i++) { var m = Math.min(need, pt.filler[i].n); pt.filler[i].n -= m; need -= m; }
      pt.filler = pt.filler.filter(function (x) { return x.n > 0; });
    }
  }
  function candHTML(list, pi, prole, cap) {
    if (!list.length) return '<div class="msg sub">候補がありません</div>';
    return '<div class="cards">' + list.map(function (p) {
      var over = cap != null && p.cost > cap;
      var pt0 = S.patterns[pi], hc = pt0 ? histCount(p, pt0.L.base) : 0;
      return '<div class="cwrap' + (over ? ' over' : '') + '">' + card({ p: p, n: 1, role: p.kind === 'box' ? 'BOX' : p.kind === 'psa' ? 'PSA' : (p.cond || '').replace('状態', '') || 'カード' }, false, 'data-pick="' + p.id + '"' + (prole ? ' data-prole="' + esc(prole) + '"' : '')) + (over ? '<div class="overtag">上限オーバー</div>' : '') + (suspectPrice(p) ? '<div class="overtag">マスタ価格要確認（原価がマスタの3割未満）</div>' : '') + '<div class="stocktag">在庫 残り' + Math.max(p.stock - (pt0 ? usedIn(pt0, p.id) : 0), 0) + '個' + (pt0 && usedIn(pt0, p.id) ? '（このオリパで' + usedIn(pt0, p.id) + '個使用中）' : '') + '</div>' + (hc ? '<div class="histtag">過去' + hc + '回使用</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function openSwap(pi, hi) {
    var pt = S.patterns[pi], h = pt.hits[hi], target = h.p.cost;
    var avail = function (p) { return p.kind !== 'filler' && !p.mis && p.id !== h.p.id && p.stock - usedIn(pt, p.id) > 0; };
    var all = S.inv.filter(avail);
    var m = modal('<div class="mh">「' + esc(h.p.name) + '」（' + esc(h.role) + '・原価 ' + yen(h.p.cost) + (h.n > 1 ? '・×' + h.n : '') + '）を入れ替える</div>' +
      '<div class="sm">在庫すべて（タップで入れ替え）</div>' + sortBar() + '<div id="cl"></div>' +
      '<div class="srch"><input id="q" placeholder="カード名・BOX名で探す"><button class="ghost" id="qs">探す</button></div><div id="qr"></div>' +
      setSwapHTML(pt, h) +
      '<div class="acts"><button class="ghost danger" data-rm>この当たりを外す' + (h.n > 1 ? '（1枚）' : '') + '</button><button class="ghost" data-x>閉じる</button></div>');
    bindSetSwap(m, pt, hi);
    function pick(id) {
      var p = S.inv.find(function (x) { return x.id === id; }); if (!p) return;
      if (h.n > 1) { h.n--; pt.hits.splice(hi + 1, 0, { p: p, n: 1, role: h.role }); } else { h.p = p; }
      recalc(pt); m.remove(); renderMake();
    }
    function bindPick(el) { el.querySelectorAll('[data-pick]').forEach(function (b) { b.onclick = function () { pick(Number(b.dataset.pick)); }; }); }
    bindPick(m);
    pagedList(m, all, target, pi, bindPick);
    var search = function () {
      var q = m.querySelector('#q').value.trim(); if (!q) return;
      var r = S.inv.filter(function (p) { return avail(p) && p.name.indexOf(q) >= 0; }).sort(function (a, b) { return b.cost - a.cost; }).slice(0, 24);
      m.querySelector('#qr').innerHTML = candHTML(r, pi); bindPick(m.querySelector('#qr'));
    };
    m.querySelector('#qs').onclick = search; m.querySelector('#q').onkeydown = function (e) { if (e.key === 'Enter') search(); };
    m.querySelector('[data-rm]').onclick = function () {
      var wasLast = h.role === 'ラストワン'; h.n--; if (h.n <= 0) pt.hits.splice(hi, 1);
      if (!wasLast) adjustFiller(pt, 1); recalc(pt); m.remove(); renderMake();
    };
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
  }
  // 入れ替え画面のセット当たり：セットを外す／関連カードとセットにする／セットの候補
  function setSwapHTML(pt, h) {
    if (!setsOK(pt.price) || ['TOP', '大当たり', '中当たり', '当たり', '小当たり'].indexOf(h.role) < 0) return '';
    var out = '<div class="mh2">セット当たり（2枚で1つの当たり）</div>';
    if (h.p.set) return out + '<div class="setbar">' + h.p.set.map(function (m, k) { return '<button class="ghost" data-unset="' + k + '">セットを外して「' + esc(m.name) + '」だけ残す</button>'; }).join('') + '</div>';
    return out + '<div class="setbar"><button class="ghost" data-mkset>この当たりともう1枚をセットにする</button></div><div id="relr"></div>';
  }
  function bindSetSwap(m, pt, hi) {
    var h = pt.hits[hi]; if (!h) return;
    var free = function (p) { return p.kind !== 'filler' && !p.mis && p.id !== h.p.id && p.stock - usedIn(pt, p.id) > 0; };
    var put = function (np) {
      if (h.n > 1) { h.n--; pt.hits.splice(hi + 1, 0, { p: np, n: 1, role: h.role }); } else h.p = np;
      recalc(pt); m.remove(); renderMake();
    };
    m.querySelectorAll('[data-unset]').forEach(function (b) { b.onclick = function () { put(h.p.set[Number(b.dataset.unset)]); }; });
    var mk = m.querySelector('[data-mkset]');
    if (!mk) return;
    mk.onclick = function () {
      var box = m.querySelector('#relr'), base = h.p;
      box.innerHTML = '<div class="sm">「' + esc(base.name) + '」と一緒にするもう1枚を選んでください（関連しそうなものを先に出しています）</div>' +
        '<div class="srch"><input id="sq" placeholder="カード名・BOX名で探す"><button class="ghost" id="sqs">探す</button></div><div id="sqr"></div>';
      var draw = function (list) {
        var arr = list.slice(0, 36), el = box.querySelector('#sqr');
        el.innerHTML = arr.length ? '<div class="cards">' + arr.map(function (q, k) { return '<div class="cwrap">' + card({ p: q, n: 1, role: q.kind === 'box' ? 'BOX' : q.kind === 'psa' ? 'PSA' : (q.cond || '').replace('状態', '') || 'カード' }, false, 'data-sp="' + k + '"') + '<div class="stocktag">セットにすると マスタ ' + yen(base.sell + q.sell) + '・原価 ' + yen(base.cost + q.cost) + '</div></div>'; }).join('') + '</div>' : '<div class="msg sub">見つかりません</div>';
        el.querySelectorAll('[data-sp]').forEach(function (b) { b.onclick = function () { put(mkSet(base, arr[Number(b.dataset.sp)])); }; });
      };
      var all = S.inv.filter(free);
      draw(all.filter(function (q) { return related(base, q); }).sort(function (a, b) { return b.sell - a.sell; }).concat(all.filter(function (q) { return !related(base, q); }).sort(function (a, b) { return b.sell - a.sell; }).slice(0, 12)));
      var go = function () { var q = box.querySelector('#sq').value.trim(); if (q) draw(all.filter(function (x) { return x.name.indexOf(q) >= 0; }).sort(function (a, b) { return b.sell - a.sell; })); };
      box.querySelector('#sqs').onclick = go; box.querySelector('#sq').onkeydown = function (e) { if (e.key === 'Enter') go(); };
    };
  }
  // 下枠の手直し（全部の価格帯）：枚数を変える・入れ替える・外す・足す。口数は変えず、ほかの下枠で合わせる
  function fillAvail(pt, p) { return p.stock - usedIn(pt, p.id); }
  function takeFromOthers(pt, keep, n) { // ほかの下枠から n 口減らす（多いものから）。減らせた数を返す
    var got = 0;
    pt.filler.filter(function (x) { return x !== keep; }).sort(function (a, b) { return b.n - a.n; }).forEach(function (x) { if (got < n) { var m = Math.min(n - got, x.n); x.n -= m; got += m; } });
    pt.filler = pt.filler.filter(function (x) { return x.n > 0 || x === keep; });
    return got;
  }
  function giveToOthers(pt, keep, n) { // ほかの下枠を n 口増やす（いちばん多い下枠に。在庫が足りなければルールの下枠から）
    if (n <= 0) return;
    var o = pt.filler.filter(function (x) { return x !== keep && fillAvail(pt, x.p) >= n; }).sort(function (a, b) { return b.n - a.n; })[0];
    if (o) { o.n += n; return; }
    var lf = {}; S.inv.forEach(function (x) { lf[x.id] = fillAvail(pt, x); });
    var uid = {}; if (keep) uid[keep.p.id] = 1;
    makeFillerByRule(pt.L, n, lf, uid, pt.price, []).forEach(function (a) { var ex = pt.filler.find(function (x) { return x.p.id === a.p.id; }); if (ex) ex.n += a.n; else pt.filler.push(a); });
  }
  function fillPicker(pi, title, exclude, onPick) {
    var pt = S.patterns[pi];
    var KT = [['filler', '【@】商品'], ['pack', 'パック'], ['card', 'シングル'], ['box', 'BOX'], ['psa', 'PSA'], ['supply', 'サプライ']];
    var first = (pt.filler[0] && pt.filler[0].p.kind) || 'filler', kind = first;
    var m = modal('<div class="mh">' + esc(title) + '</div><div class="sortbar">' + KT.map(function (k) { return '<button class="ghost' + (k[0] === kind ? ' on' : '') + '" data-kt="' + k[0] + '">' + k[1] + '</button>'; }).join('') + '</div>' +
      '<div class="srch"><input id="q" placeholder="名前で探す（空なら全部）"><button class="ghost" id="qs">探す</button></div><div id="cl"></div>' +
      '<div class="acts"><button class="ghost" data-x>閉じる</button></div>');
    function draw() {
      var q = m.querySelector('#q').value.trim();
      var list = S.inv.filter(function (p) { return p.kind === kind && p.id !== exclude && fillAvail(pt, p) > 0 && (!q || p.name.indexOf(q) >= 0); }).sort(function (a, b) { return a.cost - b.cost || b.stock - a.stock; }).slice(0, 60);
      m.querySelector('#cl').innerHTML = '<div class="sm">原価の安い順（60件まで）。在庫が残っているものだけ出ます。</div>' + candHTML(list, pi);
      m.querySelectorAll('#cl [data-pick]').forEach(function (b) { b.onclick = function () { var p = S.inv.find(function (x) { return x.id === Number(b.dataset.pick); }); if (p) { m.remove(); onPick(p); } }; });
    }
    m.querySelectorAll('[data-kt]').forEach(function (b) { b.onclick = function () { kind = b.dataset.kt; m.querySelectorAll('[data-kt]').forEach(function (x) { x.classList.toggle('on', x === b); }); draw(); }; });
    m.querySelector('#qs').onclick = draw; m.querySelector('#q').onkeydown = function (e) { if (e.key === 'Enter') draw(); };
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
    draw();
  }
  function askCount(title, def, max, onOk) {
    var m = modal('<div class="mh">' + esc(title) + '</div><div class="frm"><label>何口分入れますか（最大 ' + max + '）<input id="cn" type="number" min="1" max="' + max + '" value="' + Math.min(def, max) + '"></label></div>' +
      '<div class="acts"><button class="ghost" data-x>やめる</button><button class="primary" data-ok>決める</button></div>');
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
    m.querySelector('[data-ok]').onclick = function () { var n = Math.max(1, Math.min(max, Math.round(Number(m.querySelector('#cn').value) || 0))); m.remove(); onOk(n); };
  }
  function openFillAdd(pi) {
    var pt = S.patterns[pi];
    fillPicker(pi, '下枠に足すものを選ぶ（足した分、ほかの下枠が減ります）', null, function (p) {
      var others = pt.filler.reduce(function (s, x) { return s + (x.p.id === p.id ? 0 : x.n); }, 0);
      var max = Math.min(fillAvail(pt, p), others);
      if (max <= 0) { alert('減らせる下枠がないので足せません'); return; }
      askCount('「' + p.name + '」を下枠に足す', 1, max, function (n) {
        var ex = pt.filler.find(function (x) { return x.p.id === p.id; });
        var tgt = ex || { p: p, n: 0 }; if (!ex) pt.filler.push(tgt);
        tgt.n += takeFromOthers(pt, tgt, n);
        recalc(pt); renderMake();
      });
    });
  }
  function openFillEdit(pi, fi) {
    var pt = S.patterns[pi], f = pt.filler[fi];
    var others = pt.filler.reduce(function (s, x) { return s + (x === f ? 0 : x.n); }, 0);
    var max = f.n + Math.min(fillAvail(pt, f.p), others);
    var m = modal('<div class="mh">下枠「' + esc(f.p.name) + '」×' + f.n + '（原価 ' + yen(f.p.cost) + '）</div><div class="frm">' +
      '<label>枚数（1〜' + max + '）<input id="fn" type="number" min="1" max="' + max + '" value="' + f.n + '"></label>' +
      '<div class="sm">' + (others ? '増やした分・減らした分は、ほかの下枠で合わせます（口数は' + pt.init + '口のまま）。' : '下枠がこれ1種類だけなので、枚数は変えられません。先に「＋下枠を足す」でほかのものを入れると、その分こちらが減ります。') + '</div></div>' +
      '<div class="acts"><button class="ghost danger" data-rmf' + (others || pt.filler.length > 1 ? '' : ' disabled') + '>外す</button><button class="ghost" data-swf>ほかのものに入れ替える</button><button class="ghost" data-x>閉じる</button><button class="primary" data-ok>枚数を変える</button></div>');
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
    m.querySelector('[data-ok]').onclick = function () {
      var k = Math.max(1, Math.min(max, Math.round(Number(m.querySelector('#fn').value) || f.n)));
      if (k > f.n) f.n += takeFromOthers(pt, f, k - f.n); else if (k < f.n) { var d = f.n - k; f.n = k; giveToOthers(pt, f, d); }
      m.remove(); recalc(pt); renderMake();
    };
    m.querySelector('[data-rmf]').onclick = function () {
      var n = f.n; pt.filler.splice(pt.filler.indexOf(f), 1); giveToOthers(pt, null, n);
      m.remove(); recalc(pt); renderMake();
    };
    m.querySelector('[data-swf]').onclick = function () {
      m.remove();
      fillPicker(pi, '「' + f.p.name + '」×' + f.n + ' と入れ替えるものを選ぶ', f.p.id, function (p) {
        var ex = pt.filler.find(function (x) { return x.p.id === p.id; });
        var can = Math.min(f.n, fillAvail(pt, p));
        if (ex) { ex.n += can; } else pt.filler.push({ p: p, n: can });
        var rest = f.n - can; pt.filler.splice(pt.filler.indexOf(f), 1);
        if (rest > 0) giveToOthers(pt, null, rest);
        recalc(pt); renderMake();
      });
    };
  }
  // 下枠（シングル）の入れ替え
  function openFillSwap(pi, fi) {
    var pt = S.patterns[pi], f = pt.filler[fi], L = pt.L, price = pt.price;
    var avail = function (p) { return p.kind === (L.fill.kind || 'card') && !p.mis && p.id !== f.p.id && p.stock - usedIn(pt, p.id) > 0; };
    var list = S.inv.filter(avail);
    var m = modal('<div class="mh">下枠「' + esc(f.p.name) + '」（原価 ' + yen(f.p.cost) + '）を入れ替える</div>' +
      '<div class="sm">' + fillKindName(L) + 'の在庫すべて（目安：マスタ' + yen(L.fill.single) + '以上・小当たり未満）</div>' + sortBar() + '<div id="cl"></div>' +
      '<div class="srch"><input id="q" placeholder="カード名で探す"><button class="ghost" id="qs">探す</button></div><div id="qr"></div>' +
      '<div class="acts"><button class="ghost" data-x>閉じる</button></div>');
    function pick(id) {
      var p = S.inv.find(function (x) { return x.id === id; }); if (!p) return;
      if (f.n > 1) { f.n--; pt.filler.push({ p: p, n: 1 }); } else { f.p = p; }
      recalc(pt); m.remove(); renderMake();
    }
    function bindPick(el) { el.querySelectorAll('[data-pick]').forEach(function (b) { b.onclick = function () { pick(Number(b.dataset.pick)); }; }); }
    bindPick(m);
    pagedList(m, list, f.p.cost, pi, bindPick);
    var search = function () {
      var q = m.querySelector('#q').value.trim(); if (!q) return;
      var r = S.inv.filter(function (p) { return avail(p) && p.name.indexOf(q) >= 0; }).sort(function (a, b) { return b.cost - a.cost; }).slice(0, 24);
      m.querySelector('#qr').innerHTML = candHTML(r, pi); bindPick(m.querySelector('#qr'));
    };
    m.querySelector('#qs').onclick = search; m.querySelector('#q').onkeydown = function (e) { if (e.key === 'Enter') search(); };
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
  }
  // 入れ替え候補：在庫すべてを「原価が近い順／高い順／安い順」で、40件ずつ表示
  function sortBar() {
    return '<div class="sortbar"><button class="ghost on" data-sort="near">原価が近い順</button><button class="ghost" data-sort="hi">高い順</button><button class="ghost" data-sort="lo">安い順</button></div>';
  }
  function pagedList(m, list, target, pi, bindPick) {
    var box = m.querySelector('#cl'), mode = 'near', shownN = 0, sorted = [];
    var t = Math.max(target, 1), pt = S.patterns[pi], L = pt && pt.L;
    // BOX優先の値段（1000/2000/25000円）は、原価が近い順でもBOXを先に出す
    var boxFirst = !!(L && L.dupFirst), rk = function (p) { return boxFirst && L.kinds[0].indexOf(p.kind) < 0 ? 1 : 0; };
    if (boxFirst) { var nb = m.querySelector('[data-sort=near]'); if (nb) nb.textContent = 'BOX優先・原価が近い順'; }
    function sortIt() {
      sorted = list.slice().sort(function (a, b) {
        if (mode === 'near' && rk(a) !== rk(b)) return rk(a) - rk(b);
        if (mode === 'hi') return b.cost - a.cost || b.sell - a.sell;
        if (mode === 'lo') return a.cost - b.cost || a.sell - b.sell;
        return Math.abs(Math.log(Math.max(a.cost, 1) / t)) - Math.abs(Math.log(Math.max(b.cost, 1) / t));
      });
    }
    function more() {
      var next = sorted.slice(shownN, shownN + 40); shownN += next.length;
      var old = box.querySelector('.morebtn'); if (old) old.remove();
      var wrap = document.createElement('div'); wrap.innerHTML = candHTML(next, pi);
      if (!shownN) { box.innerHTML = wrap.innerHTML; return; }
      box.appendChild(wrap); bindPick(wrap);
      if (shownN < sorted.length) {
        var b = document.createElement('button'); b.className = 'ghost morebtn'; b.textContent = 'もっと見る（残り' + (sorted.length - shownN) + '件）';
        b.onclick = more; box.appendChild(b);
      }
    }
    function reset() { sortIt(); shownN = 0; box.innerHTML = ''; more(); }
    m.querySelectorAll('[data-sort]').forEach(function (b) {
      b.onclick = function () { mode = b.dataset.sort; m.querySelectorAll('[data-sort]').forEach(function (x) { x.classList.toggle('on', x === b); }); reset(); };
    });
    reset();
  }
  function openAdd(pi, fixedRole) {
    var pt = S.patterns[pi], L = pt.L, price = pt.price;
    var avail = function (p) { return p.kind !== 'filler' && !p.mis && p.stock - usedIn(pt, p.id) > 0; };
    var kindRank = function (p) { for (var g = 0; g < L.kinds.length; g++) if (L.kinds[g].indexOf(p.kind) >= 0) return g; return L.kinds.length; };
    var shown = {}, groups = [];
    // ルールの枠ごと：値段の範囲内で、優先する種類→マスタ価格の高い順
    function inRange(r) { return S.inv.filter(function (p) { return avail(p) && p.sell >= r[0] * price && p.sell < r[1] * price; }); }
    function byRule(list) { return list.sort(function (x, y) { return kindRank(x) - kindRank(y) || (histCount(y, L.base) > 0) - (histCount(x, L.base) > 0) || y.sell - x.sell; }); }
    if (fixedRole === 'ラストワン') {
      var t = L.last * price;
      var near = S.inv.filter(function (p) { return avail(p) && !isDeck(p) && !suspectPrice(p) && p.sell >= t * 0.6 && p.sell <= t * 1.6; })
        .sort(function (x, y) { return kindRank(x) - kindRank(y) || Math.abs(Math.log(x.sell / t)) - Math.abs(Math.log(y.sell / t)); });
      groups.push({ title: 'ラストワン賞の目安（マスタ' + yen(t) + '前後）', role: 'ラストワン', list: near });
    } else {
      [['大当たり', [L.big[0], Math.max(L.big[1], L.top)]], ['中当たり', L.mid], ['小当たり', L.small]].forEach(function (g) {
        var list = byRule(inRange(g[1]));
        list.forEach(function (p) { shown[p.id] = 1; });
        groups.push({ title: g[0] + '（マスタ' + yen(g[1][0] * price) + '〜' + yen(g[1][1] * price) + '）', role: g[0], list: list });
      });
    }
    if (fixedRole === 'ラストワン') groups[0].list.forEach(function (p) { shown[p.id] = 1; });
    var others = S.inv.filter(function (p) { return avail(p) && !shown[p.id]; }).sort(function (x, y) { return y.sell - x.sell; });
    groups.push({ title: 'その他の在庫（ルールの範囲外・マスタ価格の高い順）', role: fixedRole || '', list: others, other: true });
    var PAGE = 12;
    var cap = pt.rev * (L.costMax || 1) - pt.cost; // 上限まであといくら（下枠1枚分は戻る）
    var m = modal('<div class="mh">' + esc(pt.name) + ' に' + (fixedRole === 'ラストワン' ? 'ラストワン賞を入れる' : '当たりを足す') + '</div>' +
      '<div class="sm">足すと、下枠が1枚減ります（口数は' + pt.init + '口のまま）。今の原価率 ' + pct(pt.costr) + '／上限 ' + pct(L.costMax) + '。種類は「' + esc(L.label) + '」の順に並べています。</div>' +
      '<div class="srch"><input id="q" placeholder="カード名・BOX名で探す"><button class="ghost" id="qs">探す</button></div><div id="qr"></div>' +
      groups.map(function (g, gi) { return '<div class="mh2' + (g.other ? ' s' : '') + '">' + esc(g.title) + '　<span class="cs">' + g.list.length + '件</span></div><div id="g' + gi + '"></div>'; }).join('') +
      '<div class="acts"><button class="ghost" data-x>閉じる</button></div>');
    function drawGroup(gi, n) {
      var g = groups[gi], el = m.querySelector('#g' + gi);
      el.innerHTML = candHTML(g.list.slice(0, n), pi, g.role, cap) + (g.list.length > n ? '<button class="ghost more" data-more="' + gi + '">もっと見る（残り' + (g.list.length - n) + '件）</button>' : '');
      bindPick(el);
      var mb = el.querySelector('[data-more]'); if (mb) mb.onclick = function () { drawGroup(gi, n + PAGE * 2); };
    }
    groups.forEach(function (g, gi) { drawGroup(gi, PAGE); });
    function bindPick(el) {
      el.querySelectorAll('[data-pick]').forEach(function (b) {
        b.onclick = function () {
          var p = S.inv.find(function (x) { return x.id === Number(b.dataset.pick); }); if (!p) return;
          var role = fixedRole || b.dataset.prole || roleOf(L, price, p);
          var ex = pt.hits.find(function (x) { return x.p.id === p.id && x.role === role; });
          if (ex) ex.n++; else pt.hits.push({ p: p, n: 1, role: role });
          pt.hits.sort(function (a, b) { return roleRank(a.role) - roleRank(b.role) || b.p.cost - a.p.cost; });
          if (role !== 'ラストワン') adjustFiller(pt, -1); recalc(pt); m.remove(); renderMake(); // ラストワン賞は口数に含めないので下枠は減らさない
        };
      });
    }
    var search = function () {
      var q = m.querySelector('#q').value.trim(); if (!q) return;
      var r = S.inv.filter(function (p) { return avail(p) && p.name.indexOf(q) >= 0; }).sort(function (a, b) { return b.sell - a.sell; }).slice(0, 36);
      m.querySelector('#qr').innerHTML = '<div class="mh2">「' + esc(q) + '」の検索結果</div>' + candHTML(r, pi, fixedRole || '', cap); bindPick(m.querySelector('#qr'));
    };
    m.querySelector('#qs').onclick = search; m.querySelector('#q').onkeydown = function (e) { if (e.key === 'Enter') search(); };
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
  }

  function roleRank(r) { return ({ TOP: 0, '大当たり': 1, '中当たり': 2, '当たり': 2, '小当たり': 3, 'ラストワン': 4 })[r] != null ? ({ TOP: 0, '大当たり': 1, '中当たり': 2, '当たり': 2, '小当たり': 3, 'ラストワン': 4 })[r] : 5; }

  function patternsHTML() {
    return '<div class="grid">' + S.patterns.map(function (pt, i) {
      var idx = function (h) { return 'data-pi="' + i + '" data-hi="' + pt.hits.indexOf(h) + '"'; };
      var sec = function (label, roles, addRole) {
        var hs = pt.hits.filter(function (h) { return roles.indexOf(h.role) >= 0; });
        var addBtn = addRole === 'ラストワン' ? (hs.length ? '' : '<button class="addc" data-add="' + i + '" data-role="ラストワン">＋<br>ラストワン賞を<br>選ぶ</button>') : '';
        // 足りない枚数ぶん、空のカード枠を出す（押すとその枠に足せる）
        var have = hs.reduce(function (s, h) { return s + h.n; }, 0), miss = pt.miss0 && pt.miss0[label] ? Math.max(0, pt.miss0[label] - Math.max(0, have - (pt.cnt0[label] || 0))) : 0;
        for (var b = 0; b < miss; b++) addBtn += '<button class="blankc" data-add="' + i + '" data-role="' + esc(label) + '"><span class="bk">在庫が<br>足りません</span><span class="bs">押して足す</span></button>';
        if (!hs.length && !addBtn) return '';
        return '<div class="sec"><div class="sech">' + label + '<span>' + hs.reduce(function (s, h) { return s + h.n; }, 0) + '枚</span></div><div class="cards">' + hs.map(function (h) { return card(h, false, idx(h)); }).join('') + addBtn + '</div></div>';
      };
      var nHit = pt.hits.reduce(function (s, h) { return s + (h.role === 'ラストワン' ? 0 : h.n); }, 0), hasLast = pt.hits.some(function (h) { return h.role === 'ラストワン'; });
      var fN = pt.filler.reduce(function (s, f) { return s + f.n; }, 0), fC = pt.filler.reduce(function (s, f) { return s + f.p.cost * f.n; }, 0);
      var fill = pt.filler.length > 4 ? (pt.filler.length + '種類 ' + fN + '枚（1枚平均 原価' + yen(fC / Math.max(fN, 1)) + '）')
        : pt.filler.map(function (f) { return esc(f.p.name.replace(/ポケモン\/トレーナーズ/, '')) + ' ×' + f.n; }).join('　');
      var after = Math.min(pt.costr + pt.L.refillUp, 1.5);
      return '<div class="pt"><div class="pth"><div><div class="pn">' + esc(pt.name) + '</div><div class="pnote">' + esc(pt.note) + '</div></div></div>' +
        '<div class="kpi"><div><b>' + pct(pt.costr) + '</b><span>原価率' + (rawCost(pt) != null ? '（仮の原価で計算）' : '') + '</span></div><div><b>' + yen(pt.rev - pt.cost) + '</b><span>粗利（完売時）' + (rawCost(pt) != null ? '（仮の原価で計算）' : '') + '</span></div><div><b>' + nHit + '枚' + (hasLast ? '＋ラストワン' : '') + '</b><span>当たり</span></div></div>' +
        (rawCost(pt) != null ? '<div class="kpi kpiraw"><div><b>' + pct(rawCost(pt) / pt.rev) + '</b><span>原価率（マイカの原価のまま）</span></div><div><b>' + yen(pt.rev - rawCost(pt)) + '</b><span>粗利（マイカの原価のまま）</span></div><div><b>' + yen(pt.cost - rawCost(pt)) + '</b><span>仮で足している原価</span></div></div>' : '') +
        (pt.edited ? '<div class="edited">入れ替え済み</div>' : '') + lowCostNote(pt) +
        sec('大当たり', ['TOP', '大当たり']) + sec('中当たり', ['中当たり', '当たり']) + sec('小当たり', ['小当たり']) + sec('ラストワン賞', ['ラストワン'], 'ラストワン') +
        '<div class="addrow"><button class="ghost" data-add="' + i + '">＋ 当たりを足す</button></div>' +
        '<div class="sec"><div class="sech">下枠<span>' + fN + '口（1口平均 原価' + yen(fC / Math.max(fN, 1)) + (pt.L.fill.single ? '・マスタ' + yen(pt.L.fill.single) + '以上の' + fillKindName(pt.L) : '') + '）　押すと枚数の変更・入れ替え・外すができます</span></div><div class="cards">' +
          pt.filler.map(function (f, fi) { return card({ p: f.p, n: f.n, role: '下枠' }, false, 'data-pi="' + i + '" data-fi="' + fi + '"'); }).join('') +
          '<button class="addc" data-fadd="' + i + '">＋<br>下枠を<br>足す</button></div></div>' +
        '<div class="note2">当たりが先に出て補充すると、平均で原価率が <b>' + pct(after) + '</b> くらいまで上がります</div>' +
        (pt.warn.length ? '<div class="warn">' + pt.warn.map(esc).join('<br>') + (APPROVAL_URL && !ALL && needTotal(pt) ? '<div class="shareq"><button class="ghost" data-share="' + i + '">在庫共有で足りない当たりを募集する</button></div>' : '') + '</div>' : '') +
        '<div class="acts"><button class="ghost" data-detail="' + i + '">中身を一覧で見る</button>' + (ALL ? '<button class="primary" data-picklist="' + i + '">店舗ごとの集め先リスト</button>' : (APPROVAL_URL ? '<button class="ghost" data-sheet="' + i + '">店舗オリパシートに書き出す</button>' : '') + saveButtons(pt, i)) + '</div>' + apprLine(pt) +
        '</div>';
    }).join('') + '</div>';
  }

  function bindPatternButtons() {
    root.querySelectorAll('[data-detail]').forEach(function (b) { b.onclick = function () { showDetail(S.patterns[Number(b.dataset.detail)]); }; });
    root.querySelectorAll('[data-save]').forEach(function (b) { b.onclick = function () { confirmSave(S.patterns[Number(b.dataset.save)]); }; });
    root.querySelectorAll('[data-sheet]').forEach(function (b) { b.onclick = function () { exportSheet(S.patterns[Number(b.dataset.sheet)]); }; });
    root.querySelectorAll('[data-share]').forEach(function (b) { b.onclick = function () { requestShare(S.patterns[Number(b.dataset.share)]); }; });
    root.querySelectorAll('[data-req]').forEach(function (b) { b.onclick = function () { requestApproval(S.patterns[Number(b.dataset.req)]); }; });
    root.querySelectorAll('[data-chk]').forEach(function (b) { b.onclick = function () { checkApprovals(true); }; });
    root.querySelectorAll('[data-picklist]').forEach(function (b) { b.onclick = function () { showPickList(S.patterns[Number(b.dataset.picklist)]); }; });
    root.querySelectorAll('.cd.swap[data-hi]').forEach(function (b) { b.onclick = function () { openSwap(Number(b.dataset.pi), Number(b.dataset.hi)); }; });
    root.querySelectorAll('.cd.swap[data-fi]').forEach(function (b) { b.onclick = function () { openFillEdit(Number(b.dataset.pi), Number(b.dataset.fi)); }; });
    root.querySelectorAll('[data-fadd]').forEach(function (b) { b.onclick = function () { openFillAdd(Number(b.dataset.fadd)); }; });
    root.querySelectorAll('[data-add]').forEach(function (b) { b.onclick = function () { openAdd(Number(b.dataset.add), b.dataset.role); }; });
  }

  function modal(html) {
    var m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div class="mbox">' + html + '</div>';
    root.querySelector('.win').appendChild(m); return m;
  }

  /* ---------- 本部承認（LINE WORKS）：任意の金額で作ったオリパは、承認されてから一時保存 ---------- */
  var APPROVAL_URL = 'https://script.google.com/macros/s/AKfycbwXHuu-X3L0qzJhvaszEIm-1xdeNIqJACQ0uM7mz5Q0hvwfdF9IuQiTKr3qmscNVmnhcQ/exec';
  function needsApproval(pt) { return !!(APPROVAL_URL && pt.L && pt.L.free); }   // 任意の金額：承認が必須
  function canApprove(pt) { return !!APPROVAL_URL; }                              // 本部ルール：承認は任意（依頼してもしなくてもよい）
  function saveButtons(pt, i) {
    var a = pt.appr, save = '<button class="primary" data-save="' + i + '">マイカに一時保存</button>';
    if (!canApprove(pt)) return save;
    if (!needsApproval(pt)) {
      if (a && a.status === '承認待ち') return '<button class="ghost" data-chk="' + i + '">承認の結果を確認</button>' + save;
      if (a && a.status === '承認') return save;
      return '<button class="ghost" data-req="' + i + '">本部に承認を依頼（任意）</button>' + save;
    }
    if (a && a.status === '承認') return save;
    if (a && a.status === '承認待ち') return '<button class="ghost" data-chk="' + i + '">承認の結果を確認</button><button class="primary" disabled>承認待ち</button>';
    return '<button class="primary" data-req="' + i + '">本部に承認を依頼</button>';
  }
  function apprLine(pt) {
    if (!canApprove(pt)) return '';
    var a = pt.appr;
    if (!a && !needsApproval(pt)) return pt.apprNote ? '<div class="appr"><b>' + esc(pt.apprNote) + '</b></div>' : '';
    if (!a) return '<div class="appr">任意の金額で作ったオリパは、本部（役員）の承認後に一時保存できます。' + (pt.apprNote ? '<b>' + esc(pt.apprNote) + '</b>' : '') + '</div>';
    if (a.status === '承認待ち') return '<div class="appr wait">承認待ち（依頼番号 ' + esc(a.id) + '）… 店舗の「オリパ・買取共有」グループに送りました。結果は自動で反映されます</div>';
    if (a.status === '承認') return '<div class="appr ok">✅ 承認されました（' + esc(a.by || '') + '）</div>';
    return '<div class="appr ng">↩️ 差し戻されました（' + esc(a.by || '') + '）。理由はLINE WORKSのグループを見て、直してからもう一度依頼してください</div>';
  }
  function approvalText(pt) {
    var g = function (roles) { return pt.hits.filter(function (h) { return roles.indexOf(h.role) >= 0; }); };
    var line = function (h) { if (h.p.set) return '・【セット】' + h.p.set.map(function (q) { return q.name + '（' + (q.kind === 'psa' ? psaLabel(q) : q.cond || '') + '）'; }).join('＋') + '\n　販売' + yen(h.p.sell) + '（2枚合計）・原価' + yen(h.p.cost);
      return '・' + h.p.name + (h.n > 1 ? ' ×' + h.n : '') + '\n　' + (h.p.kind === 'psa' ? psaLabel(h.p) + '（PSA鑑定品）' : (h.p.cond || (h.p.kind === 'box' ? 'BOX' : ''))) + '・販売' + yen(h.p.sell) + '・原価' + yen(h.p.cost); };
    var sec = function (t, roles) { var l = g(roles); return l.length ? '\n［' + t + '］\n' + l.map(line).join('\n') : ''; };
    var fN = pt.filler.reduce(function (s, f) { return s + f.n; }, 0), fC = pt.filler.reduce(function (s, f) { return s + f.p.cost * f.n; }, 0);
    return pt.price.toLocaleString() + '円×' + pt.init + '口　原価率' + pct(pt.costr) + '・粗利' + yen(pt.rev - pt.cost) + '\n' + (pt.note || '') +
      sec('TOP', ['TOP']) + sec('大当たり', ['大当たり']) + sec('中当たり', ['中当たり', '当たり']) + sec('小当たり', ['小当たり']) + sec('ラストワン', ['ラストワン']) +
      '\n［下枠］' + fN + '口（原価計' + yen(fC) + '）' + (pt.filler.length <= 4 ? '\n' + pt.filler.map(function (f) { return '・' + f.p.name.replace(/ポケモン\/トレーナーズ/, '') + ' ×' + f.n; }).join('\n') : '');
  }
  // 承認依頼用：オリパの中身を1枚の画像（JPEG）に描く。マイカの画像はGAS経由で受け取る（直接だとブラウザが描かせてくれないため）
  function approvalImage(pt) {
    var hitN = pt.hits.reduce(function (s, h) { return s + h.n; }, 0);
    var fN = pt.filler.reduce(function (s, f) { return s + f.n; }, 0), fC = pt.filler.reduce(function (s, f) { return s + f.p.cost * f.n; }, 0);
    return cardSheet(pt.hits, shortName(S.sname) + '店　' + pt.price.toLocaleString() + '円 × ' + pt.init + '口',
      '原価率 ' + pct(pt.costr) + '　粗利 ' + yen(pt.rev - pt.cost) + '　売上 ' + yen(pt.rev) + '　当たり ' + hitN + '枚',
      '下枠 ' + fN + '口（原価計 ' + yen(fC) + '）　' + pt.filler.slice(0, 4).map(function (f) { return f.p.name.replace(/ポケモン\/トレーナーズ/, '') + '×' + f.n; }).join('・'));
  }
  // カードを並べた1枚の画像（JPEG・base64）。list は {p, n, role}
  async function cardSheet(list, head1, head2, foot) {
    var order = ['TOP', '大当たり', '中当たり', '当たり', '小当たり', 'ラストワン', '下枠'];
    var label = { 'TOP': 'TOP', '大当たり': '大当たり', '中当たり': '中当たり', '当たり': '中当たり', '小当たり': '小当たり', 'ラストワン': 'ラストワン', '下枠': '下枠' };
    var color = { 'TOP': '#b8860b', '大当たり': '#c0392b', '中当たり': '#d35400', '小当たり': '#6b7280', 'ラストワン': '#1e7d4f', '下枠': '#8a8478' };
    list = list.slice().sort(function (a, b) { return order.indexOf(a.role) - order.indexOf(b.role) || b.p.sell - a.p.sell; });
    var urls = []; list.forEach(function (h) { members(h.p).forEach(function (q) { if (q.img && urls.indexOf(q.img) < 0) urls.push(q.img); }); });
    var imgs = {};
    await Promise.all(urls.map(function (u) {
      return fetch(APPROVAL_URL + '?action=img&u=' + encodeURIComponent(u)).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) return;
        return new Promise(function (res) { var im = new Image(); im.onload = function () { imgs[u] = im; res(); }; im.onerror = function () { res(); }; im.src = 'data:' + j.mime + ';base64,' + j.b64; });
      }).catch(function () { });
    }));
    var COLS = Math.min(6, Math.max(4, list.length)), CW = 200, CH = 356, GAP = 12, PAD = 24, W = PAD * 2 + COLS * CW + (COLS - 1) * GAP;
    var rows = Math.ceil(list.length / COLS), H = 112 + PAD + rows * (CH + GAP) + 56;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
    var F = '"Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';
    c.fillStyle = '#f6f5f2'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1f1d1a'; c.fillRect(0, 0, W, 104);
    c.textBaseline = 'top';
    function fit(t, w) { if (c.measureText(t).width <= w) return t; while (t.length > 1 && c.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
    function wrap2(t, w) { if (c.measureText(t).width <= w) return [t]; var k = t.length; while (k > 1 && c.measureText(t.slice(0, k)).width > w) k--; return [t.slice(0, k), fit(t.slice(k), w)]; }
    c.fillStyle = '#e8c23a'; c.font = 'bold 30px ' + F; c.fillText(fit(head1, W - PAD * 2), PAD, 18);
    c.fillStyle = '#fff'; c.font = 'bold 21px ' + F; c.fillText(fit(head2, W - PAD * 2), PAD, 62);
    var y0 = 104 + PAD;
    list.forEach(function (h, i) {
      var x = PAD + (i % COLS) * (CW + GAP), y = y0 + Math.floor(i / COLS) * (CH + GAP), role = label[h.role] || h.role;
      c.fillStyle = '#fff'; c.fillRect(x, y, CW, CH); c.strokeStyle = '#e1ddd3'; c.lineWidth = 2; c.strokeRect(x, y, CW, CH);
      var im = imgs[h.p.img], ih = 196;
      if (h.p.set) { h.p.set.forEach(function (q, k) { var iq = imgs[q.img], hw = (CW - 20) / 2; if (!iq) { c.fillStyle = '#eee'; c.fillRect(x + 8 + k * (hw + 4), y + 36, hw, ih); return; } var r2 = Math.min(hw / iq.width, ih / iq.height), w2 = iq.width * r2, h2 = iq.height * r2; c.drawImage(iq, x + 8 + k * (hw + 4) + (hw - w2) / 2, y + 36 + (ih - h2) / 2, w2, h2); }); }
      else if (im) { var r = Math.min((CW - 16) / im.width, ih / im.height), dw = im.width * r, dh = im.height * r; c.drawImage(im, x + (CW - dw) / 2, y + 36 + (ih - dh) / 2, dw, dh); }
      else { c.fillStyle = '#eee'; c.fillRect(x + 8, y + 36, CW - 16, ih); }
      c.font = 'bold 17px ' + F; var tw = c.measureText(role).width + 16;
      c.fillStyle = color[role] || '#555'; c.fillRect(x, y, tw, 28); c.fillStyle = '#fff'; c.fillText(role, x + 8, y + 5);
      if (h.n > 1) { c.font = 'bold 20px ' + F; c.fillStyle = '#1f1d1a'; c.fillText('×' + h.n, x + CW - 8 - c.measureText('×' + h.n).width, y + 4); }
      var ty = y + 238, isPsa = h.p.kind === 'psa', cond = h.p.set ? 'セット：' + h.p.set.map(function (q) { return q.kind === 'psa' ? psaLabel(q) : (q.cond || ''); }).join('＋') : isPsa ? psaLabel(h.p) : (h.p.cond || (h.p.kind === 'box' ? 'BOX' : ''));
      c.font = 'bold 16px ' + F; c.fillStyle = isPsa ? '#2952a3' : '#555'; c.fillText(fit(cond, CW - 16), x + 8, ty);
      c.fillStyle = '#1f1d1a'; c.font = 'bold 16px ' + F; wrap2(h.p.name, CW - 16).forEach(function (l, k) { c.fillText(l, x + 8, ty + 21 + k * 20); });
      c.fillStyle = '#c0392b'; c.font = 'bold 18px ' + F; c.fillText('販売 ' + yen(h.p.sell), x + 8, ty + 66);
      c.fillStyle = '#555'; c.font = '16px ' + F; c.fillText('原価 ' + yen(h.p.cost), x + 8, ty + 90);
    });
    if (foot) { c.fillStyle = '#1f1d1a'; c.font = 'bold 20px ' + F; c.fillText(fit(foot, W - PAD * 2), PAD, y0 + rows * (CH + GAP) + 10); }
    return cv.toDataURL('image/jpeg', 0.86).split(',')[1];
  }
  // 足りない当たりを、LINE WORKSの「在庫共有」グループで募集する
  function needTotal(pt) { var n = pt.need || {}; return Object.keys(n).reduce(function (s, k) { return s + (n[k] || 0); }, 0); }
  function shareText(pt) {
    var L = pt.L, p = pt.price, n = pt.need || {};
    var rng = { 'TOP': [L.top * 0.75, L.top * 1.35], '大当たり': [L.big[0], Math.min(L.big[1], L.top)], '中当たり': L.mid, '小当たり': L.small, 'ラストワン': [L.last * 0.7, L.last * 1.4] };
    var r100 = function (v) { return Math.round(v / 100) * 100; };
    var EM = { 'TOP': '👑', '大当たり': '🔥', '中当たり': '⭐', '小当たり': '✨', 'ラストワン': '🎁' };
    var lines = ['TOP', '大当たり', '中当たり', '小当たり', 'ラストワン'].filter(function (k) { return n[k] > 0; }).map(function (k) {
      return EM[k] + ' ' + (k === 'ラストワン' ? 'ラストワン賞' : k) + '：販売' + yen(r100(rng[k][0] * p)) + '〜' + yen(r100(rng[k][1] * p)) + 'くらい ×' + n[k] + '枚';
    });
    var bar = '━━━━━━━━━━━━';
    return '📣【在庫募集】' + shortName(S.sname) + '店\n🎰 ' + p.toLocaleString() + '円×' + pt.init + '口のオリパで、当たりが足りません\n' + bar + '\n' + lines.join('\n') + '\n' + bar +
      '\n📦 入れたい種類：' + (L.label || '') + '\n🙋 送れる店舗は、このトークで返信してください！';
  }
  function requestShare(pt) {
    var m = modal('<div class="mh">在庫共有グループで募集しますか？</div><div class="frm">' +
      '<label>送る文（直せます）<textarea id="st" rows="9" style="width:100%;font-size:14px;padding:8px;border:1.5px solid #d6d2c8;border-radius:8px"></textarea></label>' +
      '<div class="sm">LINE WORKSの「在庫共有」グループ（全店が入っているグループ）に、この文が届きます。</div></div>' +
      '<div class="acts"><button class="ghost" data-x>やめる</button><button class="primary" data-ok>送る</button></div>');
    var ta = m.querySelector('#st'); ta.value = shareText(pt);
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
    m.querySelector('[data-ok]').onclick = async function () {
      var b = this;
      b.disabled = true; b.textContent = '送信中…';
      try {
        var j = await fetch(APPROVAL_URL, { method: 'POST', body: JSON.stringify({ action: 'share', store: shortName(S.sname), requester: shortName(S.sname) + '店', text: ta.value }) }).then(function (r) { return r.json(); });
        if (!j.ok) throw new Error(j.error || '送信できませんでした');
        m.querySelector('.mbox').innerHTML = '<div class="mh">在庫共有グループに送りました</div><div class="sm">送れる店舗からの返信は、LINE WORKSのグループで確認してください。</div><div class="acts"><button class="primary" data-x>OK</button></div>';
        m.querySelector('[data-x]').onclick = function () { m.remove(); };
      } catch (e) {
        b.disabled = false; b.textContent = '送る';
        var er = m.querySelector('.err') || m.querySelector('.frm').appendChild(document.createElement('div')); er.className = 'err'; er.textContent = '送れませんでした：' + e.message;
      }
    };
  }
  function requestApproval(pt) {
    var last = ''; try { last = localStorage.getItem('ndk_oripa_requester') || ''; } catch (e) { }
    var m = modal('<div class="mh">本部に承認を依頼しますか？</div><div class="frm">' +
      '<label>依頼する人の名前（必須） <input id="rq" value="' + esc(last) + '"></label>' +
      '<label>ひとこと（任意） <input id="rc" placeholder="例：TikTok用に高額を多めにしました"></label>' +
      '<div class="sm">' + esc(shortName(S.sname)) + '店の「オリパ・買取共有」グループ（LINE WORKS）に、下の画像と「承認する／差し戻す」ボタンが届きます。</div>' +
      '<div class="aprev"><div class="msg sub">送る画像を作っています…</div></div></div>' +
      '<div class="acts"><button class="ghost" data-x>やめる</button><button class="primary" data-ok>依頼する</button></div>');
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
    var imgP = approvalImage(pt).then(function (b64) {
      var box = m.querySelector('.aprev'); if (box) box.innerHTML = '<img src="data:image/jpeg;base64,' + b64 + '">'; return b64;
    }, function () { var box = m.querySelector('.aprev'); if (box) box.innerHTML = '<div class="msg sub">画像を作れなかったので、文章だけで送ります</div>'; return ''; });
    m.querySelector('[data-ok]').onclick = async function () {
      var b = this, name = m.querySelector('#rq').value.trim();
      if (!name) { m.querySelector('#rq').focus(); return; }
      try { localStorage.setItem('ndk_oripa_requester', name); } catch (e) { }
      b.disabled = true; b.textContent = '画像を作成中…';
      try {
        var image = await imgP;
        b.textContent = '送信中…';
        var summary = pt.price.toLocaleString() + '円×' + pt.init + '口　原価率' + pct(pt.costr) + '・粗利' + yen(pt.rev - pt.cost);
        var r = await fetch(APPROVAL_URL, { method: 'POST', body: JSON.stringify({ action: 'request', store: shortName(S.sname), requester: name, comment: m.querySelector('#rc').value.trim(),
          price: pt.price, init: pt.init, costr: pct(pt.costr), text: approvalText(pt), summary: summary, image: image }) });
        var j = await r.json();
        if (!j.ok) throw new Error(j.error || '送信できませんでした');
        pt.appr = { id: j.id, status: '承認待ち' }; pt.apprNote = '';
        m.remove(); renderMake(); startApprovalPolling();
      } catch (e) {
        b.disabled = false; b.textContent = '依頼する';
        var er = m.querySelector('.err') || m.querySelector('.frm').appendChild(document.createElement('div')); er.className = 'err'; er.textContent = '依頼できませんでした：' + e.message;
      }
    };
  }
  var apprTimer = null;
  function startApprovalPolling() { if (!apprTimer) apprTimer = setInterval(function () { if (!document.getElementById('ndk-oripa-host')) { clearInterval(apprTimer); return; } checkApprovals(false); }, 15000); }
  async function checkApprovals(manual) {
    var list = S.patterns.filter(function (p) { return p.appr && p.appr.status === '承認待ち'; });
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      try {
        var j = await fetch(APPROVAL_URL + '?action=status&id=' + encodeURIComponent(list[i].appr.id)).then(function (r) { return r.json(); });
        if (j.ok && j.status && j.status !== '承認待ち' && list[i].appr) { list[i].appr = { id: j.id, status: j.status, by: j.by }; changed = true; }
      } catch (e) { }
    }
    if (changed || manual) renderMake();
  }
  // 全店モード：どの店から何を集めるかの一覧（LINE WORKSに貼る文・CSV）
  function showPickList(pt) {
    var rows = flatHits(pt.hits).map(function (h) { return { p: h.p, n: h.n, role: h.role }; }).concat(pt.filler.map(function (f) { return { p: f.p, n: f.n, role: '下枠' }; }));
    var by = {}; rows.forEach(function (r) { var k = r.p.sname || '?'; (by[k] = by[k] || []).push(r); });
    var stores = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length; });
    var title = pt.price.toLocaleString() + '円×' + pt.init + '口（原価率 ' + pct(pt.costr) + '）';
    var sum = function (st, f) { return by[st].reduce(function (s, r) { return s + f(r); }, 0); };
    var text = '【オリパ用の集め先】' + title + '\n' + stores.map(function (st) {
      return '\n■' + st + '（' + sum(st, function (r) { return r.n; }) + '点・原価' + yen(sum(st, function (r) { return r.p.cost * r.n; })) + '）\n' + by[st].map(function (r) { return '・' + r.role + '：' + (r.p.kind === 'psa' ? '《' + psaLabel(r.p) + '》' : '') + r.p.name + (r.p.cond && r.p.kind !== 'psa' ? '（' + r.p.cond + '）' : '') + ' ×' + r.n; }).join('\n');
    }).join('\n');
    var m = modal('<div class="mh">店舗ごとの集め先リスト　' + esc(title) + '</div>' +
      stores.map(function (st) {
        return '<div class="mh2">' + esc(st) + '　' + sum(st, function (r) { return r.n; }) + '点・原価 ' + yen(sum(st, function (r) { return r.p.cost * r.n; })) + '</div><table><tr><th>区分</th><th>商品</th><th>状態</th><th>数</th><th>マスタ</th><th>原価</th><th>在庫</th></tr>' +
          by[st].map(function (r) { return '<tr><td>' + esc(r.role) + '</td><td>' + (r.p.kind === 'psa' ? '《' + esc(psaLabel(r.p)) + '》' : '') + esc(r.p.name) + '</td><td>' + esc(condText(r.p)) + '</td><td>' + r.n + '</td><td>' + yen(r.p.sell) + '</td><td>' + yen(r.p.cost * r.n) + '</td><td>' + r.p.stock + '</td></tr>'; }).join('') + '</table>';
      }).join('') +
      '<div class="sm">「各店に発送依頼を送る」で、各店の「オリパ・買取共有」グループに、その店が送るカードの画像と文が届きます。「文をコピー」はLINE WORKSなどにそのまま貼れます。各店の在庫はまだ何も動かしていません。</div>' +
      '<div class="acts"><button class="ghost" data-x>閉じる</button><button class="ghost" data-copy>文をコピー</button>' + (APPROVAL_URL ? '<button class="primary" data-send>各店に発送依頼を送る</button>' : '') + '</div>');
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
    if (m.querySelector('[data-send]')) m.querySelector('[data-send]').onclick = function () { requestPick(pt, by, stores, title); };
    m.querySelector('[data-copy]').onclick = function () {
      var b = this;
      var done = function () { b.textContent = 'コピーしました'; setTimeout(function () { b.textContent = '文をコピー'; }, 1500); };
      var fallback = function () { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { } ta.remove(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    };
  }
  // 全店モード：各店の「オリパ・買取共有」グループに、その店が送るカードの画像＋文で発送依頼を送る
  var PICK_OK = ['千葉中央', '柏', '町田', '松戸', '中野', 'お台場', '津田沼', '横浜'];
  function dueDefault() { var d = new Date(Date.now() + 3 * 86400000 + 9 * 3600000); return d.toISOString().slice(0, 10); }
  function pickText(st, rows, title, note, due) {
    return '【発送依頼】TikTok・通販オリパ用（' + title + '）\n' + st + '店から送ってほしいもの：' + rows.reduce(function (s, r) { return s + r.n; }, 0) + '点\n' +
      rows.map(function (r) { return '・' + r.role + '：' + (r.p.kind === 'psa' ? '《' + psaLabel(r.p) + '》' : '') + r.p.name + (r.p.cond && r.p.kind !== 'psa' ? '（' + r.p.cond + '）' : '') + ' ×' + r.n; }).join('\n') +
      (note ? '\n\n' + note : '') + (due ? '\n期限：' + due.replace(/^\d+-0?(\d+)-0?(\d+)$/, '$1/$2') : '') + '\n\n送ったら、下の「送りました」ボタンを押してください（LINE WORKSのタスクも自動で完了になります）。';
  }
  function requestPick(pt, by, stores, title) {
    var last = ''; try { last = localStorage.getItem('ndk_oripa_picknote') || ''; } catch (e) { }
    var m = modal('<div class="mh">各店に発送依頼を送りますか？</div><div class="frm">' +
      '<div class="sm">チェックした店舗の「オリパ・買取共有」グループに、その店が送るカードの画像と一覧の文が届きます。あわせて、店舗のアカウントに「発送依頼」のタスク（期限つき）が入ります。店舗は「送りました」ボタンかタスクの完了のどちらかを押せば、両方そろいます。</div>' +
      '<div class="pkst">' + stores.map(function (st) {
        var ok = PICK_OK.indexOf(st) >= 0, n = by[st].reduce(function (s, r) { return s + r.n; }, 0);
        return '<label class="ck"><input type="checkbox" data-st="' + esc(st) + '"' + (ok ? ' checked' : ' disabled') + '> ' + esc(st) + '（' + n + '点）' + (ok ? '' : '<span class="sub">　グループがないので送れません（文をコピーで伝えてください）</span>') + '<span class="pkr" data-r="' + esc(st) + '"></span></label>';
      }).join('') + '</div>' +
      '<label>期限（店舗のLINE WORKSにタスクとして入ります） <input type="date" id="pd" value="' + dueDefault() + '"></label>' +
      '<label>全店に共通のひとこと（送り先など。任意） <textarea id="pn" rows="3" style="width:100%;font-size:14px;padding:8px;border:1.5px solid #d6d2c8;border-radius:8px" placeholder="例：本部（柏店）へ送ってください"></textarea></label></div>' +
      '<div class="acts"><button class="ghost" data-x>やめる</button><button class="primary" data-ok>送る</button></div>');
    m.querySelector('#pn').value = last;
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
    m.querySelector('[data-ok]').onclick = async function () {
      var b = this, note = m.querySelector('#pn').value.trim(), due = m.querySelector('#pd').value || '';
      try { localStorage.setItem('ndk_oripa_picknote', note); } catch (e) { }
      var sel = [].slice.call(m.querySelectorAll('[data-st]:checked')).map(function (x) { return x.dataset.st; });
      if (!sel.length) return;
      b.disabled = true; m.querySelector('[data-x]').disabled = true;
      var ng = 0;
      for (var i = 0; i < sel.length; i++) {
        var st = sel[i], rows = by[st], mark = m.querySelector('[data-r="' + st + '"]');
        b.textContent = '送信中… ' + (i + 1) + '/' + sel.length; if (mark) mark.textContent = '　送信中…';
        try {
          var n = rows.reduce(function (s, r) { return s + r.n; }, 0), c = rows.reduce(function (s, r) { return s + r.p.cost * r.n; }, 0);
          var image = '';
          try { image = await cardSheet(rows, '発送依頼　' + st + '店 → TikTok・通販オリパ', title + '　' + n + '点・原価 ' + yen(c), note); } catch (e) { }
          var task = { title: '【発送依頼】TikTok・通販オリパ ' + title.replace(/（原価率[^）]*）/, '') + '・' + n + '点', dueDate: due,
            content: pickText(st, rows, title, note, due).replace(/\n\n送ったら、[^\n]*$/, '') + '\n\n送ったら、このタスクを完了にするか、トークの「送りました」ボタンを押してください（どちらでも大丈夫です）。' };
          var j = await fetch(APPROVAL_URL, { method: 'POST', body: JSON.stringify({ action: 'pick', store: st, text: pickText(st, rows, title, note, due), image: image, task: task }) }).then(function (r) { return r.json(); });
          if (!j.ok) throw new Error(j.error || '送信できませんでした');
          if (mark) { mark.textContent = j.taskErr ? '　✅ 送りました（タスクは作れませんでした：' + j.taskErr + '）' : '　✅ 送りました・タスクも入れました'; mark.style.color = j.taskErr ? '#b8860b' : '#1e7d4f'; }
          m.querySelector('[data-st="' + st + '"]').checked = false;
        } catch (e) { ng++; if (mark) { mark.textContent = '　送れませんでした：' + e.message; mark.style.color = '#c0392b'; } }
      }
      m.querySelector('[data-x]').disabled = false; m.querySelector('[data-x]').textContent = '閉じる';
      if (ng) { b.disabled = false; b.textContent = '送れなかった店にもう一度送る'; } else b.textContent = '全店に送りました';
    };
  }
  // 全店モード：各店 → 通販店 の店間移動を、マイカに「下書き」で作る（発送はマイカの出荷管理で各店が行う）
  function requestShip(pt, by, stores, title) {
    var to = (S.stores || []).filter(function (s) { return /通販/.test(s.display_name || ''); })[0];
    var list = stores.filter(function (st) { return !/通販/.test(st) && by[st].some(function (r) { return r.p.sid; }); });
    var m = modal('<div class="mh">マイカに店間移動の下書きを作りますか？</div><div class="frm">' +
      '<div class="sm">チェックした店舗ごとに、マイカの「出荷管理」に<b>通販店あての店間移動（下書き）</b>を作ります。在庫はまだ動きません。各店が出荷管理 → 下書きを開いて、中身を確かめてから「出荷」してください。</div>' +
      (to ? '' : '<div class="sm" style="color:#c0392b">通販店が見つかりませんでした。</div>') +
      '<div class="pkst">' + list.map(function (st) {
        var agg = {}, n = 0; by[st].forEach(function (r) { agg[r.p.id] = (agg[r.p.id] || 0) + r.n; n += r.n; });
        return '<label class="ck"><input type="checkbox" data-st="' + esc(st) + '" checked> ' + esc(st) + '（' + Object.keys(agg).length + '品・' + n + '点・原価 ' + yen(by[st].reduce(function (s, r) { return s + r.p.cost * r.n; }, 0)) + '）<span class="pkr" data-r="' + esc(st) + '"></span></label>';
      }).join('') + '</div>' +
      '<label>メモ（下書きの備考に入ります） <input id="sd" style="width:100%;font-size:14px;padding:8px;border:1.5px solid #d6d2c8;border-radius:8px" value="' + esc('TikTok・通販オリパ ' + title.replace(/（原価率[^）]*）/, '')) + '"></label></div>' +
      '<div class="acts"><button class="ghost" data-x>やめる</button><button class="primary" data-ok' + (to ? '' : ' disabled') + '>下書きを作る</button></div>');
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
    m.querySelector('[data-ok]').onclick = async function () {
      var b = this, memo = m.querySelector('#sd').value.trim();
      var sel = [].slice.call(m.querySelectorAll('[data-st]:checked')).map(function (x) { return x.dataset.st; });
      if (!sel.length || !to) return;
      b.disabled = true; m.querySelector('[data-x]').disabled = true;
      var ng = 0;
      for (var i = 0; i < sel.length; i++) {
        var st = sel[i], mark = m.querySelector('[data-r="' + st + '"]');
        b.textContent = '作成中… ' + (i + 1) + '/' + sel.length; if (mark) mark.textContent = '　作成中…';
        try {
          var rows = by[st], sid = rows[0].p.sid, agg = {}, order = [], cost = 0;
          rows.forEach(function (r) { if (!(r.p.id in agg)) { agg[r.p.id] = 0; order.push(r.p.id); } agg[r.p.id] += r.n; cost += r.p.cost * r.n; });
          var body = { to_store_id: to.id, total_wholesale_price: Math.round(cost), shipment_date: new Date().toString(), products: order.map(function (id) { return { product_id: Number(id), item_count: agg[id] }; }) };
          if (memo) body.description = memo;
          var j = await api('/api/store/' + sid + '/store-shipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          var no = j && (j.id || (j.storeShipment && j.storeShipment.id) || (j.store_shipment && j.store_shipment.id));
          if (mark) { mark.textContent = '　✅ 下書きを作りました' + (no ? '（No.' + no + '）' : ''); mark.style.color = '#1e7d4f'; }
          m.querySelector('[data-st="' + st + '"]').checked = false;
        } catch (e) { ng++; if (mark) { mark.textContent = '　作れませんでした：' + e.message; mark.style.color = '#c0392b'; } }
      }
      m.querySelector('[data-x]').disabled = false; m.querySelector('[data-x]').textContent = '閉じる';
      if (ng) { b.disabled = false; b.textContent = '作れなかった店でもう一度'; } else b.textContent = '全店の下書きを作りました';
    };
  }
  function showDetail(pt) {
    var rows = flatHits(pt.hits).concat(pt.filler.map(function (f) { return { p: f.p, n: f.n, role: '下枠' }; }));
    var m = modal('<div class="mh">' + esc(pt.name) + '（' + pt.price.toLocaleString() + '円×' + pt.init + '口）</div>' +
      '<table><tr><th>区分</th><th>商品</th><th>状態</th><th>枚数</th><th>マスタ価格</th><th>店頭価格</th><th>原価</th><th>在庫</th></tr>' +
      rows.map(function (h) { return '<tr><td>' + esc(h.role) + '</td><td>' + (h.p.kind === 'psa' ? '《' + esc(psaLabel(h.p)) + '》' : '') + esc(h.p.name) + '</td><td>' + esc(condText(h.p)) + '</td><td>' + h.n + '</td><td>' + yen(h.p.sell) + '</td><td>' + yen(h.p.shop) + '</td><td>' + yen(h.p.cost * h.n) + '</td><td>' + h.p.stock + '</td></tr>'; }).join('') +
      '<tr class="sum"><td colspan="6">合計（' + rows.reduce(function (s, h) { return s + h.n; }, 0) + '枚）</td><td>' + yen(pt.cost) + '</td><td></td></tr></table>' +
      '<div class="acts"><button class="ghost" data-x>閉じる</button></div>');
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
  }


  // 店舗オリパシート（店舗ごとのスプレッドシート）に、ほかのオリパと同じ形で書き出す（下枠は1行にまとめる）
  function sheetCond(p) { if (p.kind === 'psa') return psaLabel(p); if (p.kind === 'box') return p.bst ? (/^B/.test(p.bst) ? 'B' : p.bst) : ''; return String(p.cond || '').replace('状態', ''); }
  function guessTab(tabs, pt) {
    var pr = String(pt.price), st = shortName(S.sname), box = pt.L && pt.L.kinds && pt.L.kinds[0].length === 1 && pt.L.kinds[0][0] === 'box';
    var scuff = S.conds && S.conds.card && S.conds.card.some(function (c) { return !/^状態A-?$/.test(c); });
    var sc = function (t) { var v = 0; if (t.indexOf(pr + '円') >= 0) v += 10; if (t.indexOf(st) >= 0) v += 3; if (/BOX/i.test(t) === box) v += 2; if (/傷/.test(t) === !!scuff) v += 2; if (/選べる|自販機|コピー|買取/.test(t)) v -= 5; return v; };
    return tabs.slice().sort(function (a, b) { return sc(b) - sc(a); })[0] || '';
  }
  function exportSheet(pt) {
    var st = shortName(S.sname);
    var m = modal('<div class="mh">店舗オリパシートに書き出す</div><div class="frm"><div class="sm" id="shs">' + esc(st) + '店のシートを読み込み中…</div></div><div class="acts"><button class="ghost" data-x>やめる</button><button class="primary" data-ok disabled>書き出す</button></div>');
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
    fetch(APPROVAL_URL + '?action=oripatabs&store=' + encodeURIComponent(st)).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.error || '読み込めませんでした');
      if (!j.tabs) throw new Error('本部の仕組みが書き出しに対応していない状態です（更新中かもしれません）。少し待ってもう一度押すか、本部に連絡してください');
      var g = guessTab(j.tabs, pt), dt = new Date(), defTab = (pt.saveName || defaultName(pt.price)) + ' ' + (dt.getMonth() + 1) + '.' + dt.getDate();
      m.querySelector('.frm').innerHTML = '<div class="sm">「' + esc(j.name) + '」に、ほかのオリパと同じ形（名前・原価・個数・合計、最後に販売口数・売上・粗利益率）で書き出します。下枠は「下枠」1行にまとめます。</div>' +
        '<label class="ck"><input type="radio" name="wm" value="new" checked> 新しいタブを作って書き出す</label>' +
        '<label style="margin-left:24px">タブの名前 <input id="nt" value="' + esc(defTab) + '"></label>' +
        '<label class="ck"><input type="radio" name="wm" value="old"> 今あるタブのいちばん下に足す</label>' +
        '<label style="margin-left:24px">タブ <select id="tb">' + j.tabs.map(function (t) { return '<option' + (t === g ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label>' +
        '<label>オリパの呼び名（任意・タイトルに入ります） <input id="lb" placeholder="例：見える、傷あり"></label>' +
        '<div class="sm">ブロックのタイトルは「' + esc(st) + pt.price + '円　（呼び名）　' + pt.init + '口（今日の日付）」になります（今あるタブに足すときは Vol.番号も付きます）。</div>';
      var ok = m.querySelector('[data-ok]'); ok.disabled = false;
      ok.onclick = async function () {
        ok.disabled = true; ok.textContent = '書き出し中…';
        try {
          var rows = flatHits(pt.hits).map(function (h) { return { role: h.role.replace('（セット）', ''), name: h.p.name + (h.setOf ? '（セット）' : '') + (h.p.costTmp ? '（原価は仮：マスタの70%）' : ''), cond: sheetCond(h.p), cost: h.p.cost, n: h.n }; });
          var fN = pt.filler.reduce(function (s, f) { return s + f.n; }, 0), fC = pt.filler.reduce(function (s, f) { return s + f.p.cost * f.n; }, 0);
          var isNew = (m.querySelector('[name=wm]:checked') || {}).value === 'new', ntn = m.querySelector('#nt').value.trim();
          if (isNew && !ntn) throw new Error('タブの名前を入れてください');
          var withCond = rows.some(function (x) { return x.cond && !/^A-?$/.test(x.cond); });
          var r = await fetch(APPROVAL_URL, { method: 'POST', body: JSON.stringify({ action: 'oripasheet', store: st, newTab: isNew ? ntn : '', withCond: withCond, tab: m.querySelector('#tb').value, label: m.querySelector('#lb').value.trim(), price: pt.price, init: pt.init, rows: rows, fillerN: fN, fillerCost: fC }) }).then(function (x) { return x.json(); });
          if (!r.ok) throw new Error(r.error || '書き出せませんでした');
          m.querySelector('.mbox').innerHTML = '<div class="mh">書き出しました</div><div class="sm">「' + esc(r.tab) + '」の' + r.row + '行目に「' + esc(r.title) + '」を足しました。</div><div class="acts"><a class="ghost" href="' + esc(r.url) + '" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex;align-items:center">シートを開く</a><button class="primary" data-x>OK</button></div>';
          m.querySelector('[data-x]').onclick = function () { m.remove(); };
        } catch (e) { ok.disabled = false; ok.textContent = '書き出す'; var er = m.querySelector('.err') || m.querySelector('.frm').appendChild(document.createElement('div')); er.className = 'err'; er.textContent = e.message; }
      };
    }).catch(function (e) { m.querySelector('#shs').textContent = e.message; m.querySelector('#shs').className = 'err'; });
  }
  function defaultName(price) { return price.toLocaleString('ja-JP').replace(/,/g, '') + '円オリパ'; }

  function confirmSave(pt) {
    var total = flatHits(pt.hits).concat(pt.filler).reduce(function (s, h) { return s + h.n; }, 0), nSet = pt.hits.filter(function (h) { return h.p.set; }).length;
    var m = modal('<div class="mh">マイカに一時保存しますか？</div>' +
      '<div class="frm"><label>商品名 <input id="nm" value="' + esc(defaultName(pt.price)) + '"></label>' +
      '<div class="sm">値段 ' + yen(pt.price) + '／' + pt.init + '口／封入 ' + total + '枚' + (pt.hits.some(function (h) { return h.role === 'ラストワン'; }) ? '（ラストワン賞1枚を含む。ラストワン賞は口数に入りません）' : '') + '／原価率 ' + pct(pt.costr) + '</div>' +
      (nSet ? '<div class="sm"><b>セット当たりが' + nSet + 'つあるので、封入枚数は口数より' + nSet + '枚多くなります。セットの2枚は同じ袋に入れてください。</b></div>' : '') +
      lowCostNote(pt) +
      '<div class="sm">「一時保存」に入るだけで、まだ販売はされません。マイカの「オリパ・福袋」→「一時保存」で中身を確認してから作成してください。</div></div>' +
      '<div class="acts"><button class="ghost" data-x>やめる</button><button class="primary" data-ok>一時保存する</button></div>');
    m.querySelector('[data-x]').onclick = function () { m.remove(); };
    m.querySelector('[data-ok]').onclick = async function () {
      var btn = this; btn.disabled = true; btn.textContent = '保存中…';
      try {
        var name = m.querySelector('#nm').value.trim() || defaultName(pt.price); pt.saveName = name;
        var items = flatHits(pt.hits).concat(pt.filler);
        // マイカの画面の「一時保存」と同じ内容で送る（一時保存では在庫は動かない：2026/10/27 確認済み）
        var body = { asDraft: true, display_name: name, sell_price: pt.price, init_stock_number: pt.init,
          genre_id: S.genre && S.genre.id, category_id: S.cat && S.cat.id,
          products: items.map(function (h) { return { product_id: h.p.id, item_count: h.n }; }) };
        await api('/api/store/' + S.sid + '/item/original-pack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        sendLearn(pt);
        m.querySelector('.mbox').innerHTML = '<div class="mh">一時保存しました</div><div class="sm">マイカの「オリパ・福袋」→「一時保存」タブに「' + esc(name) + '」があります。中身を確認してから作成してください。</div><div class="acts">' + (APPROVAL_URL ? '<button class="ghost" data-sheet2>店舗オリパシートにも書き出す</button>' : '') + '<button class="primary" data-x>OK</button></div>';
        m.querySelector('[data-x]').onclick = function () { m.remove(); };
        if (m.querySelector('[data-sheet2]')) m.querySelector('[data-sheet2]').onclick = function () { m.remove(); exportSheet(pt); };
      } catch (e) {
        btn.disabled = false; btn.textContent = '一時保存する';
        var er = m.querySelector('.err') || m.querySelector('.frm').appendChild(document.createElement('div')); er.className = 'err'; er.textContent = '保存できませんでした：' + e.message;
      }
    };
  }

  /* ---------- 補充 ---------- */
  async function renderRefill() {
    $('#body').innerHTML = '<div class="msg">販売中のオリパを読み込み中…</div>';
    try {
      var r = await api('/api/store/' + S.sid + '/item?take=100&skip=0&type=ORIGINAL_PACK&status=PUBLISH&orderBy=-id&includesProducts=true');
      var list = (r.items || []).filter(function (i) { return i.products_stock_number > 0 && /オリパ/.test(i.display_name) && !/参加費|ナタデパック/.test(i.display_name); });
      S.openPacks = list;
      $('#body').innerHTML = '<div class="info">当たりが出たオリパを選ぶと、同じくらいの当たりを在庫から提案します。</div>' +
        (list.length ? '<div class="olist">' + list.map(function (i, k) { return '<button class="orow" data-k="' + k + '"><b>' + esc(i.display_name) + '</b><span>' + yen(i.sell_price) + '・残り ' + i.products_stock_number + '/' + i.init_stock_number + '口</span></button>'; }).join('') + '</div>' : '<div class="msg sub">販売中のオリパがありません</div>') +
        '<div id="rf"></div>';
      root.querySelectorAll('.orow').forEach(function (b) { b.onclick = function () { root.querySelectorAll('.orow').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); refillPack(S.openPacks[Number(b.dataset.k)]); }; });
    } catch (e) { $('#body').innerHTML = '<div class="msg err">読み込みに失敗しました：' + esc(e.message) + '</div>'; }
  }

  async function refillPack(item) {
    var box = $('#rf'); box.innerHTML = '<div class="msg">中身を読み込み中…</div>';
    var pr = await api('/api/store/' + S.sid + '/product?original_pack_item_id=' + item.id);
    var contents = (item.original_pack_products || []);
    var prods = {}; (pr.products || []).forEach(function (p) { prods[p.id] = p; });
    var hits = [], RL = learnFor(item.sell_price), showAll = !!(RL.fill && RL.fill.kind === 'box'); // 2.5万円など下枠もBOXのオリパは、下枠まで全部出す
    contents.forEach(function (c) {
      var p = prods[c.product_id] || {}; if (/【@\s*\d+】/.test(c.product__display_name || '')) return;
      var cost = Number(p.average_wholesale_price) || 0, sell0 = Number(p.sell_price) || 0;
      if (!showAll && Math.max(sell0, cost) < item.sell_price) return; // 下枠（口単価未満）は出さない。小当たりまで全部出す
      var ex = hits.find(function (h) { return h.id === c.product_id; });
      if (ex) ex.n += c.item_count; else hits.push({ id: c.product_id, name: c.product__displayNameWithMeta || c.product__display_name, img: c.product__image_url, n: c.item_count, cost: cost, sell: p.sell_price || 0 });
    });
    hits.sort(function (a, b) { return (b.sell || b.cost) - (a.sell || a.cost) || b.cost - a.cost; });
    hits.forEach(function (h, k) { h.role = k === 0 ? 'TOP' : Math.max(h.sell, h.cost) < item.sell_price ? '下枠' : roleOf(RL, item.sell_price, { sell: h.sell || h.cost }); });
    if (!hits.length) { box.innerHTML = '<div class="msg sub">このオリパには、口単価より原価が高い当たりが登録されていません（パックオリパなど）</div>'; return; }
    var nAll = hits.reduce(function (s, h) { return s + h.n; }, 0);
    box.innerHTML = '<div class="mh2">「' + esc(item.display_name) + '」の当たり（' + hits.length + '種類・' + nAll + '枚）— 出た当たりを選んでください</div>' +
      '<div class="cards sel">' + hits.map(function (h, k) {
        return '<button class="cd pickable" data-k="' + k + '"><div class="im">' + (h.img ? '<img src="' + esc(h.img) + '">' : '<div class="noimg">' + esc(h.name.slice(0, 14)) + '</div>') + (h.n > 1 ? '<span class="cnt">×' + h.n + '</span>' : '') + '<span class="role r-' + esc(h.role) + '">' + esc(h.role) + '</span></div><div class="nm">' + esc(h.name) + '</div>' + (h.sell ? '<div class="pr">マスタ ' + yen(h.sell) + '</div>' : '') + '<div class="cs">原価 ' + yen(h.cost) + '</div></button>';
      }).join('') + '</div><div class="sm">封入時の中身です（すでに出た当たりも含みます）。</div><div id="rsug"></div>';
    root.querySelectorAll('.pickable').forEach(function (b) { b.onclick = function () { root.querySelectorAll('.pickable').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); suggestRefill(item, hits[Number(b.dataset.k)]); }; });
  }

  function suggestRefill(item, hit) {
    var target = hit.cost;
    var c = S.inv.filter(function (p) { return p.kind !== 'filler' && p.cost >= target * 0.6 && p.cost <= target * 1.15 && p.id !== hit.id; })
      .map(function (p) { return { p: p, s: -Math.abs(Math.log(p.cost / target)) * 2 + Math.min(Math.log(Math.max(p.sell, 1) / Math.max(p.cost, 1)), 1.2) }; })
      .sort(function (a, b) { return b.s - a.s; }).slice(0, 4);
    var cheaper = S.inv.filter(function (p) { return p.kind !== 'filler' && p.cost >= target * 0.35 && p.cost < target * 0.6; })
      .sort(function (a, b) { return (b.sell / Math.max(b.cost, 1)) - (a.sell / Math.max(a.cost, 1)); }).slice(0, 3);
    var html = '<div class="mh2">「' + esc(hit.name) + '」（原価 ' + yen(target) + '）の代わりの候補</div>';
    html += c.length ? '<div class="cards">' + c.map(function (x) { return card({ p: x.p, n: 1, role: '同じくらい' }, false); }).join('') + '</div>' : '<div class="msg sub">同じくらいの在庫がありません</div>';
    if (cheaper.length) html += '<div class="mh2 s">原価を抑えたいとき（少し下の当たり）</div><div class="cards">' + cheaper.map(function (p) { return card({ p: p, n: 1, role: '控えめ' }, false); }).join('') + '</div>';
    html += '<div class="note2">ポイント：当たりより高いものを足すと原価率が上がります。補充はマイカの「オリパ・福袋」→ 対象オリパ →「補充」から行ってください。</div>';
    $('#rsug').innerHTML = html;
  }

  /* ---------- 見た目 ---------- */
  function CSS() {
    return [
      ':host{all:initial}',
      '.wrap{position:fixed;inset:0;background:rgba(20,20,30,.55);display:flex;align-items:stretch;justify-content:center;font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif;color:#1d1d22}',
      '.win{background:#f6f5f2;width:min(1500px,98vw);margin:1vh 0;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.35)}',
      '.hd{display:flex;align-items:center;gap:18px;padding:12px 18px;background:#1d1d22;color:#fff}',
      '.ttl{font-weight:800;font-size:18px;letter-spacing:.04em}',
      '.store select{font-size:15px;padding:4px 8px;border-radius:6px;border:0;margin-left:4px}',
      '.store{font-size:13px;color:#ccc}',
      '.tabs{display:flex;gap:4px;margin-left:auto}',
      '.tabs button{background:#33333b;color:#ddd;border:0;padding:8px 16px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:700}',
      '.tabs button.on{background:#e8c23a;color:#1d1d22}',
      '.x{background:none;border:0;color:#fff;font-size:26px;cursor:pointer;padding:0 6px}',
      '.bd{flex:1;overflow:auto;padding:16px 18px 30px}',
      '.msg{padding:40px;text-align:center;font-size:15px}.msg.sub{color:#888;padding:24px}.err,.msg.err{color:#c0392b}',
      '.form{display:flex;flex-wrap:wrap;gap:14px 26px;align-items:flex-end;background:#fff;padding:14px 16px;border-radius:12px;border:1px solid #e5e2da}',
      '.lb{font-size:12px;color:#666;margin-bottom:5px;font-weight:700}',
      '.chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
      '.chip{border:1.5px solid #d6d2c8;background:#fff;padding:7px 12px;border-radius:999px;font-size:14px;cursor:pointer;font-weight:700}',
      '.chip.on{background:#1d1d22;color:#fff;border-color:#1d1d22}',
      'input{font-size:15px;padding:6px 8px;border:1.5px solid #d6d2c8;border-radius:8px;width:80px}#pfree{width:90px}',
      '.hint{font-size:11px;color:#888;margin-top:3px}',
      '.aprev{margin-top:10px;max-height:46vh;overflow:auto;border:1px solid #e5e2da;border-radius:8px;background:#f6f5f2}.aprev img{width:100%;display:block}',
      '.shareq{margin-top:8px}.pkst{display:flex;flex-direction:column;gap:6px;margin:8px 0 12px;font-size:14px}.pkst .ck{display:block;font-weight:700}.pkst .sub{font-weight:400;color:#888;font-size:12px}.pkr{font-size:13px}.shareq .ghost{font-size:13px;padding:7px 12px}',
      '.appr{margin-top:8px;font-size:13px;padding:8px 12px;border-radius:8px;background:#f3f1ea;color:#555}.appr b{color:#c0392b;margin-left:6px}.appr.wait{background:#fdf6dc;color:#7a5b00}.appr.ok{background:#e6f4ea;color:#1e6b34}.appr.ng{background:#fdecea;color:#a12a1c}',
      '.stchips{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin:10px 2px 0;font-size:13px}.stchips .lb{margin:0 4px 0 0}.stchips label{display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap}.stchips input{width:auto!important;margin:0}.stchips small{color:#999}.stchips .err{color:#c0392b}.sttag{display:inline-block;font-size:10px;font-weight:700;background:#eef3ff;color:#2952a3;border-radius:4px;padding:1px 5px;margin-top:3px}',
      '.mtabs{display:flex;gap:6px;margin-bottom:10px}.mtab{border:1.5px solid #d6d2c8;background:#fff;padding:8px 16px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}.mtab.on{background:#1f1d1a;color:#fff;border-color:#1f1d1a}.form.free{display:block}.fgrid{display:flex;flex-wrap:wrap;gap:12px 28px;align-items:flex-end;margin-bottom:12px}.lb2{font-size:13px;font-weight:700;color:#555;margin:4px 0 6px;border-top:1px dashed #e5e2da;padding-top:10px}.form.free input.n{width:64px}.form.free input.n.w{width:100px}.kchk{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;padding:6px 0}.kchk label{display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap}.kchk input{width:auto!important;margin:0;padding:0}.form.free select{padding:7px;border-radius:8px;border:1.5px solid #d6d2c8;font-size:14px}',
      '.primary{background:#c8102e;color:#fff;border:0;padding:10px 18px;border-radius:9px;font-size:15px;font-weight:800;cursor:pointer}',
      '.primary:disabled{opacity:.6}',
      '.ghost{background:#fff;border:1.5px solid #d6d2c8;padding:9px 14px;border-radius:9px;font-size:14px;cursor:pointer;font-weight:700}',
      '.sortbar{display:flex;gap:6px;margin:6px 0 10px}.sortbar .ghost{padding:6px 12px;font-size:13px}.sortbar .ghost.on{background:#1f1d1a;color:#fff;border-color:#1f1d1a}.morebtn{display:block;width:100%;margin:10px 0}',
      '.info{font-size:12px;color:#777;margin:10px 2px}',
      '.grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;max-width:1100px;margin:0 auto}',
      
      '.pt{background:#fff;border:1px solid #e5e2da;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px}',
      '.pth{display:flex;gap:10px;align-items:center}.pk{background:#1d1d22;color:#e8c23a;font-weight:900;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex:none}',
      '.pn{font-weight:800;font-size:15px}.pnote{font-size:11px;color:#777}',
      '.kpi{display:grid;grid-template-columns:repeat(3,1fr);background:#f6f5f2;border-radius:9px;padding:8px 4px;text-align:center}',
      '.tchk{display:flex;flex-wrap:wrap;gap:6px 12px}.tchk label{display:flex;align-items:center;gap:4px;font-size:13px;font-weight:700;background:#fff7e0;border:1.5px solid #e8c23a;border-radius:8px;padding:4px 10px;cursor:pointer}',
      '.kpiraw{margin-top:6px;background:#fdecea}.kpiraw b{color:#c0392b}',
      '.kpi b{display:block;font-size:16px}.kpi span{font-size:10px;color:#777}',
      '.top{display:flex;justify-content:center}',
      '.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}',
      '.cd{background:none;border:0;padding:0;text-align:left;font-family:inherit;color:inherit}',
      '.cd .im{position:relative;aspect-ratio:5/7;background:#eee;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center}',
      '.cd .im.duo{gap:2px}.cd .im.duo img{width:50%;height:auto;object-fit:contain}.settag{position:absolute;right:4px;bottom:4px;background:#2952a3;color:#fff;font-size:11px;font-weight:800;padding:2px 6px;border-radius:5px}',
      '.setbar{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}',
      '.blankc{aspect-ratio:5/7;border:2.5px dashed #d9534f;background:#fff5f5;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#c0392b;font-family:inherit;font-weight:800;font-size:13px;cursor:pointer;text-align:center;align-self:start}.blankc .bs{font-size:11px;font-weight:700;color:#999}.blankc:hover{background:#ffeaea}',
      '.cd img{width:100%;height:100%;object-fit:contain;background:#fff}',
      '.cd.big{width:150px}.cd.big .nm{font-size:12px;font-weight:700}',
      '.noimg{font-size:10px;color:#666;padding:4px;text-align:center}',
      '.cnt{position:absolute;right:3px;bottom:3px;background:#1d1d22;color:#fff;font-size:11px;font-weight:800;padding:1px 5px;border-radius:5px}',
      '.role{position:absolute;left:3px;top:3px;font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;background:#fff;color:#1d1d22;border:1px solid #ccc}',
      '.r-TOP{background:#e8c23a;border-color:#e8c23a}.r-大当たり{background:#c8102e;color:#fff;border-color:#c8102e}.r-ラストワン{background:#1d6b3a;color:#fff;border-color:#1d6b3a}',
      '.sec{display:flex;flex-direction:column;gap:6px}.sech{font-weight:800;font-size:13px;border-left:4px solid #c8102e;padding-left:7px}.sech span{font-weight:700;font-size:11px;color:#888;margin-left:8px}',
      '.addrow{display:flex;justify-content:flex-start}.addc{min-height:150px}',
      '.nm{font-size:10.5px;line-height:1.25;margin-top:3px;max-height:2.6em;overflow:hidden}',
      '.pr{font-size:11px;font-weight:800}.cs{font-size:10px;color:#888}',
      '.fill{font-size:12px;background:#f6f5f2;border-radius:8px;padding:7px 9px;line-height:1.5}',
      '.note2{font-size:11.5px;color:#7a5b00;background:#fdf6dc;border-radius:8px;padding:7px 9px}',
      '.warn{font-size:11.5px;color:#a3241b;background:#fdecea;border-radius:8px;padding:7px 9px}',
      '.acts{display:flex;gap:8px;justify-content:flex-end;margin-top:auto}',
      '.modal{position:absolute;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}',
      '.mbox{background:#fff;border-radius:12px;padding:18px;max-width:860px;width:92%;max-height:86%;overflow:auto;display:flex;flex-direction:column;gap:12px}',
      '.mh{font-weight:800;font-size:16px}.mh2{font-weight:800;font-size:14px;margin:16px 0 8px}.mh2.s{font-size:13px;color:#555}',
      '.sm{font-size:13px;color:#555;margin-top:6px;line-height:1.6}.frm input{width:300px}',
      'table{border-collapse:collapse;font-size:12.5px;width:100%}th,td{border-bottom:1px solid #eee;padding:5px 6px;text-align:left}th{background:#f6f5f2}tr.sum td{font-weight:800}',
      '.olist{display:flex;flex-direction:column;gap:6px;max-width:700px}',
      '.orow{display:flex;justify-content:space-between;gap:10px;background:#fff;border:1.5px solid #e5e2da;border-radius:9px;padding:10px 12px;cursor:pointer;font-size:14px;font-family:inherit;text-align:left}',
      '.orow.on,.pickable.on .im{outline:3px solid #c8102e}.orow span{color:#777;font-size:12px}',
      '.pickable{cursor:pointer}',
      '.psa{position:absolute;right:3px;top:3px;font-size:10px;font-weight:900;padding:1px 6px;border-radius:4px;background:#1a3fa0;color:#fff;letter-spacing:.03em}.cond.psa2{background:#1a3fa0;color:#fff}',
      '.cond{display:inline-block;font-size:9.5px;font-weight:800;color:#555;background:#efece4;border-radius:4px;padding:0 5px;margin:2px 0 1px}.cond.nosh{background:#c0392b;color:#fff}',
      '.cd.swap{cursor:pointer}.cd.swap:hover .im{outline:3px solid #e8c23a}',
      '.edit{position:absolute;left:0;right:0;bottom:0;background:rgba(29,29,34,.78);color:#fff;font-size:10px;font-weight:800;text-align:center;padding:3px 0;opacity:0;transition:opacity .15s}',
      '.cd.swap:hover .edit{opacity:1}',
      '.addc{border:2px dashed #cfc9bb;background:#fbfaf7;border-radius:6px;color:#777;font-weight:800;font-size:11px;cursor:pointer;aspect-ratio:5/7;font-family:inherit;line-height:1.4}',
      '.addc:hover{border-color:#c8102e;color:#c8102e}',
      '.lowc{position:absolute;left:3px;bottom:3px;font-size:10px;font-weight:900;padding:1px 6px;border-radius:4px;background:#c0392b;color:#fff}.lowcw{border-left:4px solid #c0392b}',
      '.edited{font-size:11px;font-weight:800;color:#1d6b3a;background:#e6f4ea;border-radius:6px;padding:3px 8px;align-self:flex-start}',
      '.srch{display:flex;gap:6px;margin-top:6px}.srch input{width:260px}',
      '.danger{color:#c8102e;border-color:#f0c4cb}',
      '.more{margin-top:8px;width:100%}.cwrap{display:flex;flex-direction:column}.overtag{font-size:10px;font-weight:800;color:#a3241b}.histtag{font-size:10px;font-weight:800;color:#1d6b3a}.stocktag{font-size:10px;font-weight:800;color:#1d1d22}',
      '.sel{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}'
    ].join('\n');
  }
})();
