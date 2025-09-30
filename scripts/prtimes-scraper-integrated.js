#!/usr/bin/env node
/**
 * PR TIMES統合スクレイピングツール
 * Step1 → Step2 → Step3（DB保存）を自動実行
 */

// 環境変数を読み込み
require('dotenv').config();

const { scrapePRTimesStep1 } = require('./prtimes-scraper-step1');
const { scrapePRTimesStep2 } = require('./prtimes-scraper-step2');
const { scrapePRTimesStep3 } = require('./prtimes-scraper-step3');

async function main() {
  console.log('🚀 PR TIMES統合スクレイピング開始...\n');

  try {
    // Step1: 一覧ページから記事リストを取得
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Step1: 記事リストの取得');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const step1Results = await scrapePRTimesStep1();

    if (!step1Results || step1Results.length === 0) {
      console.log('⚠️  Step1で記事が取得できませんでした。処理を終了します。');
      return;
    }

    console.log(`✅ Step1完了: ${step1Results.length}件の記事を取得\n`);

    // Step2: 各記事の詳細ページから詳細情報を取得
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Step2: 詳細情報の取得');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const step2Results = await scrapePRTimesStep2(step1Results);

    if (!step2Results || step2Results.length === 0) {
      console.log('⚠️  Step2で詳細情報が取得できませんでした。処理を終了します。');
      return;
    }

    console.log(`✅ Step2完了: ${step2Results.length}件の詳細情報を取得\n`);

    // Step3: データベースにインポート
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🗄️  Step3: データベースにインポート');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const importedCount = await scrapePRTimesStep3(step2Results);

    console.log(`✅ Step3完了: ${importedCount}件をインポート\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 すべての処理が完了しました！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 取得件数: ${step2Results.length}件`);
    console.log(`🗄️  データベース追加件数: ${importedCount}件`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ すべての処理が完了しました！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 処理でエラーが発生しました:', error);
      process.exit(1);
    });
}

module.exports = { main };