#!/usr/bin/env node
/**
 * PR TIMES高速バルクインポートツール
 * COPY FROMを使用した超高速CSVインポート
 *
 * 使用方法:
 * node scripts/bulk-import-prtimes-fast.js --file data_prtimes/data1.csv --replace
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { from: copyFrom } = require('pg-copy-streams');
const readline = require('readline');

// コマンドライン引数の設定
const program = new Command();
program
  .name('bulk-import-prtimes-fast')
  .description('PR TIMES CSVファイルの高速バルクインポート')
  .option('-f, --file <path>', 'CSVファイルのパス', 'data_prtimes/data1.csv')
  .option('-r, --replace', '既存データを削除してからインポート', false)
  .option('--dry-run', 'ドライラン（実際にはインポートしない）', false)
  .parse();

const options = program.opts();

// データベース接続設定
const getDatabaseConfig = () => {
  // 本番環境の場合はDATABASE_URLを使用
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
    };
  }

  // ローカル環境の場合は個別設定
  return {
    user: process.env.POSTGRES_USER || 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    database: process.env.POSTGRES_DB || 'company_db',
    password: process.env.POSTGRES_PASSWORD || 'password',
    port: process.env.POSTGRES_PORT || 5432,
  };
};

const pool = new Pool(getDatabaseConfig());

// CSVファイルのカラム順序（テーブル構造と一致）
const CSV_COLUMNS = [
  'delivery_date',
  'press_release_url',
  'press_release_title',
  'press_release_type',
  'press_release_category1',
  'press_release_category2',
  'company_name',
  'company_website',
  'industry',
  'address',
  'phone_number',
  'representative',
  'listing_status',
  'capital_amount_text',
  'established_date_text',
  'capital_amount_numeric',
  'established_year',
  'established_month'
];

async function validateCSVFile(filePath) {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`CSVファイルが見つかりません: ${absolutePath}`);
  }

  const stats = fs.statSync(absolutePath);
  console.log(`📊 ファイルサイズ: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // ヘッダー行を確認
  const firstLine = fs.readFileSync(absolutePath, 'utf8').split('\n')[0];
  const headers = firstLine.split(',').map(h => h.trim().replace(/"/g, ''));

  console.log('📋 CSVヘッダー:');
  headers.forEach((header, index) => {
    console.log(`  ${index + 1}. ${header}`);
  });

  return absolutePath;
}

async function getDataStats(client) {
  const result = await client.query('SELECT COUNT(*) as count FROM prtimes_companies');
  return parseInt(result.rows[0].count);
}

async function clearExistingData(client) {
  console.log('🗑️  既存データを削除中...');

  try {
    // マネージドDBサービス対応の削除方法
    // カテゴリテーブルを先に削除
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
    try {
      await client.query('TRUNCATE prtimes_categories, prtimes_companies RESTART IDENTITY');
      console.log('✅ TRUNCATE実行完了');
    } catch (truncateError) {
      console.log('⚠️  TRUNCATE権限なし、DELETEのみ実行');
      await client.query('DELETE FROM prtimes_categories');
      await client.query('DELETE FROM prtimes_companies');
    }
  }

  console.log('✅ 既存データの削除完了');
}

async function preprocessCSV(filePath) {
  const absolutePath = path.resolve(filePath);
  const tempPath = absolutePath + '.processed';

  console.log('📝 CSVファイルを前処理中...');

  const rl = readline.createInterface({
    input: fs.createReadStream(absolutePath),
    crlfDelay: Infinity
  });

  const writeStream = fs.createWriteStream(tempPath);
  let isFirstLine = true;

  for await (const line of rl) {
    if (isFirstLine) {
      // ヘッダー行はそのまま
      writeStream.write(line + '\n');
      isFirstLine = false;
    } else {
      // データ行の "-" を空文字に変換（カンマ区切りの独立した "-" のみ）
      let transformedLine = line;

      // ",-," を ",," に変換（複数回適用して連続する "-" も処理）
      while (transformedLine.includes(',-,')) {
        transformedLine = transformedLine.replace(/,-,/g, ',,');
      }

      // 行末の ",-" を "," に変換
      transformedLine = transformedLine.replace(/,-$/g, ',');

      writeStream.write(transformedLine + '\n');
    }
  }

  await new Promise((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on('error', reject);
  });

  console.log('✅ CSVファイル前処理完了');
  return tempPath;
}

async function importCSVData(client, filePath) {
  const absolutePath = path.resolve(filePath);

  console.log('🚀 CSVデータのインポート開始...');
  console.log(`📁 ファイル: ${absolutePath}`);

  const startTime = Date.now();

  // CSVファイルを前処理
  const processedPath = await preprocessCSV(absolutePath);

  // COPY FROM STDINクエリの構築（マネージドDB対応）
  const copyQuery = `
    COPY prtimes_companies (${CSV_COLUMNS.join(', ')})
    FROM STDIN
    DELIMITER ','
    CSV HEADER
    NULL ''
  `;

  return new Promise((resolve, reject) => {
    const stream = client.query(copyFrom(copyQuery));
    const fileStream = fs.createReadStream(processedPath);

    fileStream.on('error', (error) => {
      console.error('❌ ファイル読み込みエラー:', error.message);
      // 一時ファイルを削除
      try {
        fs.unlinkSync(processedPath);
      } catch (e) {}
      reject(error);
    });

    stream.on('error', (error) => {
      console.error('❌ COPY FROM STDINエラー:', error.message);

      // より詳細なエラー情報
      if (error.message.includes('invalid input syntax')) {
        console.log('💡 データ形式エラーの可能性があります。CSVの日付形式や数値形式をご確認ください。');
      }
      if (error.message.includes('permission denied')) {
        console.log('💡 データベース権限エラーです。データベースの権限をご確認ください。');
      }

      // 一時ファイルを削除
      try {
        fs.unlinkSync(processedPath);
      } catch (e) {}
      reject(error);
    });

    stream.on('finish', () => {
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      console.log(`⚡ インポート完了！`);
      console.log(`⏱️  処理時間: ${duration.toFixed(2)}秒`);

      // 一時ファイルを削除
      try {
        fs.unlinkSync(processedPath);
        console.log('✅ 一時ファイル削除完了');
      } catch (e) {}

      resolve(0);
    });

    // ファイルをストリームで読み込んでCOPYコマンドに送信
    fileStream.pipe(stream);
  });
}

async function validateImportedData(client) {
  console.log('🔍 インポートデータの検証中...');

  // 基本統計
  const countResult = await client.query('SELECT COUNT(*) as total FROM prtimes_companies');
  const total = parseInt(countResult.rows[0].total);

  // press_release_type の分布
  const typeResult = await client.query(`
    SELECT
      press_release_type,
      COUNT(*) as count
    FROM prtimes_companies
    WHERE press_release_type IS NOT NULL
    GROUP BY press_release_type
    ORDER BY count DESC
    LIMIT 10
  `);

  // 最新データの確認
  const latestResult = await client.query(`
    SELECT
      company_name,
      press_release_title,
      press_release_type,
      delivery_date
    FROM prtimes_companies
    ORDER BY delivery_date DESC
    LIMIT 5
  `);

  console.log(`📊 総インポート件数: ${total.toLocaleString()}件`);

  if (typeResult.rows.length > 0) {
    console.log('\n📈 プレスリリース種類分布:');
    typeResult.rows.forEach(row => {
      console.log(`  ${row.press_release_type}: ${row.count}件`);
    });
  } else {
    console.log('⚠️  press_release_typeデータがありません');
  }

  console.log('\n📰 最新データサンプル:');
  latestResult.rows.forEach((row, index) => {
    console.log(`  ${index + 1}. ${row.company_name} - ${row.press_release_title.substring(0, 50)}...`);
    console.log(`     種類: ${row.press_release_type || 'N/A'} | 日付: ${row.delivery_date}`);
  });

  return total;
}

async function main() {
  let client;

  try {
    console.log('🚀 PR TIMES高速バルクインポート開始...');
    console.log(`📁 ファイル: ${options.file}`);
    console.log(`🔄 既存データ削除: ${options.replace ? 'YES' : 'NO'}`);
    console.log(`🧪 ドライラン: ${options.dryRun ? 'YES' : 'NO'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // CSVファイルの検証
    const csvPath = await validateCSVFile(options.file);

    if (options.dryRun) {
      console.log('🧪 ドライランモード - 実際のインポートは行いません');
      return;
    }

    // データベース接続
    client = await pool.connect();
    console.log('✅ データベース接続成功');

    // 現在のデータ件数確認
    const beforeCount = await getDataStats(client);
    console.log(`📊 現在のデータ件数: ${beforeCount.toLocaleString()}件`);

    // トランザクション開始
    await client.query('BEGIN');

    try {
      // 既存データ削除（オプション）
      if (options.replace) {
        await clearExistingData(client);
      }

      // CSVデータインポート
      console.log('🔄 インポート実行中...');
      await importCSVData(client, csvPath);
      console.log('✅ インポート関数完了');

      // データ検証
      console.log('🔄 データ検証実行中...');
      const finalCount = await validateImportedData(client);
      console.log(`✅ データ検証完了: ${finalCount}件`);

      // トランザクションコミット
      console.log('🔄 トランザクションコミット中...');
      await client.query('COMMIT');
      console.log('✅ コミット完了');

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 インポート処理が正常に完了しました！');
      console.log(`📈 インポート件数: ${finalCount.toLocaleString()}件`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error('\n🔧 トラブルシューティング:');
    console.error('1. CSVファイルパスが正しいか確認');
    console.error('2. PostgreSQLが起動しているか確認');
    console.error('3. データベース接続情報が正しいか確認');
    console.error('4. CSVファイルの形式が正しいか確認');

    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// 実行
main().catch(console.error);