#!/usr/bin/env node
/**
 * 本番環境PR TIMESデータ削除ツール
 *
 * 使用方法:
 * DATABASE_URL='postgresql://...' npm run db:clear:prtimes:production
 */

const { Pool } = require('pg');

async function clearPRTimesData() {
  let client;

  try {
    console.log('🚨 本番環境PR TIMESデータ削除処理開始...');
    console.log('⚠️  この処理は元に戻せません！');

    // 本番DBのURL確認
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URLが設定されていません');
    }

    console.log('🔗 接続先:', dbUrl.substring(0, 30) + '...');

    // 確認プロンプト（NODE_ENVがproductionの場合のみ）
    if (process.env.NODE_ENV === 'production') {
      console.log('\n❗ 5秒後に削除を開始します...');
      console.log('❗ Ctrl+Cで中断できます');

      for (let i = 5; i > 0; i--) {
        process.stdout.write(`\r⏰ ${i}秒...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log('\n');
    }

    // データベース接続
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false
    });

    client = await pool.connect();
    console.log('✅ データベース接続成功');

    // 現在のデータ件数確認
    const countResult = await client.query('SELECT COUNT(*) as count FROM prtimes_companies');
    const currentCount = parseInt(countResult.rows[0].count);
    console.log(`📊 現在のデータ件数: ${currentCount.toLocaleString()}件`);

    if (currentCount === 0) {
      console.log('ℹ️  削除するデータがありません');
      return;
    }

    // トランザクション開始
    await client.query('BEGIN');

    try {
      console.log('🗑️  データ削除実行中...');

      // マネージドDBサービス対応の削除方法
      // 外部キー制約がある場合は依存関係を考慮して削除
      try {
        // カテゴリテーブルを先に削除（外部キーがある場合）
        await client.query('DELETE FROM prtimes_categories');
        console.log('✅ カテゴリデータ削除完了');

        // メインテーブルを削除
        await client.query('DELETE FROM prtimes_companies');
        console.log('✅ 企業データ削除完了');

        // シーケンスをリセット（可能な場合）
        try {
          await client.query('ALTER SEQUENCE prtimes_companies_id_seq RESTART WITH 1');
          await client.query('ALTER SEQUENCE prtimes_categories_id_seq RESTART WITH 1');
          console.log('✅ IDシーケンスリセット完了');
        } catch (seqError) {
          console.log('⚠️  IDシーケンスリセットをスキップ（権限不足）');
        }

      } catch (deleteError) {
        // TRUNCATEを試行（権限がある場合）
        console.log('🔄 DELETE失敗、TRUNCATEを試行中...');
        await client.query('TRUNCATE prtimes_categories, prtimes_companies RESTART IDENTITY');
        console.log('✅ TRUNCATE実行完了');
      }

      // コミット
      await client.query('COMMIT');

      console.log('✅ データ削除完了');
      console.log(`🗑️  削除件数: ${currentCount.toLocaleString()}件`);

      // 確認
      const afterResult = await client.query('SELECT COUNT(*) as count FROM prtimes_companies');
      const afterCount = parseInt(afterResult.rows[0].count);
      console.log(`📊 削除後のデータ件数: ${afterCount}件`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    console.log('🎉 本番環境PR TIMESデータ削除が完了しました！');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// 実行
clearPRTimesData().catch(console.error);