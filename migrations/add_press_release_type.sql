-- プレスリリース種類カラム追加マイグレーション
-- 本番環境での安全な実行用

-- Step 1: 新しいカラムを追加（NULL許可）
ALTER TABLE prtimes_companies
ADD COLUMN IF NOT EXISTS press_release_type VARCHAR(100);

-- Step 2: インデックス追加
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prtimes_press_type
ON prtimes_companies(press_release_type);

-- Step 3: 既存データの移行（press_release_category1からコピー）
-- 既知のプレスリリース種類のみを移行
UPDATE prtimes_companies
SET press_release_type = press_release_category1
WHERE press_release_category1 IN (
  'その他',
  'イベント',
  'キャンペーン',
  '上場企業決算発表',
  '人物',
  '商品サービス',
  '経営情報',
  '調査レポート'
) AND press_release_type IS NULL;

-- Step 4: コメント追加
COMMENT ON COLUMN prtimes_companies.press_release_type IS 'プレスリリース種類（検索フィルタ用）';

-- 確認用クエリ
SELECT
  press_release_type,
  COUNT(*) as count
FROM prtimes_companies
WHERE press_release_type IS NOT NULL
GROUP BY press_release_type
ORDER BY count DESC;