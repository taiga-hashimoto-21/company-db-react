# PR TIMES高速バルクインポート

このフォルダはPR TIMESのCSVデータを高速でデータベースにインポートするためのディレクトリです。

## 使用方法

### 1. CSVファイルの配置
```
data_prtimes/
├── data1.csv    <- インポートするCSVファイル
├── data2.csv    <- 複数ファイル対応
└── README.md
```

### 2. インポート実行

#### ローカル環境
```bash
# 既存データを削除して新しいCSVをインポート
node scripts/bulk-import-prtimes-fast.js --file data_prtimes/data1.csv --replace

# ドライラン（実際にはインポートしない）
node scripts/bulk-import-prtimes-fast.js --file data_prtimes/data1.csv --dry-run
```

#### 本番環境
```bash
# 前提: .env ファイルに DATABASE_URL を設定しておく

# 1. 本番DBのデータを削除
npm run db:clear:prtimes:production

# 2. 本番DBに新しいCSVをインポート
npm run db:import:prtimes:production --file data_prtimes/data1.csv --replace
```

#### ワンライナー（削除+インポート）
```bash
npm run db:clear:prtimes:production && npm run db:import:prtimes:production --file data_prtimes/data1.csv --replace
```

## CSVフォーマット

CSVファイルは以下の順序でヘッダーが必要です：

```csv
配信日時,プレスリリースURL,プレスリリースタイトル,プレスリリース種類,プレスリリースカテゴリ1,プレスリリースカテゴリ2,会社名,会社URL,業種,住所,電話番号,代表者,上場区分,資本金,設立日,資本金（万円）,設立年,設立月
```

## 特徴

- ⚡ **超高速**: PostgreSQLの`COPY FROM`を使用した高速インポート
- 🛡️ **安全**: トランザクション保護とロールバック機能
- 📊 **統計**: インポート後の詳細統計とデータ検証
- 🔍 **検証**: CSVファイルとデータの整合性チェック

## 注意事項

- CSVファイルの文字エンコーディングはUTF-8である必要があります
- `--replace`オプションは既存データを完全に削除します（注意！）
- ファイルパスは絶対パスまたは相対パスで指定可能です