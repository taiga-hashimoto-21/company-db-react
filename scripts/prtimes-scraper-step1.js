const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ターゲット日付の設定
const TARGET_DATE = '2025-09-29';

// CSV出力先パス（macのDesktop）
const CSV_OUTPUT_PATH = '/Users/hashimototaiga/Desktop/step1_results.csv';

// PRタイムズの新着記事URL
const PRTIMES_BASE_URL = 'https://prtimes.jp/main/html/newarrival';

async function scrapePRTimesStep1() {
  console.log('🚀 PRタイムズ Step1 スクレイピング開始...');
  console.log(`📅 ターゲット日付: ${TARGET_DATE}`);

  let browser;
  const results = [];

  try {
    // Puppeteerブラウザを起動
    browser = await puppeteer.launch({
      headless: false, // デバッグ用にブラウザを表示
      slowMo: 100, // 操作を少し遅くしてデバッグしやすくする
      args: [
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-extensions',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-client-side-phishing-detection',
        '--disable-ipc-flooding-protection',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-blink-features=AutomationControlled',
        '--disable-site-isolation-trials',
        '--test-type',
        '--allow-running-insecure-content',
        '--disable-component-update'
      ]
    });

    const page = await browser.newPage();

    // Cookie設定を有効化
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 追加のページ設定
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8'
    });

    // ビューポートを設定
    await page.setViewport({ width: 1200, height: 800 });

    // コンソールエラーを無視（Third-party cookieエラーなど）
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('Third-party cookie')) {
        // Third-party cookie エラーは無視
        return;
      }
    });

    // PRタイムズの新着記事ページにアクセス
    console.log('📄 PRタイムズ新着記事ページにアクセス中...');
    await page.goto(PRTIMES_BASE_URL, { waitUntil: 'networkidle2' });

    // 最初に50回「もっと見る」ボタンをクリックして過去の記事まで遡る
    console.log('⏳ 過去の記事を読み込むため、最初に50回「もっと見る」をクリック中...');
    await clickMoreButtonMultipleTimes(page, 0);

    let pageCount = 0;
    let foundTargetDate = false;
    let processedLinkCount = 0; // 処理済みのリンク数を追跡

    while (!foundTargetDate && pageCount < 80) {
      pageCount++;
      console.log(`📖 ページ ${pageCount} を処理中...`);

      // 新しく追加された記事のみを抽出
      const pageResults = await extractNewArticles(page, TARGET_DATE, processedLinkCount);

      console.log(`✅ ${pageResults.length}件の記事を抽出`);
      results.push(...pageResults);

      // 処理済みリンク数を更新
      const currentTotalLinks = await page.$$eval('a[href*="/main/html/rd/p/"]', links => links.length);
      processedLinkCount = currentTotalLinks;

      // ターゲット日付より古い記事が見つかったかチェック
      const olderArticleInfo = await checkForOlderArticles(page, TARGET_DATE);
      if (olderArticleInfo.found) {
        console.log(`⏹️  ${TARGET_DATE}より古い記事が見つかりました。処理を終了します。`);
        console.log(`🕰️ 古い記事の詳細: datetime="${olderArticleInfo.datetime}", 抽出日付="${olderArticleInfo.articleDate}"`);
        foundTargetDate = true;
        break;
      }

      // 「もっと見る」ボタンを探してクリック
      console.log('🔍 「もっと見る」ボタンを検索中...');

      // 「もっと見る」ボタンを検索
      const moreButton = await page.evaluate(() => {
        // 「もっと見る」ボタンを検索
        const allElements = [
          ...document.querySelectorAll('a'),
          ...document.querySelectorAll('button')
        ];

        for (let element of allElements) {
          const text = element.textContent.trim();

          if (text === 'もっと見る') {
            console.log(`✅ 「もっと見る」ボタンを発見`);
            return element;
          }
        }

        console.log('❌ 「もっと見る」ボタンが見つかりませんでした');
        console.log(`📊 検索対象要素数: ${allElements.length}`);
        return null;
      });

      if (!moreButton) {
        console.log('⏹️  「もっと見る」ボタンが見つかりません。処理を終了します。');
        break;
      }

      console.log('👆 「もっと見る」ボタンをクリック...');

      // 一番下までスムーズにスクロール
      await page.evaluate(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'smooth'
        });
      });

      // スクロール完了を待つ
      await new Promise(resolve => setTimeout(resolve, 1000));

      // JavaScriptでクリックを実行
      console.log('⚡ 「もっと見る」ボタンをクリック実行中...');
      await page.evaluate(() => {
        const allElements = [
          ...document.querySelectorAll('a'),
          ...document.querySelectorAll('button')
        ];

        for (let element of allElements) {
          const text = element.textContent.trim();

          if (text === 'もっと見る') {
            console.log('🎯 「もっと見る」ボタンをクリック実行');
            element.click();
            return true;
          }
        }

        return false;
      });

      // ページの読み込みを待機
      // await new Promise(resolve => setTimeout(resolve, 2000));

      // 新しいコンテンツの読み込みを待機
      console.log('⏳ 新しいコンテンツの読み込み待機中...');
      const currentLinkCount = await page.$$eval('a[href*="/main/html/rd/p/"]', links => links.length);
      console.log(`📊 クリック前のリンク数: ${currentLinkCount}`);

      // 簡単な待機（コンテンツの読み込み完了を待つ）
      await new Promise(resolve => setTimeout(resolve, 2000));

      const newLinkCount = await page.$$eval('a[href*="/main/html/rd/p/"]', links => links.length);
      console.log(`📊 クリック後のリンク数: ${newLinkCount} (+${newLinkCount - currentLinkCount})`);
    }

    console.log(`🎉 抽出完了！合計 ${results.length} 件の記事を取得しました`);

    // CSVファイルに出力
    await saveToCSV(results);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// 指定回数「もっと見る」ボタンをクリックする関数
async function clickMoreButtonMultipleTimes(page, times) {
  for (let i = 0; i < times; i++) {
    console.log(`👆 「もっと見る」ボタンをクリック中... (${i + 1}/${times})`);

    // 「もっと見る」ボタンを探してクリック
    const moreButtonSelectors = [
      '.list-article__more-link',
      'button[class*="more"]',
      'a[class*="more"]',
      '[class*="load-more"]',
      'button:contains("もっと見る")',
      'a:contains("もっと見る")',
      'a[href*="pagination_cursor"]',
      'button',
      'a[href="#"]'
    ];

    let moreButton = null;
    for (let selector of moreButtonSelectors) {
      moreButton = await page.$(selector);
      if (moreButton) {
        const text = await page.evaluate(el => el.textContent, moreButton);
        if (text.includes('もっと') || text.includes('more') || text.includes('続き')) {
          break;
        }
        moreButton = null;
      }
    }

    if (!moreButton) {
      console.log(`⏹️  「もっと見る」ボタンが見つかりません。${i}回クリックして停止します。`);
      break;
    }

    // 一番下までスムーズにスクロール
    await page.evaluate(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
    });

    // スクロール完了を待つ
    await new Promise(resolve => setTimeout(resolve, 800));

    // JavaScriptでクリックを実行
    await page.evaluate((button) => {
      button.click();
    }, moreButton);

    // 新しいコンテンツの読み込みを待機
    try {
      await page.waitForFunction(
        () => {
          return document.readyState === 'complete';
        },
        { timeout: 5000 }
      );
    } catch (error) {
      console.log(`⚠️  ${i + 1}回目のコンテンツ読み込みがタイムアウトしました`);
    }
  }

  console.log(`✅ 「もっと見る」ボタンを${times}回クリック完了`);
}

// 新しく追加された記事のみを抽出する関数
async function extractNewArticles(page, targetDate, processedLinkCount) {
  return await page.evaluate((targetDate, processedLinkCount) => {
    // PRタイムズのプレスリリースリンクを全て取得
    const pressReleaseLinks = document.querySelectorAll('a[href*="/main/html/rd/p/"]');
    const results = [];

    // 新しく追加された記事のみを処理（processedLinkCount以降）
    for (let i = processedLinkCount; i < pressReleaseLinks.length; i++) {
      const link = pressReleaseLinks[i];

      try {
        // 親要素から記事情報を抽出
        const article = link.closest('article') || link.parentElement;
        if (!article) continue;

        // 時間要素を探す（複数のパターンを試す）
        let timeElement = article.querySelector('time[datetime]') ||
                         article.querySelector('time') ||
                         link.querySelector('time[datetime]') ||
                         link.querySelector('time');

        if (!timeElement) {
          // 時間要素が見つからない場合、親要素でも探す
          let parent = article.parentElement;
          while (parent && !timeElement) {
            timeElement = parent.querySelector('time[datetime]');
            parent = parent.parentElement;
          }
        }

        if (!timeElement) continue;

        // datetime属性から日付を取得
        const datetime = timeElement.getAttribute('datetime') || timeElement.textContent;
        if (!datetime) continue;

        // 日付部分を抽出（YYYY-MM-DD形式）
        let articleDate;
        if (datetime.includes(' ')) {
          articleDate = datetime.split(' ')[0];
        } else if (datetime.includes('T')) {
          articleDate = datetime.split('T')[0];
        } else {
          // 日本語の日付形式の場合（例：2025年9月28日）
          const match = datetime.match(/(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/);
          if (match) {
            const year = match[1];
            const month = match[2].padStart(2, '0');
            const day = match[3].padStart(2, '0');
            articleDate = `${year}-${month}-${day}`;
          }
        }

        if (!articleDate) continue;

        // ターゲット日付の記事のみを抽出
        if (articleDate === targetDate) {
          // タイトルを取得（複数のパターンを試す）
          let title = '';
          const titleSelectors = ['h3', 'h2', '.title', '[class*="title"]'];
          for (let selector of titleSelectors) {
            const titleElement = link.querySelector(selector) || article.querySelector(selector);
            if (titleElement) {
              title = titleElement.textContent.trim();
              if (title) break;
            }
          }

          // 会社名を取得（複数のパターンを試す）
          let companyName = '';
          const companySelectors = [
            '.list-article__company-name--dummy',
            '[class*="company"]',
            '[class*="name"]'
          ];
          for (let selector of companySelectors) {
            const companyElement = link.querySelector(selector) || article.querySelector(selector);
            if (companyElement) {
              companyName = companyElement.textContent.trim();
              if (companyName) break;
            }
          }

          // リンクのhref属性を取得
          const href = link.getAttribute('href');

          if (href && title) {
            results.push({
              link: href.startsWith('http') ? href : 'https://prtimes.jp' + href,
              datetime: datetime,
              companyName: companyName || '不明',
              title: title
            });
          }
        }
      } catch (error) {
        console.error('記事抽出エラー:', error);
      }
    }

    return results;
  }, targetDate, processedLinkCount);
}

// 現在のページから記事を抽出する関数（既存の関数は保持）
async function extractArticlesFromCurrentPage(page, targetDate) {
  return await page.evaluate((targetDate) => {
    // PRタイムズのプレスリリースリンクを全て取得
    const pressReleaseLinks = document.querySelectorAll('a[href*="/main/html/rd/p/"]');
    const results = [];

    pressReleaseLinks.forEach(link => {
      try {
        // 親要素から記事情報を抽出
        const article = link.closest('article') || link.parentElement;
        if (!article) return;

        // 時間要素を探す（複数のパターンを試す）
        let timeElement = article.querySelector('time[datetime]') ||
                         article.querySelector('time') ||
                         link.querySelector('time[datetime]') ||
                         link.querySelector('time');

        if (!timeElement) {
          // 時間要素が見つからない場合、親要素でも探す
          let parent = article.parentElement;
          while (parent && !timeElement) {
            timeElement = parent.querySelector('time[datetime]');
            parent = parent.parentElement;
          }
        }

        if (!timeElement) return;

        // datetime属性から日付を取得
        const datetime = timeElement.getAttribute('datetime') || timeElement.textContent;
        if (!datetime) return;

        // 日付部分を抽出（YYYY-MM-DD形式）
        let articleDate;
        if (datetime.includes(' ')) {
          articleDate = datetime.split(' ')[0];
        } else if (datetime.includes('T')) {
          articleDate = datetime.split('T')[0];
        } else {
          // 日本語の日付形式の場合（例：2025年9月28日）
          const match = datetime.match(/(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/);
          if (match) {
            const year = match[1];
            const month = match[2].padStart(2, '0');
            const day = match[3].padStart(2, '0');
            articleDate = `${year}-${month}-${day}`;
          }
        }

        if (!articleDate) return;

        // ターゲット日付の記事のみを抽出
        if (articleDate === targetDate) {
          // タイトルを取得（複数のパターンを試す）
          let title = '';
          const titleSelectors = ['h3', 'h2', '.title', '[class*="title"]'];
          for (let selector of titleSelectors) {
            const titleElement = link.querySelector(selector) || article.querySelector(selector);
            if (titleElement) {
              title = titleElement.textContent.trim();
              if (title) break;
            }
          }

          // 会社名を取得（複数のパターンを試す）
          let companyName = '';
          const companySelectors = [
            '.list-article__company-name--dummy',
            '[class*="company"]',
            '[class*="name"]'
          ];
          for (let selector of companySelectors) {
            const companyElement = link.querySelector(selector) || article.querySelector(selector);
            if (companyElement) {
              companyName = companyElement.textContent.trim();
              if (companyName) break;
            }
          }

          // リンクのhref属性を取得
          const href = link.getAttribute('href');

          if (href && title) {
            results.push({
              link: href.startsWith('http') ? href : 'https://prtimes.jp' + href,
              datetime: datetime,
              companyName: companyName || '不明',
              title: title
            });
          }
        }
      } catch (error) {
        console.error('記事抽出エラー:', error);
      }
    });

    return results;
  }, targetDate);
}

// ターゲット日付より古い記事があるかチェックする関数
async function checkForOlderArticles(page, targetDate) {
  return await page.evaluate((targetDate) => {
    const pressReleaseLinks = document.querySelectorAll('a[href*="/main/html/rd/p/"]');

    for (let link of pressReleaseLinks) {
      const article = link.closest('article') || link.parentElement;
      if (!article) continue;

      // 時間要素を探す
      let timeElement = article.querySelector('time[datetime]') ||
                       article.querySelector('time') ||
                       link.querySelector('time[datetime]') ||
                       link.querySelector('time');

      if (timeElement) {
        const datetime = timeElement.getAttribute('datetime') || timeElement.textContent;
        if (datetime) {
          // 日付部分を抽出
          let articleDate;
          if (datetime.includes(' ')) {
            articleDate = datetime.split(' ')[0];
          } else if (datetime.includes('T')) {
            articleDate = datetime.split('T')[0];
          } else {
            // 日本語の日付形式の場合
            const match = datetime.match(/(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/);
            if (match) {
              const year = match[1];
              const month = match[2].padStart(2, '0');
              const day = match[3].padStart(2, '0');
              articleDate = `${year}-${month}-${day}`;
            }
          }

          if (articleDate && articleDate < targetDate) {
            return {
              found: true,
              datetime: datetime,
              articleDate: articleDate
            }; // ターゲット日付より古い記事が見つかった
          }
        }
      }
    }
    return { found: false };
  }, targetDate);
}

// CSVファイルに保存する関数
async function saveToCSV(results) {
  if (results.length === 0) {
    console.log('⚠️  保存するデータがありません');
    return;
  }

  // CSVヘッダー
  const csvHeader = 'リンク,配信日時,会社名,タイトル\n';

  // CSVデータ行
  const csvData = results.map(result => {
    // CSVエスケープ処理
    const escapeCsv = (str) => {
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    return [
      escapeCsv(result.link),
      escapeCsv(result.datetime),
      escapeCsv(result.companyName),
      escapeCsv(result.title)
    ].join(',');
  }).join('\n');

  const csvContent = csvHeader + csvData;

  try {
    fs.writeFileSync(CSV_OUTPUT_PATH, csvContent, 'utf8');
    console.log(`💾 CSVファイルを保存しました: ${CSV_OUTPUT_PATH}`);
    console.log(`📊 保存件数: ${results.length} 件`);
  } catch (error) {
    console.error('❌ CSVファイルの保存に失敗しました:', error);
  }
}

// スクリプト実行
if (require.main === module) {
  scrapePRTimesStep1()
    .then(() => {
      console.log('✅ Step1処理が完了しました！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Step1処理でエラーが発生しました:', error);
      process.exit(1);
    });
}

module.exports = { scrapePRTimesStep1 };