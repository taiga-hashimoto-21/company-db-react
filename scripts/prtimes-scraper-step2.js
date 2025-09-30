const puppeteer = require('puppeteer');

async function scrapePRTimesStep2(step1Results) {
  console.log('🚀 PRタイムズ Step2 スクレイピング開始...');
  console.log(`📊 処理対象: ${step1Results.length}件`);

  let browser;
  const results = [];

  try {
    // Puppeteerブラウザを起動
    const launchOptions = {
      headless: 'new', // ヘッドレスモード（本番環境用）
      slowMo: 50,
      args: [
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    };

    // GitHub ActionsなどでChromiumのパスを指定する場合
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1200, height: 800 });

    // 各記事の詳細ページを訪問
    for (let i = 0; i < step1Results.length; i++) {
      const article = step1Results[i];
      console.log(`\n📝 処理中: ${i + 1}/${step1Results.length}`);

      try {
        const deliveryDate = article.datetime || '';
        const pressReleaseUrl = article.link || '';
        const pressReleaseTitle = article.title || '';

        if (!pressReleaseUrl) {
          console.log('⚠️  URLが空のため、スキップします');
          // 空のデータ行を追加
          results.push({
            deliveryDate,
            pressReleaseUrl,
            pressReleaseTitle,
            type: '', category1: '', category2: '', companyName: '',
            companyUrl: '-', industry: '', address: '', phone: '',
            representative: '', listingStatus: '', capital: '', established: '',
            capitalNumeric: '-', year: '-', month: '-'
          });
          continue;
        }

        console.log(`🔗 URL: ${pressReleaseUrl}`);

        // 詳細ページにアクセス
        await page.goto(pressReleaseUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // ページから詳細情報を抽出
        const details = await extractDetailsFromPage(page);

        // 資本金・設立日から数値を抽出
        const capitalNumeric = extractCapitalNumeric(details.capital);
        const { year, month } = extractEstablishedYearMonth(details.established);

        // データオブジェクトを構築
        results.push({
          deliveryDate,                      // 1: 配信日時
          pressReleaseUrl,                   // 2: プレスリリースURL
          pressReleaseTitle,                 // 3: プレスリリースタイトル
          type: details.type || '',          // 4: プレスリリース種類
          category1: details.category1 || '',// 5: プレスリリースカテゴリ1
          category2: details.category2 || '',// 6: プレスリリースカテゴリ2
          companyName: details.companyName || '', // 7: 会社名
          companyUrl: details.companyUrl || '-',  // 8: 会社URL（空欄の場合は"-"）
          industry: details.industry || '',       // 9: 業種
          address: details.address || '',         // 10: 住所
          phone: details.phone || '',             // 11: 電話番号
          representative: details.representative || '', // 12: 代表者
          listingStatus: details.listingStatus || '',   // 13: 上場区分
          capital: details.capital || '',               // 14: 資本金
          established: details.established || '',       // 15: 設立日
          capitalNumeric,                               // 16: 資本金（万円）
          year,                                         // 17: 設立年
          month                                         // 18: 設立月
        });

        console.log(`✅ 完了: ${details.companyName || '(会社名なし)'}`);

        // レート制限対策（1秒待機）
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ エラーが発生しました: ${error.message}`);
        // エラーが発生しても、基本情報だけ保持して続行
        results.push({
          deliveryDate: article.datetime || '',
          pressReleaseUrl: article.link || '',
          pressReleaseTitle: article.title || '',
          type: '', category1: '', category2: '', companyName: '',
          companyUrl: '-', industry: '', address: '', phone: '',
          representative: '', listingStatus: '', capital: '', established: '',
          capitalNumeric: '-', year: '-', month: '-'
        });
      }
    }

    console.log(`\n✅ Step2処理完了: ${results.length}件`);

    // データ配列を返す（CSVファイルには保存しない）
    return results;

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ページから詳細情報を抽出する関数
async function extractDetailsFromPage(page) {
  return await page.evaluate(() => {
    const details = {
      type: '',
      category1: '',
      category2: '',
      companyName: '',
      companyUrl: '',
      industry: '',
      address: '',
      phone: '',
      representative: '',
      listingStatus: '',
      capital: '',
      established: ''
    };

    // dtタグとddタグのペアを取得する共通関数
    const getValueByDt = (dtText) => {
      const dtElements = document.querySelectorAll('dt');
      for (let dt of dtElements) {
        if (dt.textContent.trim() === dtText) {
          const dd = dt.nextElementSibling;
          if (dd && dd.tagName === 'DD') {
            return dd.textContent.trim();
          }
        }
      }
      return '';
    };

    // dtタグの次のdd内のaタグを取得
    const getLinkByDt = (dtText) => {
      const dtElements = document.querySelectorAll('dt');
      for (let dt of dtElements) {
        if (dt.textContent.trim() === dtText) {
          const dd = dt.nextElementSibling;
          if (dd && dd.tagName === 'DD') {
            const a = dd.querySelector('a');
            if (a) {
              return a.textContent.trim();
            }
          }
        }
      }
      return '';
    };

    // 1. プレスリリース種類
    const dtElements = document.querySelectorAll('dt');
    for (let dt of dtElements) {
      if (dt.textContent.trim() === '種類') {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          const a = dd.querySelector('span a');
          if (a) {
            details.type = a.textContent.trim();
          }
        }
        break;
      }
    }

    // 2. ビジネスカテゴリ1, 2
    for (let dt of dtElements) {
      if (dt.textContent.trim() === 'ビジネスカテゴリ') {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          const spans = dd.querySelectorAll('span');
          if (spans.length === 0) {
            details.category1 = 'None';
            details.category2 = 'None';
          } else if (spans.length === 1) {
            const a1 = spans[0].querySelector('a');
            details.category1 = a1 ? a1.textContent.trim() : 'None';
            details.category2 = 'None';
          } else if (spans.length >= 2) {
            const a1 = spans[0].querySelector('a');
            const a2 = spans[1].querySelector('a');
            details.category1 = a1 ? a1.textContent.trim() : 'None';
            details.category2 = a2 ? a2.textContent.trim() : 'None';
          }
        }
        break;
      }
    }

    // 3. 会社名
    const companyNameElement = document.querySelector('a.company-name_companyName__xoNVA, a[class*="companyName"]');
    if (companyNameElement) {
      details.companyName = companyNameElement.textContent.trim();
    }

    // 4. 会社URL
    details.companyUrl = getLinkByDt('URL');

    // 5. 業種
    details.industry = getValueByDt('業種');

    // 6. 本社所在地
    details.address = getValueByDt('本社所在地');

    // 7. 電話番号
    details.phone = getValueByDt('電話番号');

    // 8. 代表者名
    details.representative = getValueByDt('代表者名');

    // 9. 上場
    details.listingStatus = getValueByDt('上場');

    // 10. 資本金
    details.capital = getValueByDt('資本金');

    // 11. 設立
    details.established = getValueByDt('設立');

    return details;
  });
}

// 資本金から数値を抽出（万円を除く）
function extractCapitalNumeric(capitalText) {
  if (!capitalText || capitalText === '-' || capitalText.trim() === '') {
    return '-';
  }

  // 「1000万円」→「1000」
  const match = capitalText.match(/(\d+(?:,\d+)?)/);
  if (match) {
    return match[1].replace(/,/g, ''); // カンマを除去
  }

  return '-';
}

// 設立日から年月を抽出
function extractEstablishedYearMonth(establishedText) {
  if (!establishedText || establishedText === '-' || establishedText.trim() === '') {
    return { year: '-', month: '-' };
  }

  // 「2016年08月」のパターン
  const match = establishedText.match(/(\d{4})年(\d{1,2})月/);
  if (match) {
    return {
      year: match[1],
      month: String(parseInt(match[2], 10)) // ゼロ埋めを除去
    };
  }

  return { year: '-', month: '-' };
}

module.exports = { scrapePRTimesStep2 };