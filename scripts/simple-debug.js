const puppeteer = require('puppeteer');

async function simpleDebug() {
  console.log('🔍 PRタイムズの構造をシンプルに調査...');

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false,
      slowMo: 1000,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    console.log('📄 PRタイムズにアクセス中...');
    await page.goto('https://prtimes.jp', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // 5秒待機
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 基本的な要素をチェック
    const basicInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        articleElements: document.querySelectorAll('article').length,
        linkElements: document.querySelectorAll('a[href*="/main/html/rd/p/"]').length,
        allLinks: document.querySelectorAll('a').length
      };
    });

    console.log('📊 基本情報:', basicInfo);

    // 30秒間ブラウザを開いたままにして手動で確認
    console.log('🔍 30秒間ブラウザを開いたままにします。手動で構造を確認してください...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

simpleDebug();