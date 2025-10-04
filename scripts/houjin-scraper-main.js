/**
 * 法人スクレイパー統合実行スクリプト
 *
 * Step1: 国税庁APIから法人データ取得
 * Step2: ホームページをスクレイピングして情報補完
 * Step3: DBに保存
 *
 * 自動化機能:
 * - scraper-state.jsonから処理期間を読み取り
 * - 1日ずつ処理してDB保存
 * - 完了後、次回の処理期間（2ヶ月前）を計算して保存
 */

// 環境変数を読み込み
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const { fetchHoujinData } = require('./houjin-scraper-step1');
const { scrapeCompanies } = require('./houjin-scraper-step2');
const { Pool } = require('pg');
const { Transform } = require('stream');
const copyFrom = require('pg-copy-streams').from;
const fs = require('fs').promises;
const fsSync = require('fs');
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
 * 状態ファイルの読み込み
 */
function loadState() {
  const statePath = path.join(__dirname, 'scraper-state.json');
  if (fsSync.existsSync(statePath)) {
    return JSON.parse(fsSync.readFileSync(statePath, 'utf-8'));
  }
  // 初期状態
  return {
    lastProcessedStartDate: null,
    lastProcessedEndDate: null,
    nextStartDate: '2025-08-01',
    nextEndDate: '2025-09-30',
    totalProcessed: 0,
    lastRunDate: null
  };
}

/**
 * 状態ファイルの保存
 */
function saveState(state) {
  const statePath = path.join(__dirname, 'scraper-state.json');
  fsSync.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * 次回の処理期間を計算（2ヶ月前に遡る）
 */
function calculateNextPeriod(currentStartDate) {
  const start = new Date(currentStartDate);

  // 2ヶ月前の開始日を計算
  const nextEndDate = new Date(start);
  nextEndDate.setDate(nextEndDate.getDate() - 1); // 1日前

  const nextStartDate = new Date(nextEndDate);
  nextStartDate.setMonth(nextStartDate.getMonth() - 2); // 2ヶ月前

  return {
    nextStartDate: nextStartDate.toISOString().split('T')[0],
    nextEndDate: nextEndDate.toISOString().split('T')[0]
  };
}

/**
 * 日付範囲の全日付を生成
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * 1日分の処理
 */
async function processDate(date) {
  console.log(`\n📅 ${date} の処理開始...`);

  // Step1: 国税庁APIから取得
  const companies = await fetchHoujinData(date, date);

  if (companies.length === 0) {
    console.log(`⚠️ ${date}: 取得データが0件でした`);
    return 0;
  }

  console.log(`✅ Step1完了: ${companies.length}件取得`);

  // Step2: スクレイピング
  const scrapedCompanies = await scrapeCompanies(companies);
  console.log(`✅ Step2完了`);

  // ホームページが見つかったデータのみをフィルタリング
  const companiesWithWebsite = scrapedCompanies.filter(c => c.company_website);

  // 同じドメインのデータを除外
  const seenDomains = new Set();
  const uniqueCompanies = companiesWithWebsite.filter(c => {
    try {
      const url = new URL(c.company_website);
      const domain = url.hostname;

      if (seenDomains.has(domain)) {
        return false;
      }

      seenDomains.add(domain);
      return true;
    } catch (error) {
      return true;
    }
  });

  console.log(`🔍 重複除外: ${companiesWithWebsite.length}件 → ${uniqueCompanies.length}件`);

  // Step3: データベースに保存
  if (uniqueCompanies.length > 0) {
    await saveToDatabase(uniqueCompanies);
    console.log(`✅ Step3完了: ${uniqueCompanies.length}件保存`);
  }

  return uniqueCompanies.length;
}

/**
 * メイン処理
 */
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏢 法人スクレイパー自動実行');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 状態ファイル読み込み
    const state = loadState();
    console.log(`📋 処理期間: ${state.nextStartDate} ~ ${state.nextEndDate}\n`);

    // 日付範囲を生成
    const dates = generateDateRange(state.nextStartDate, state.nextEndDate);
    console.log(`📊 処理対象: ${dates.length}日分\n`);

    let totalSaved = 0;

    // 各日付を順次処理
    for (const date of dates) {
      const saved = await processDate(date);
      totalSaved += saved;
      console.log(`累計保存件数: ${totalSaved}件`);
    }

    // 次回の期間を計算
    const nextPeriod = calculateNextPeriod(state.nextStartDate);

    // 状態を更新
    const newState = {
      lastProcessedStartDate: state.nextStartDate,
      lastProcessedEndDate: state.nextEndDate,
      nextStartDate: nextPeriod.nextStartDate,
      nextEndDate: nextPeriod.nextEndDate,
      totalProcessed: state.totalProcessed + totalSaved,
      lastRunDate: new Date().toISOString()
    };

    saveState(newState);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 実行結果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`処理期間: ${state.nextStartDate} ~ ${state.nextEndDate}`);
    console.log(`保存件数: ${totalSaved}件`);
    console.log(`次回期間: ${nextPeriod.nextStartDate} ~ ${nextPeriod.nextEndDate}`);
    console.log(`累計保存: ${newState.totalProcessed}件`);
    console.log('\n✅ 全ての処理が完了しました！\n');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// スクリプト実行
main();
