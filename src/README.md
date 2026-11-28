# オリパ作成アシスト／全店オリパ作成 ソース

- `oripa-assist.js` … ツール本体のソース。`npx terser oripa-assist.js -c -m` の結果に `feedback-tail.js`（意見を送るボタン）をつなげたものが、リポジトリ直下の `oripa-assist.min.js`（各店のブックマークが読み込むファイル）
- `gas-oripa-shonin.gs` … Google Apps Script「オリパ本部承認（LINE WORKS）」のコード（本部承認・在庫共有の募集・発送依頼とタスク）。鍵はスクリプト プロパティにあり、ここには入っていない
- `setup-*.html` … ブックマークの設置ページ（押すたびに最新版を読み込む）
- `../loss-shinsei.js` … ロス申請ツール（`npx terser loss-shinsei.js -c -m -o loss-shinsei.min.js`）。設置ページ `setup-loss-shinsei.html`（公開版 https://claude.ai/artifact/41JsZnYV6mqepqpBosr4Mj ）
- `gas-loss.gs` … GAS「オリパ本部承認（LINE WORKS）」の「ロス申請.gs」。申請→「ロス申請」グループに承認ボタン、夜のチェック（無承認ロスの警告）
- `pc/loss_check.ps1` … 雄司のPC（Documents\myca_import）で毎晩22:00・23:30に動く、マイカのロス取得→GASへ送信（タスク MycaLossCheck）
- `../hanbai-shonin.js` … 販売価格の承認ツール（`npx terser hanbai-shonin.js -c -m -o hanbai-shonin.min.js`）。設置ページ `setup-hanbai-shonin.html`
- `gas-hanbai.gs` … GAS「オリパ本部承認（LINE WORKS）」の「販売価格.gs」。依頼→店舗グループに承認ボタン。履歴は「オリパ承認履歴」の「販売価格」タブ
- `../takuhai-recore.js` … 宅配買取の見積書→RECORE入力ツール（RECOREの宅配買取ケース画面で動くブックマークレット。`npx terser takuhai-recore.js -c -m -o takuhai-recore.min.js`）。照合→新規登録（買取サイトの画像／PSAは鑑定品画像を生成）→「商品をインポート」と同じCSVで取り込み。設置ページ `setup-takuhai-recore.html`（公開版は合言葉入り。リポジトリ版は __KEY__）
- `gas-takuhai-recore.gs` … GAS「宅配見積書 読み取り（RECORE入力用）」（ichikawa1121@gmail.com）。見積書を読むだけ。KEYは公開版のみに記入
- `../nezuke.js` … 販売値付けツール（`npx terser nezuke.js -c -m -o nezuke.min.js`）。買取ごとに販売価格を自動で出してマイカに反映（PUT /api/store/{id}/product/{pid} の specific_sell_price）。5万円以上は販売価格の承認（GAS 販売価格.gs の hanbai / hlist）に依頼し、承認後に自動反映。設置ページ `setup-nezuke.html`
- `gas-hanbai.gs` の後半 … 販売値付けの記録（POST nezuke →「オリパ承認履歴」の「販売値付け」タブ）、値付け済みの買取（GET nzdone）、1時間ルールの夜間チェック（POST nzcheck →「値付けチェック」タブ・役員の販売警告グループ）
- `pc/nezuke_check.ps1` … 雄司のPC（Documents\myca_import）で毎晩22:20・23:50。今日の買取の満額3万円以上を本部へ（タスク MycaNezukeCheck、`install_nezuke_check.bat` で登録）
- `gas-kaitori.gs` の ksnkr … 《PSA9》もスニダンで調べる（状態ID 23）
