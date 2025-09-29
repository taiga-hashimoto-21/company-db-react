# CSV Data Import Guide

## 📁 フォルダ構成
```
data/
├── ◯IT_1.csv          # デフォルトのサンプルデータ (7,674件)
├── your-file.csv       # 新しいCSVファイルをここに配置
└── README.md           # このファイル
```

## 🚀 インポート方法

### 1. デフォルトファイル (◯IT_1.csv) を使用
```bash
npm run db:import:companies:fast
```

### 2. カスタムファイルを指定
```bash
# dataフォルダ内のファイル
npm run db:import:companies:fast ./data/your-file.csv

# 他の場所のファイル
npm run db:import:companies:fast /path/to/your-file.csv
```

### 3. 本番環境へのインポート
```bash
DATABASE_URL='postgresql://...' npm run db:import:companies:production ./data/your-file.csv
```

## 📋 CSVファイル形式要件
以下のヘッダー名を含むCSVファイルが必要です：

| ヘッダー名 | 必須 | 説明 |
|-----------|------|------|
| 会社名 | ✅ | 会社名 |
| ホームページURL | ✅ | ウェブサイトURL |
| 代表者名 | | 代表者名 |
| 住所1 | | 住所（都道府県含む） |
| 住所2 | | 住所詳細 |
| 従業員数 | | 数値のみ |
| 資本金 | | 万円単位の数値 |
| 設立年 | | 西暦年 |
| 設立月 | | 月（1-12） |
| 上場区分 | | 上場区分 |
| 業態 | | 業態 |
| 業界1 | ✅ | メイン業界（検索フィルタで使用） |
| 業界2-1 ~ 業界2-20 | | 追加業界分類 |

## ⚡ 高速インポート性能
- **処理速度**: 約20,000件/秒
- **7,674件**: 0.4秒で完了
- **50,000件**: 約2.5秒で完了予想
- **100,000件**: 約5秒で完了予想

## 🎯 新しいCSVファイル追加手順
1. CSVファイルを `data/` フォルダに配置
2. ヘッダー名が要件を満たしているか確認
3. コマンド実行でインポート

## 💡 使用例
```bash
# 大量データの高速インポート
npm run db:import:companies:fast ./data/large-dataset.csv

# 本番環境への直接インポート
DATABASE_URL='your-production-url' npm run db:import:companies:production ./data/production-data.csv
```