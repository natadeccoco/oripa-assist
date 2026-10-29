# オリパ作成アシスト／全店オリパ作成 ソース

- `oripa-assist.js` … ツール本体のソース。`npx terser oripa-assist.js -c -m` の結果に `feedback-tail.js`（意見を送るボタン）をつなげたものが、リポジトリ直下の `oripa-assist.min.js`（各店のブックマークが読み込むファイル）
- `gas-oripa-shonin.gs` … Google Apps Script「オリパ本部承認（LINE WORKS）」のコード（本部承認・在庫共有の募集・発送依頼とタスク）。鍵はスクリプト プロパティにあり、ここには入っていない
- `setup-*.html` … ブックマークの設置ページ（押すたびに最新版を読み込む）
- `../loss-shinsei.js` … ロス申請ツール（`npx terser loss-shinsei.js -c -m -o loss-shinsei.min.js`）。設置ページ `setup-loss-shinsei.html`（公開版 https://claude.ai/artifact/41JsZnYV6mqepqpBosr4Mj ）
- `gas-loss.gs` … GAS「オリパ本部承認（LINE WORKS）」の「ロス申請.gs」。申請→「ロス申請」グループに承認ボタン、夜のチェック（無承認ロスの警告）
- `pc/loss_check.ps1` … 雄司のPC（Documents\myca_import）で毎晩22:00・23:30に動く、マイカのロス取得→GASへ送信（タスク MycaLossCheck）
