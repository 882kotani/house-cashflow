# わが家のキャッシュフロー表

家庭のキャッシュフロー表とライフイベント表を管理するシンプルなWebアプリです。
フロントエンドはバニラ HTML / CSS / JS、バックエンドは Node.js（Express）で、
データはすべて `data/` フォルダ内の JSON ファイルに保存されます。

## セットアップ

Node.js（v18以上推奨）がインストールされていれば動きます。

```bash
cd household-cashflow
npm install
npm start
```

起動後、ブラウザで `http://localhost:3000` を開いてください。

## 画面構成

- **キャッシュフロー表**：家族の年齢・ライフイベント・収入項目・支出項目を年ごとに一覧表示。
  セルをクリックしてそのまま金額を入力すると自動保存されます。ライフイベント表に登録した費用は
  自動的に「ライフイベント費用」として支出に合算されます。
- **ライフイベント表**：入学、車の購入など将来の予定と費用を横軸＝時間のタイムラインで表示します。「年表示／月表示」を切り替え可能（月表示では未入力の月は日本の年度・入学時期に合わせて4月として位置づけます）。タイムライン上部には貯蓄残高の推移を色分け表示し、貯蓄残高が初めてマイナスになる年をFP視点で警告します。イベントをクリックするとその場で編集できます。
- **家族設定**：家族を追加・編集・削除します（氏名、続柄、生年、表示色）。
- **項目設定**：収入・支出の項目を自由に追加・編集・削除できます。

## データの保存場所（JSONで管理・追加可能）

| ファイル | 内容 |
| --- | --- |
| `data/family.json` | 家族メンバー一覧 |
| `data/items.json` | 収支の項目一覧（収入／支出） |
| `data/cashflow.json` | 表の設定（開始年・年数・現在の貯蓄額）と各項目×年の金額 |
| `data/events.json` | ライフイベント一覧 |

画面から追加・編集・削除した内容はすべてこれらのJSONファイルに反映されます。
直接JSONファイルを編集して初期データを用意することもできます。

## API（参考）

- `GET/POST/PUT/DELETE /api/family`
- `GET/POST/PUT/DELETE /api/items`
- `GET/POST/PUT/DELETE /api/events`
- `GET /api/cashflow`
- `PUT /api/cashflow/settings`（開始年・年数・現在の貯蓄額の更新）
- `PATCH /api/cashflow/cell`（`{ itemId, year, value }` で1セルを更新）

## フォルダ構成

```
household-cashflow/
├── server.js          # Expressサーバー（API）
├── package.json
├── data/               # JSONデータ（永続化）
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```
