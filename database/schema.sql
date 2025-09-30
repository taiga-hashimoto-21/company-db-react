-- 企業データベーススキーマ（1200万社対応）

-- 企業テーブル
CREATE TABLE companies (
  id BIGSERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  established_date DATE NOT NULL,
  postal_code VARCHAR(10),
  address TEXT NOT NULL,
  industry VARCHAR(50) NOT NULL,
  website VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 高速検索のためのインデックス
CREATE INDEX idx_companies_industry ON companies(industry);
CREATE INDEX idx_companies_company_name ON companies USING gin(company_name gin_trgm_ops);
CREATE INDEX idx_companies_address ON companies USING gin(address gin_trgm_ops);
CREATE INDEX idx_companies_established_date ON companies(established_date);

-- 複合インデックス（業種+設立日での絞り込み用）
CREATE INDEX idx_companies_industry_date ON companies(industry, established_date);

-- ユーザーテーブル
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  type VARCHAR(10) NOT NULL CHECK (type IN ('admin', 'user')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ユーザーテーブルのインデックス
CREATE UNIQUE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_type ON users(type);
CREATE INDEX idx_users_is_active ON users(is_active);

-- パスワードテーブル（管理者のみ）
CREATE TABLE user_passwords (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 業種マスターテーブル
CREATE TABLE industries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- 初期業種データ
INSERT INTO industries (name, display_order) VALUES
('IT・通信', 1),
('製造業', 2),
('商社・流通', 3),
('金融・保険', 4),
('不動産・建設', 5),
('サービス業', 6),
('医療・介護', 7),
('教育', 8),
('運輸・物流', 9),
('食品・飲料', 10),
('エネルギー', 11),
('その他', 12);

-- 外部キー制約
ALTER TABLE companies ADD CONSTRAINT fk_companies_industry 
FOREIGN KEY (industry) REFERENCES industries(name);

-- トリグー関数（updated_atの自動更新）
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- トリガー
CREATE TRIGGER update_companies_updated_at 
BEFORE UPDATE ON companies 
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_passwords_updated_at 
BEFORE UPDATE ON user_passwords 
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- パフォーマンス統計用ビュー
CREATE VIEW company_stats AS
SELECT 
  industry,
  COUNT(*) as company_count,
  MIN(established_date) as oldest_company,
  MAX(established_date) as newest_company
FROM companies 
GROUP BY industry
ORDER BY company_count DESC;

-- PR TIMES統計用ビュー
CREATE VIEW prtimes_stats AS
SELECT 
  industry,
  COUNT(*) as company_count,
  AVG(capital_amount_numeric) as avg_capital,
  MIN(established_year) as oldest_year,
  MAX(established_year) as newest_year
FROM prtimes_companies 
WHERE industry IS NOT NULL
GROUP BY industry
ORDER BY company_count DESC;

-- 全文検索用の設定（日本語対応）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- パーティショニング（将来の拡張用）
-- 業種別にテーブルを分割することで、さらなる高速化が可能

COMMENT ON TABLE companies IS '企業マスターテーブル（1200万社対応）';
COMMENT ON INDEX idx_companies_industry IS '業種検索用インデックス（メイン検索）';
COMMENT ON INDEX idx_companies_company_name IS '企業名部分一致検索用インデックス';
COMMENT ON INDEX idx_companies_address IS '住所部分一致検索用インデックス';

-- PR TIMESデータ専用テーブル
CREATE TABLE prtimes_companies (
  id BIGSERIAL PRIMARY KEY,
  delivery_date TIMESTAMP WITH TIME ZONE NOT NULL,
  press_release_url VARCHAR(1000) NOT NULL,
  press_release_title TEXT NOT NULL,
  press_release_type VARCHAR(100),
  press_release_category1 VARCHAR(100),
  press_release_category2 VARCHAR(100),
  company_name VARCHAR(255) NOT NULL,
  company_website VARCHAR(1000),
  industry VARCHAR(100),
  address TEXT,
  phone_number VARCHAR(50),
  representative VARCHAR(100),
  listing_status VARCHAR(50),
  capital_amount_text VARCHAR(100),
  established_date_text VARCHAR(50),
  capital_amount_numeric INTEGER,
  established_year INTEGER,
  established_month INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PR TIMESテーブルのインデックス
CREATE INDEX idx_prtimes_company_name ON prtimes_companies USING gin(company_name gin_trgm_ops);
CREATE INDEX idx_prtimes_industry ON prtimes_companies(industry);
CREATE INDEX idx_prtimes_capital_amount ON prtimes_companies(capital_amount_numeric);
CREATE INDEX idx_prtimes_established_year ON prtimes_companies(established_year);
CREATE INDEX idx_prtimes_established_month ON prtimes_companies(established_month);
CREATE INDEX idx_prtimes_delivery_date ON prtimes_companies(delivery_date);
CREATE INDEX idx_prtimes_listing_status ON prtimes_companies(listing_status);
CREATE INDEX idx_prtimes_press_type ON prtimes_companies(press_release_type);
CREATE INDEX idx_prtimes_press_category1 ON prtimes_companies(press_release_category1);
CREATE INDEX idx_prtimes_press_category2 ON prtimes_companies(press_release_category2);

-- 複合インデックス（検索条件の組み合わせ用）
CREATE INDEX idx_prtimes_capital_year ON prtimes_companies(capital_amount_numeric, established_year);
CREATE INDEX idx_prtimes_industry_capital ON prtimes_companies(industry, capital_amount_numeric);

-- PR TIMESテーブルのトリガー
CREATE TRIGGER update_prtimes_companies_updated_at 
BEFORE UPDATE ON prtimes_companies 
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- PR TIMESカテゴリ管理テーブル（動的にユニークな値を管理）
CREATE TABLE prtimes_categories (
  id SERIAL PRIMARY KEY,
  category_type VARCHAR(20) NOT NULL CHECK (category_type IN ('category1', 'category2', 'industry', 'listing_status')),
  category_name VARCHAR(100) NOT NULL,
  usage_count INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(category_type, category_name)
);

-- カテゴリテーブルのインデックス
CREATE INDEX idx_prtimes_categories_type ON prtimes_categories(category_type);
CREATE INDEX idx_prtimes_categories_active ON prtimes_categories(is_active);

COMMENT ON TABLE prtimes_companies IS 'PR TIMES企業データテーブル（CSV一括登録用）';
COMMENT ON TABLE prtimes_categories IS 'PR TIMESカテゴリマスターテーブル（動的管理）';