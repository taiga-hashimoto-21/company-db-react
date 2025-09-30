const puppeteer = require('puppeteer');

async function debugPRTimesStructure() {
  console.log('🔍 PRタイムズのHTML構造を調査中...');

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false,
      slowMo: 500,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    console.log('📄 PRタイムズにアクセス中...');
    await page.goto('https://prtimes.jp', { waitUntil: 'networkidle2' });

    // ページの読み込みを少し待つ
    await page.waitForTimeout(3000);

    // 記事要素の構造を調査
    const articleInfo = await page.evaluate(() => {
      // さまざまなセレクタを試す
      const selectors = [
        'article',
        '.list-article',
        '.article',
        '[class*="article"]',
        '[class*="list"]',
        'a[href*="/main/html/rd/p/"]'
      ];

      const results = {};

      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        results[selector] = {
          count: elements.length,
          elements: Array.from(elements).slice(0, 3).map(el => ({
            tagName: el.tagName,
            className: el.className,
            innerHTML: el.innerHTML.substring(0, 200) + '...'
          }))
        };
      });

      // 記事のリンクを探す
      const links = document.querySelectorAll('a[href*="/main/html/rd/p/"]');
      results.pressReleaseLinks = {
        count: links.length,
        samples: Array.from(links).slice(0, 5).map(link => ({
          href: link.href,
          text: link.textContent.trim().substring(0, 100),
          parent: link.parentElement.className
        }))
      };

      return results;
    });

    console.log('📊 調査結果:');
    console.log(JSON.stringify(articleInfo, null, 2));

    // 現在のページのHTMLも保存
    const html = await page.content();
    const fs = require('fs');
    fs.writeFileSync('/Users/hashimototaiga/Desktop/prtimes-debug.html', html);
    console.log('💾 デバッグ用HTMLを保存しました: /Users/hashimototaiga/Desktop/prtimes-debug.html');

    // ブラウザを10秒間開いたままにして手動確認
    console.log('🔍 10秒間ブラウザを開いたままにします...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugPRTimesStructure();