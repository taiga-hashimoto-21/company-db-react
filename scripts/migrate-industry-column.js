#!/usr/bin/env node
/**
 * PR TIMESテーブル業種カラム統合マイグレーション
 * business_category, industry_category, sub_industry_category を industry に統合
 */

const { Pool } = require('pg');

const getDatabaseConfig = () => {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
    };
  }

  return {
    user: process.env.POSTGRES_USER || 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    database: process.env.POSTGRES_DB || 'company_db',
    password: process.env.POSTGRES_PASSWORD || 'password',
    port: process.env.POSTGRES_PORT || 5432,
  };
};

const pool = new Pool(getDatabaseConfig());

async function migrate() {
  let client;

  try {
    console.log('🚀 業種カラム統合マイグレーション開始...');

    client = await pool.connect();
    console.log('✅ データベース接続成功');

    await client.query('BEGIN');

    // 1. 既存インデックスを削除
    console.log('🗑️  既存インデックスを削除中...');
    await client.query('DROP INDEX IF EXISTS idx_prtimes_business_category');
    console.log('✅ インデックス削除完了');

    // 2. 新しい industry カラムを追加
    console.log('➕ industry カラムを追加中...');
    await client.query(`
      ALTER TABLE prtimes_companies
      ADD COLUMN IF NOT EXISTS industry VARCHAR(200)
    `);
    console.log('✅ industry カラム追加完了');

    // 3. 既存データを移行（business_category の値を industry にコピー）
    console.log('📦 既存データを移行中...');
    await client.query(`
      UPDATE prtimes_companies
      SET industry = business_category
      WHERE business_category IS NOT NULL
    `);
    console.log('✅ データ移行完了');

    // 4. 古いカラムを削除
    console.log('🗑️  古い業種カラムを削除中...');
    await client.query(`
      ALTER TABLE prtimes_companies
      DROP COLUMN IF EXISTS business_category
    `);
    await client.query(`
      ALTER TABLE prtimes_companies
      DROP COLUMN IF EXISTS industry_category
    `);
    await client.query(`
      ALTER TABLE prtimes_companies
      DROP COLUMN IF EXISTS sub_industry_category
    `);
    console.log('✅ 古いカラム削除完了');

    // 5. 新しいインデックスを作成
    console.log('🔧 新しいインデックスを作成中...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_prtimes_industry
      ON prtimes_companies(industry)
    `);
    console.log('✅ インデックス作成完了');

    await client.query('COMMIT');

    // 6. 結果を確認
    console.log('\n📊 マイグレーション結果を確認中...');
    const result = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(industry) as with_industry
      FROM prtimes_companies
    `);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 マイグレーション完了！');
    console.log(`📊 総レコード数: ${result.rows[0].total}`);
    console.log(`📊 業種データあり: ${result.rows[0].with_industry}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('❌ マイグレーションエラー:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

migrate().catch(console.error);