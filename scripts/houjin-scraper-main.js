/**
 * 法人スクレイパー統合実行スクリプト
 *
 * Step1: 国税庁APIから法人データ取得
 * Step2: ホームページをスクレイピングして情報補完
 * Step3: (今後実装) DBに保存
 */

const { fetchHoujinData, CONFIG } = require('./houjin-scraper-step1');
const { scrapeCompanies } = require('./houjin-scraper-step2');
const fs = require('fs').promises;
const path = require('path');

/**
 * 結果をCSVで保存（確認用）
 */
async function saveResultsToCSV(companies, filename) {
  const headers = [
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
  ];

  const csvLines = [headers.join(',')];
  companies.forEach(company => {
    const row = headers.map(header => {
      const value = company[header];
      return value === null || value === undefined ? '' : `"${value}"`;
    });
    csvLines.push(row.join(','));
  });

  const csvContent = csvLines.join('\n');
  const outputPath = path.join('/Users/hashimototaiga/Desktop', filename);
  await fs.writeFile(outputPath, csvContent, 'utf-8');

  console.log(`💾 CSV保存完了: ${outputPath}`);
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

    // 結果をCSVに保存
    const filename = `houjin_scraped_${CONFIG.TARGET_DATE_FROM}_${CONFIG.TARGET_DATE_TO}.csv`;
    await saveResultsToCSV(companiesWithWebsite, filename);

    // 統計情報
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 最終結果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const websiteCount = scrapedCompanies.filter(c => c.company_website).length;
    const representativeCount = companiesWithWebsite.filter(c => c.representative).length;
    const capitalCount = companiesWithWebsite.filter(c => c.capital_amount).length;
    const employeesCount = companiesWithWebsite.filter(c => c.employees).length;

    console.log(`処理件数: ${scrapedCompanies.length}件`);
    console.log(`ホームページ発見: ${websiteCount}件 (${Math.round(websiteCount / scrapedCompanies.length * 100)}%)`);
    console.log(`CSV保存件数: ${companiesWithWebsite.length}件\n`);
    console.log(`--- CSV保存データの内訳 ---`);
    console.log(`代表者名: ${representativeCount}件 (${Math.round(representativeCount / companiesWithWebsite.length * 100)}%)`);
    console.log(`資本金: ${capitalCount}件 (${Math.round(capitalCount / companiesWithWebsite.length * 100)}%)`);
    console.log(`従業員数: ${employeesCount}件 (${Math.round(employeesCount / companiesWithWebsite.length * 100)}%)`);

    console.log('\n✅ 全ての処理が完了しました！');
    console.log(`📁 保存先: ~/Desktop/${filename}\n`);

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// スクリプト実行
main();
