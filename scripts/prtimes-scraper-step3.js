const { Pool } = require('pg');
const { from: copyFrom } = require('pg-copy-streams');
const { Readable } = require('stream');

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

async function scrapePRTimesStep3(step2Results) {
  console.log('🚀 PRタイムズ Step3 データベースインポート開始...');
  console.log(`📊 インポート対象: ${step2Results.length}件`);

  let client;

  try {
    // データベース接続
    client = await pool.connect();
    console.log('✅ データベース接続成功');

    // 現在のデータ件数確認
    const beforeCount = await getDataStats(client);
    console.log(`📊 現在のデータ件数: ${beforeCount.toLocaleString()}件`);

    // トランザクション開始
    await client.query('BEGIN');

    try {
      // CSV形式の文字列に変換
      console.log('📝 CSV形式に変換中...');
      const csvContent = convertToCSV(step2Results);

      // 前処理（"-" → 空文字変換）
      console.log('🔄 データ前処理中...');
      const processedContent = preprocessCSVContent(csvContent);

      // COPY FROM STDINでインポート
      console.log('⚡ データベースにインポート中...');
      const startTime = Date.now();

      const copyQuery = `
        COPY prtimes_companies (${CSV_COLUMNS.join(', ')})
        FROM STDIN
        DELIMITER ','
        CSV HEADER
        NULL ''
      `;

      await new Promise((resolve, reject) => {
        const stream = client.query(copyFrom(copyQuery));
        const readableStream = Readable.from([processedContent]);

        readableStream.on('error', (error) => {
          console.error('❌ ストリーム読み込みエラー:', error.message);
          reject(error);
        });

        stream.on('error', (error) => {
          console.error('❌ COPY FROM STDINエラー:', error.message);
          reject(error);
        });

        stream.on('finish', () => {
          const endTime = Date.now();
          const duration = (endTime - startTime) / 1000;
          console.log(`⚡ インポート完了！`);
          console.log(`⏱️  処理時間: ${duration.toFixed(2)}秒`);
          resolve();
        });

        readableStream.pipe(stream);
      });

      // データ検証
      console.log('🔍 インポート結果を検証中...');
      const afterCount = await getDataStats(client);
      const importedCount = afterCount - beforeCount;

      console.log(`📊 インポート前: ${beforeCount.toLocaleString()}件`);
      console.log(`📊 インポート後: ${afterCount.toLocaleString()}件`);
      console.log(`📈 追加件数: ${importedCount.toLocaleString()}件`);

      // トランザクションコミット
      console.log('🔄 トランザクションコミット中...');
      await client.query('COMMIT');
      console.log('✅ コミット完了');

      return importedCount;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// データ件数取得
async function getDataStats(client) {
  const result = await client.query('SELECT COUNT(*) as count FROM prtimes_companies');
  return parseInt(result.rows[0].count);
}

// Step2の結果をCSV文字列に変換
function convertToCSV(results) {
  // CSVヘッダー
  const header = '配信日時,プレスリリースURL,プレスリリースタイトル,プレスリリース種類,プレスリリースカテゴリ1,プレスリリースカテゴリ2,会社名,会社URL,業種,住所,電話番号,代表者,上場区分,資本金,設立日,資本金（万円）,設立年,設立月\n';

  // CSVエスケープ処理
  const escapeCsv = (str) => {
    const text = String(str || '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  // 会社名が取得できなかった記事をスキップ
  const validResults = results.filter(result => {
    const companyName = result.companyName;
    return companyName &&
           companyName.trim() !== '' &&
           companyName !== '(会社名なし)' &&
           companyName !== '不明';
  });

  const skippedCount = results.length - validResults.length;
  if (skippedCount > 0) {
    console.log(`⚠️  会社名が取得できなかった記事をスキップ: ${skippedCount}件`);
  }

  // データ行
  const rows = validResults.map(result => {
    return [
      escapeCsv(result.deliveryDate),
      escapeCsv(result.pressReleaseUrl),
      escapeCsv(result.pressReleaseTitle),
      escapeCsv(result.type),
      escapeCsv(result.category1),
      escapeCsv(result.category2),
      escapeCsv(result.companyName),
      escapeCsv(result.companyUrl),
      escapeCsv(result.industry),
      escapeCsv(result.address),
      escapeCsv(result.phone),
      escapeCsv(result.representative),
      escapeCsv(result.listingStatus),
      escapeCsv(result.capital),
      escapeCsv(result.established),
      escapeCsv(result.capitalNumeric),
      escapeCsv(result.year),
      escapeCsv(result.month)
    ].join(',');
  }).join('\n');

  return header + rows;
}

// CSV前処理（"-" → 空文字変換）
function preprocessCSVContent(csvContent) {
  const lines = csvContent.split('\n');
  const header = lines[0];
  const dataLines = lines.slice(1);

  const processedLines = dataLines.map(line => {
    if (!line.trim()) return line;

    // ",-," を ",," に変換（複数回適用して連続する "-" も処理）
    let transformedLine = line;
    while (transformedLine.includes(',-,')) {
      transformedLine = transformedLine.replace(/,-,/g, ',,');
    }

    // 行末の ",-" を "," に変換
    transformedLine = transformedLine.replace(/,-$/g, ',');

    // 行頭の "-," を "," に変換
    transformedLine = transformedLine.replace(/^-,/g, ',');

    return transformedLine;
  });

  return header + '\n' + processedLines.join('\n');
}

module.exports = { scrapePRTimesStep3 };