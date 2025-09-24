# 🚀 PRTimes データ高速インポートガイド

PRTimesの大容量CSVデータを超高速でインポートする2つの方法を提供しています。

## 📊 処理能力比較

| 方式 | 10万件の処理時間 | 使いやすさ | 推奨用途 |
|------|-------------|-----------|----------|
| **従来方式** | 5-10時間 😱 | ⭐⭐⭐ | 小規模データ（1万件以下） |
| **Web高速処理** | 2-5分 ⚡ | ⭐⭐⭐ | 中規模データ（10万件以下） |
| **Seedスクリプト** | 1-3分 🚀 | ⭐⭐ | 大規模データ（10万件以上） |

---

## 🌐 方式1: Web管理画面（推奨・簡単）

### 使用方法
1. 管理画面 (`/admin/prtimes`) にアクセス
2. CSVファイルを選択してアップロード
3. **自動判定**: 10MB以上のファイルは自動的に高速処理

### 特徴
- ✅ **ブラウザで完結** - サーバーアクセス不要
- ✅ **自動最適化** - ファイルサイズに応じて最適な方式を選択
- ✅ **進捗表示** - リアルタイムで処理状況を確認
- ✅ **エラーハンドリング** - 失敗時の詳細情報表示

### 処理の流れ
```
ファイル選択 → サイズ判定 → 高速処理実行 → 進捗監視 → 完了通知
     ↓              ↓
   10MB未満      10MB以上
   通常処理      COPY高速処理
```

---

## 🖥️ 方式2: Seedスクリプト（最高速・上級者向け）

### 使用方法

#### 1. CSVファイルをサーバーに配置
```bash
# 例: SCPでファイルを転送
scp large-prtimes-data.csv user@server:/tmp/
```

#### 2. スクリプト実行
```bash
# 基本的な使い方
npm run db:import:prtimes /path/to/your-file.csv

# 実例
npm run db:import:prtimes /tmp/prtimes-100k-records.csv
npm run db:import:prtimes ~/Downloads/large-prtimes.csv
```

### 実行例とログ
```
🚀 Starting bulk import of PRTimes data...
📁 File: /tmp/prtimes-100k-records.csv
📊 File size: 45 MB
🔢 Counting lines...
📝 Total data rows: 100,000
⏸️ Temporarily disabling indexes for faster import...
📋 Creating temporary table...
⚡ Executing COPY command (this is very fast)...
📥 COPY completed in 23s: 100,000 rows imported
🔄 Converting and validating data...
✅ Data conversion completed in 45s: 98,456 records inserted
🔨 Rebuilding indexes...
🔨 Indexes rebuilt in 12s
📊 Updating table statistics...

🎉 Bulk import completed!
==================================================
⏱️  Total time: 95s (1m35s)
✅ Success: 98,456 records
❌ Errors: 1,544 records
📊 Success rate: 98%
🚀 Speed: 1,036 records/second
🆔 Batch ID: seed_1640995200000
==================================================

📈 Performance comparison:
Old method (1-by-1): ~16h 40m
New method (COPY): 1m 35s
Speed improvement: 631x faster! 🚀

💡 You can now use the data in your application!
```

---

## 🔧 トラブルシューティング

### よくある問題

#### 1. ファイルが見つからない
```bash
❌ File not found: /path/to/file.csv
```
**解決方法**: ファイルパスを確認し、絶対パスを使用してください。

#### 2. データベース接続エラー
```bash
❌ connection to server failed
```
**解決方法**: `DATABASE_URL`環境変数を確認してください。

#### 3. メモリ不足
```bash
❌ JavaScript heap out of memory
```
**解決方法**: Node.jsのメモリ上限を増やしてください。
```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run db:import:prtimes file.csv
```

### パフォーマンスチューニング

#### さらに高速化するには
1. **インデックス事前削除**（スクリプトで自動実行済み）
2. **ANALYZE実行**（スクリプトで自動実行済み）
3. **並列処理**（大容量ファイル時に有効）

---

## 📋 どちらを選ぶべき？

### Web管理画面を選ぶ場合
- ✅ サーバーアクセスが難しい
- ✅ 簡単な操作で済ませたい
- ✅ 100MB以下のファイル
- ✅ 進捗を視覚的に確認したい

### Seedスクリプトを選ぶ場合
- ✅ 100MB以上の超大容量ファイル
- ✅ 最高速度が必要
- ✅ サーバーアクセスが可能
- ✅ バッチ処理として定期実行したい

---

## 📞 サポート

問題が発生した場合は、以下の情報と共にお知らせください：

1. **使用した方式**（Web管理画面 or Seedスクリプト）
2. **ファイルサイズ**と**行数**
3. **エラーメッセージ**の全文
4. **処理環境**（ローカル/本番環境）

---

**🎯 推奨**: 初回は管理画面で試して、大容量データの場合はSeedスクリプトを検討してください。