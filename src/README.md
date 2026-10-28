# オリパ作成アシスト／全店オリパ作成 ソース

- `oripa-assist.js` … ツール本体のソース。`npx terser oripa-assist.js -c -m` の結果に `feedback-tail.js`（意見を送るボタン）をつなげたものが、リポジトリ直下の `oripa-assist.min.js`（各店のブックマークが読み込むファイル）
- `gas-oripa-shonin.gs` … Google Apps Script「オリパ本部承認（LINE WORKS）」のコード（本部承認・在庫共有の募集・発送依頼とタスク）。鍵はスクリプト プロパティにあり、ここには入っていない
- `setup-*.html` … ブックマークの設置ページ（押すたびに最新版を読み込む）
