#!/usr/bin/env node
/**
 * 安全なマイグレーション実行スクリプト
 * press_release_type カラムを既存環境に追加
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// データベース接続設定
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'company_db',
  password: process.env.POSTGRES_PASSWORD || 'password',
  port: process.env.POSTGRES_PORT || 5432,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 マイグレーション開始...');

    // マイグレーションファイルを読み込み
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../migrations/add_press_release_type.sql'),
      'utf8'
    );

    // トランザクション開始
    await client.query('BEGIN');

    // マイグレーション実行
    console.log('📊 カラム追加中...');
    await client.query(migrationSQL);

    // コミット
    await client.query('COMMIT');

    console.log('✅ マイグレーション完了！');

    // 結果確認
    const result = await client.query(`
      SELECT
        press_release_type,
        COUNT(*) as count
      FROM prtimes_companies
      WHERE press_release_type IS NOT NULL
      GROUP BY press_release_type
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log('📈 移行結果:');
    console.table(result.rows);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ マイグレーションエラー:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// 実行
runMigration().catch(console.error);