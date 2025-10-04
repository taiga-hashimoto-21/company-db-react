/**
 * 国税庁法人番号APIクライアント（Step1）
 *
 * 機能:
 * - 特定の設立日で法人データを取得
 * - companiesテーブル形式でデータを整形
 * - データ配列をstep2に渡す
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// ========================================
// 設定（ここを変更してください）
// ========================================
const CONFIG = {
  // 取得したい日付を設定（YYYY-MM-DD形式）
  TARGET_DATE_FROM: '2020-08-01',  // 開始日
  TARGET_DATE_TO: '2020-08-05',    // 終了日

  // 上限設定（TODO: 後で削除してください）
  MAX_RESULTS: 300,  // 50件制限（削除して全件取得する場合はこの行とlimit処理を削除）

  // その他設定
  APPLICATION_ID: 'KtLKHsYJGaNRT',  // 国税庁APIのアプリケーションID
  REQUEST_DELAY: 1000,              // リクエスト間隔（ミリ秒）
};

// 国税庁法人番号API設定
const HOUJIN_API_BASE_URL = 'https://api.houjin-bangou.nta.go.jp/4';
const DIFF_ENDPOINT = '/diff';

/**
 * 国税庁APIから法人データを取得
 */
async function fetchHoujinData(startDate, endDate) {
  console.log('🔍 法人番号API検索開始');
  console.log(`📅 検索期間: ${startDate} ~ ${endDate}`);
  console.log(`📊 上限: ${CONFIG.MAX_RESULTS}件`);

  try {
    // APIリクエスト
    const url = `${HOUJIN_API_BASE_URL}${DIFF_ENDPOINT}`;
    const params = {
      id: CONFIG.APPLICATION_ID,
      from: startDate,
      to: endDate,
      type: '01',  // 01: 新規設立のみ
      divide: '1', // 1: CSV形式
    };

    console.log(`\n📡 APIリクエスト中...`);
    const response = await axios.get(url, {
      params,
      timeout: 60000,  // 60秒タイムアウト
      responseType: 'arraybuffer',  // バイナリデータとして取得
    });

    // Shift-JISからUTF-8に変換
    const iconv = require('iconv-lite');
    const csvText = iconv.decode(response.data, 'shift-jis');

    // CSVをパース
    const lines = csvText.split('\n');
    const dataLines = lines.slice(1).filter(line => line.trim() !== ''); // ヘッダー行をスキップ

    console.log(`✅ ${dataLines.length}件取得完了`);

    // companiesテーブル形式に変換
    const companies = dataLines.map(line => parseCsvLine(line)).filter(c => c !== null);

    // 設立年月が設定されているデータのみに絞る（更新日===法人番号付与日）
    const filteredCompanies = companies.filter(c => c.established_year !== null);
    console.log(`📊 設立年月あり: ${filteredCompanies.length}件`);

    // TODO: 1000件制限（後で削除してください）
    const limitedCompanies = filteredCompanies.slice(0, CONFIG.MAX_RESULTS);
    console.log(`📊 制限適用後: ${limitedCompanies.length}件`);

    return limitedCompanies;

  } catch (error) {
    console.error('❌ 法人データ取得エラー:', error.message);
    throw error;
  }
}

/**
 * CSV行をパースしてcompaniesテーブル形式に変換
 */
function parseCsvLine(line) {
  try {
    const columns = line.split(',').map(col => col.replace(/^"|"$/g, '').trim());

    // 列データ
    const houjinBangou = columns[1];              // 法人番号
    const companyName = columns[6];               // 会社名
    const prefecture = columns[9];                // 都道府県
    const city = columns[10];                     // 市区町村
    const streetNumber = columns[11];             // 番地
    const diffUpdateDate = columns[4];            // 差分データの更新年月日
    const assignmentDate = columns[22];           // 法人番号指定年月日

    // 設立年月の判定：差分データの更新年月日と法人番号指定年月日が一致している場合のみ設定
    let establishedYear = null;
    let establishedMonth = null;

    if (diffUpdateDate && assignmentDate && diffUpdateDate === assignmentDate) {
      // 一致している場合は設立日として扱う
      if (assignmentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month] = assignmentDate.split('-');
        establishedYear = parseInt(year);
        establishedMonth = parseInt(month);
      }
    }

    // companiesテーブル形式（完全一致）
    return {
      company_name: companyName,
      company_website: null,           // スクレイピングで取得
      representative: null,            // スクレイピングで取得
      address_1: `${city}${streetNumber}`,
      address_2: null,
      prefecture: prefecture,
      employees: null,
      capital_amount: null,            // スクレイピングで取得
      established_year: establishedYear,
      established_month: establishedMonth,
      listing_status: null,
      business_type: null,             // スクレイピングで取得
      industry_1: null,                // スクレイピングで取得
      industry_2_1: null,
      industry_2_2: null,
      industry_2_3: null,
      industry_2_4: null,
      industry_2_5: null,
      industry_2_6: null,
      industry_2_7: null,
      industry_2_8: null,
      industry_2_9: null,
      industry_2_10: null,
      industry_2_11: null,
      industry_2_12: null,
      industry_2_13: null,
      industry_2_14: null,
      industry_2_15: null,
      industry_2_16: null,
      industry_2_17: null,
      industry_2_18: null,
      industry_2_19: null,
      industry_2_20: null,
    };
  } catch (error) {
    console.error('⚠️ CSV解析エラー:', error.message);
    return null;
  }
}


/**
 * メイン処理（単独実行時のみ）
 */
async function main() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏢 Step1: 国税庁法人番号API取得');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 法人データ取得
    const companies = await fetchHoujinData(
      CONFIG.TARGET_DATE_FROM,
      CONFIG.TARGET_DATE_TO
    );

    if (companies.length === 0) {
      console.log('⚠️ 取得データが0件でした');
      return [];
    }

    // 統計情報を表示
    console.log('\n📊 取得データ統計:');
    console.log(`   総件数: ${companies.length}件`);
    console.log(`   都道府県数: ${new Set(companies.map(c => c.prefecture)).size}種類`);

    // サンプルデータ表示
    console.log('\n📋 サンプルデータ (最初の3件):');
    companies.slice(0, 3).forEach((company, index) => {
      console.log(`\n${index + 1}. ${company.company_name}`);
      console.log(`   住所: ${company.prefecture}${company.address_1}`);
      console.log(`   設立: ${company.established_year}年${company.established_month}月`);
    });

    console.log('\n✅ Step1完了！');
    console.log(`📦 ${companies.length}件のデータをStep2に渡します\n`);

    return companies;

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main();
}

module.exports = {
  fetchHoujinData,
  CONFIG,
};
