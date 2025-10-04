/**
 * 法人スクレイパー統合実行スクリプト
 *
 * Step1: 国税庁APIから法人データ取得
 * Step2: ホームページをスクレイピングして情報補完
 * Step3: DBに保存
 */

// 環境変数を読み込み
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const { fetchHoujinData, CONFIG } = require('./houjin-scraper-step1');
const { scrapeCompanies } = require('./houjin-scraper-step2');
const { Pool } = require('pg');
const { Transform } = require('stream');
const copyFrom = require('pg-copy-streams').from;
const fs = require('fs').promises;
const path = require('path');

/**
 * Step3: データベースに保存
 */
async function saveToDatabase(companies) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    console.log(`💾 データベースへ保存開始... (${companies.length}件)`);

    // TSV形式のストリームを作成
    const tsvStream = new Transform({
      objectMode: true,
      transform(company, encoding, callback) {
        const columns = [
          'company_name',
          'company_website',
          'representative',
          'address_1',
          'address_2',
          'prefecture',
          'employees',
          'capital_amount',
          'established_year',
          'established_month',
          'listing_status',
          'business_type',
          'industry_1',
          'industry_2_1',
          'industry_2_2',
          'industry_2_3',
          'industry_2_4',
          'industry_2_5',
          'industry_2_6',
          'industry_2_7',
          'industry_2_8',
          'industry_2_9',
          'industry_2_10',
          'industry_2_11',
          'industry_2_12',
          'industry_2_13',
          'industry_2_14',
          'industry_2_15',
          'industry_2_16',
          'industry_2_17',
          'industry_2_18',
          'industry_2_19',
          'industry_2_20',
        ];

        const row = columns.map(col => {
          const value = company[col];
          return value === null || value === undefined ? '\\N' : String(value);
        }).join('\t') + '\n';

        callback(null, row);
      }
    });

    // COPY FROMクエリ
    const copyQuery = `
      COPY companies (
        company_name, company_website, representative, address_1, address_2,
        prefecture, employees, capital_amount, established_year, established_month,
        listing_status, business_type, industry_1, industry_2_1, industry_2_2,
        industry_2_3, industry_2_4, industry_2_5, industry_2_6, industry_2_7,
        industry_2_8, industry_2_9, industry_2_10, industry_2_11, industry_2_12,
        industry_2_13, industry_2_14, industry_2_15, industry_2_16, industry_2_17,
        industry_2_18, industry_2_19, industry_2_20
      ) FROM STDIN WITH (FORMAT TEXT, DELIMITER E'\\t', NULL '\\N')
    `;

    const stream = client.query(copyFrom(copyQuery));

    // データを送信
    for (const company of companies) {
      tsvStream.write(company);
    }
    tsvStream.end();

    // ストリームをパイプ
    await new Promise((resolve, reject) => {
      tsvStream.pipe(stream)
        .on('finish', resolve)
        .on('error', reject);
    });

    console.log(`✅ データベース保存完了: ${companies.length}件`);

  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏢 法人スクレイパー統合実行');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Step1: 国税庁APIから取得
    console.log('📥 Step1を実行中...\n');
    const companies = await fetchHoujinData(
      CONFIG.TARGET_DATE_FROM,
      CONFIG.TARGET_DATE_TO
    );

    if (companies.length === 0) {
      console.log('⚠️ Step1で取得データが0件でした');
      return;
    }

    console.log(`✅ Step1完了: ${companies.length}件取得\n`);

    // Step2: スクレイピング
    console.log('🌐 Step2を実行中...\n');
    const scrapedCompanies = await scrapeCompanies(companies);
    console.log(`✅ Step2完了\n`);

    // ホームページが見つかったデータのみをフィルタリング
    const companiesWithWebsite = scrapedCompanies.filter(c => c.company_website);

    // 同じドメインのデータを除外（最初に出現したものだけ残す）
    const seenDomains = new Set();
    const uniqueCompanies = companiesWithWebsite.filter(c => {
      try {
        const url = new URL(c.company_website);
        const domain = url.hostname;

        if (seenDomains.has(domain)) {
          return false; // 既に出現したドメインなのでスキップ
        }

        seenDomains.add(domain);
        return true;
      } catch (error) {
        // URLパースエラーの場合は含める
        return true;
      }
    });

    console.log(`🔍 重複除外: ${companiesWithWebsite.length}件 → ${uniqueCompanies.length}件\n`);

    // Step3: データベースに保存
    console.log('💾 Step3を実行中...\n');
    await saveToDatabase(uniqueCompanies);
    console.log(`✅ Step3完了\n`);

    // 統計情報
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 最終結果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const websiteCount = scrapedCompanies.filter(c => c.company_website).length;
    const representativeCount = uniqueCompanies.filter(c => c.representative).length;
    const capitalCount = uniqueCompanies.filter(c => c.capital_amount).length;
    const employeesCount = uniqueCompanies.filter(c => c.employees).length;

    console.log(`処理件数: ${scrapedCompanies.length}件`);
    console.log(`ホームページ発見: ${websiteCount}件 (${Math.round(websiteCount / scrapedCompanies.length * 100)}%)`);
    console.log(`DB保存件数: ${uniqueCompanies.length}件\n`);
    console.log(`--- DB保存データの内訳 ---`);
    console.log(`代表者名: ${representativeCount}件 (${Math.round(representativeCount / uniqueCompanies.length * 100)}%)`);
    console.log(`資本金: ${capitalCount}件 (${Math.round(capitalCount / uniqueCompanies.length * 100)}%)`);
    console.log(`従業員数: ${employeesCount}件 (${Math.round(employeesCount / uniqueCompanies.length * 100)}%)`);

    console.log('\n✅ 全ての処理が完了しました！\n');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// スクリプト実行
main();
