/**
 * 企業情報スクレイピング（Step2）
 *
 * 機能:
 * - Step1から受け取った企業データをスクレイピング
 * - DuckDuckGoで検索してホームページを特定
 * - 構造化データから正確に情報を抽出
 * - ブラウザを表示して挙動を確認可能
 */

const puppeteer = require('puppeteer');

// ========================================
// 設定
// ========================================
const CONFIG = {
  HEADLESS: false,       // ブラウザを表示
  WAIT_MIN: 1000,        // 最小待機時間（ミリ秒）
  WAIT_MAX: 3000,        // 最大待機時間（ミリ秒）
  TIMEOUT: 30000,        // ページタイムアウト（30秒）
  PARALLEL_BROWSERS: 10, // 並列実行するブラウザの数
};

// ログ出力用のロック
let logLock = Promise.resolve();

// 求人サイト・ポータルサイト・データベースサイトのドメイン（スキップ対象）
const SKIP_SITE_DOMAINS = [
  // 求人サイト
  'smarthr.jp',
  'wantedly.com',
  'indeed.com',
  'rikunabi.com',
  'mynavi.jp',
  'doda.jp',
  'townwork.net',
  'baitoru.com',
  'recruit.co.jp',
  // SNS
  'facebook.com',
  'twitter.com',
  'linkedin.com',
  // 企業データベース
  'houjin.jp',
  'houjin-bangou.nta.go.jp',
  'tsr-net.co.jp',
  'bizdb.jp',
  'kigyou-db.com',
];

/**
 * ランダム待機
 */
function sleep(min = CONFIG.WAIT_MIN, max = CONFIG.WAIT_MAX) {
  const ms = Math.random() * (max - min) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 下層ページかどうかを判定
 */
function isDeepPage(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // クエリパラメータがあるURLはスキップ
    if (urlObj.search) {
      return true;
    }

    // 許可するパスのみ
    const allowedPaths = [
      '/',
      '/about',
      '/index',
      '/index.html',
    ];

    // 完全一致のみOK、それ以外は全てスキップ
    return !allowedPaths.includes(pathname);

  } catch (error) {
    return true; // URLパースエラーは安全側に倒してスキップ
  }
}

/**
 * スキップ対象サイトかどうかを判定
 */
function isSkipSite(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    return SKIP_SITE_DOMAINS.some(domain => hostname.includes(domain));
  } catch (error) {
    return false;
  }
}

/**
 * DuckDuckGoで検索
 */
async function searchDuckDuckGo(page, query, log) {
  try {

    await page.goto('https://duckduckgo.com/', { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
    await sleep(500, 500);

    // 検索ボックスに入力
    await page.type('input[name="q"]', query, { delay: 50 });
    await sleep(500, 500);

    // 検索ボタンをクリック
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });

    // 検索結果のレンダリングを待つ（より長めの待機）
    await sleep(2000, 2000);

    // 検索結果のリンクを取得
    const results = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a[data-testid="result-title-a"]').forEach(a => {
        links.push(a.href);
      });
      return links;
    });

    log(`  📊 検索結果: ${results.length}件`);
    return results.slice(0, 3); // 上位3件のみ

  } catch (error) {
    log(`  ❌ 検索エラー: ${error.message}`);
    return [];
  }
}

/**
 * 構造化データから情報を抽出
 */
async function extractStructuredData(page, patterns) {
  return await page.evaluate((patterns) => {
    const results = [];

    // 1. テーブル構造から検索
    document.querySelectorAll('table tr').forEach(row => {
      const cells = Array.from(row.cells);
      if (cells.length >= 2) {
        const label = cells[0].innerText.trim();
        const value = cells[1].innerText.trim();

        if (patterns.some(pattern => label.includes(pattern))) {
          results.push({ source: 'table', label, value });
        }
      }
    });

    // 2. 定義リスト構造から検索
    document.querySelectorAll('dl').forEach(dl => {
      const dts = Array.from(dl.querySelectorAll('dt'));
      const dds = Array.from(dl.querySelectorAll('dd'));

      dts.forEach((dt, index) => {
        const label = dt.innerText.trim();
        const value = dds[index]?.innerText.trim();

        if (value && patterns.some(pattern => label.includes(pattern))) {
          results.push({ source: 'dl', label, value });
        }
      });
    });
    

    return results;
  }, patterns);
}

/**
 * 代表者名を抽出
 */
async function extractRepresentative(page, log) {
  const patterns = ['代表者', '代表取締役', '社長', 'CEO', '代表'];
  const results = await extractStructuredData(page, patterns);

  if (results.length === 0) return null;

  // テーブル構造を優先
  const best = results.find(r => r.source === 'table') || results[0];

  // 値をクリーニング
  let value = best.value;
  value = value.replace(/代表取締役|社長|CEO|代表者|代表/g, '').trim();
  value = value.split(/\n|　|\s{2,}/)[0].trim(); // 改行やスペースで区切られた最初の部分のみ

  log(`    ✓ 代表者名: ${value} (source: ${best.source})`);
  return value || null;
}

/**
 * 資本金を抽出
 */
async function extractCapital(page, log) {
  const patterns = ['資本金', 'capital'];
  const results = await extractStructuredData(page, patterns);

  if (results.length === 0) return null;

  const best = results.find(r => r.source === 'table') || results[0];

  // "1,000万円" を数値に変換
  const value = best.value;
  const match = value.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(百万|万|億)?円/);

  if (!match) return null;

  let amount = parseFloat(match[1].replace(/,/g, ''));
  const unit = match[2];

  if (unit === '億') {
    amount *= 100000000;
  } else if (unit === '百万') {
    amount *= 1000000;
  } else if (unit === '万') {
    amount *= 10000;
  }

  log(`    ✓ 資本金: ${amount}円 (source: ${best.source})`);
  return Math.floor(amount);
}

/**
 * 従業員数を抽出
 */
async function extractEmployees(page, log) {
  const patterns = ['従業員数', '社員数', 'employees', '従業員'];
  const results = await extractStructuredData(page, patterns);

  if (results.length === 0) return null;

  const best = results.find(r => r.source === 'table') || results[0];

  // "50名" を数値に変換
  const match = best.value.match(/(\d+(?:,\d{3})*)/);

  if (!match) return null;

  const employees = parseInt(match[1].replace(/,/g, ''));

  log(`    ✓ 従業員数: ${employees}名 (source: ${best.source})`);
  return employees;
}

/**
 * 業種の類似語マッピング（全体DBのindustry_1に対応）
 */
const INDUSTRY_KEYWORDS = {
  'IT': [
    'IT', 'ソフトウェア', 'システム開発', 'アプリ開発', 'Web開発', 'SaaS',
    'AI', 'DX', 'クラウド', 'エンジニア', 'プログラム', 'ICT', '情報技術',
    'インターネット', 'デジタル', 'IoT', 'ビッグデータ', 'セキュリティ'
  ],
  'ゲーム': [
    'ゲーム', 'ゲーム開発', 'ゲーム制作', 'ゲームアプリ', 'オンラインゲーム',
    'スマホゲーム', 'モバイルゲーム', 'ソーシャルゲーム', 'eスポーツ'
  ],
  'マスコミ': [
    'マスコミ', 'メディア', '放送', 'テレビ', 'ラジオ', '新聞', '出版',
    '雑誌', '報道', 'ニュース', 'ジャーナリズム', '編集'
  ],
  '化学': [
    '化学', '化学製品', '化学工業', '化成品', '試薬', '薬品', '化学メーカー',
    '樹脂', 'ファインケミカル', '石油化学', '有機化学', '無機化学'
  ],
  '教育': [
    '教育', '学習', '塾', 'スクール', '研修', 'トレーニング', 'eラーニング',
    '予備校', '学校', '大学', '専門学校', '語学', '資格', '人材育成'
  ],
  '広告': [
    '広告', '広告代理店', 'マーケティング', 'プロモーション', '宣伝', 'PR',
    'デザイン', 'クリエイティブ', 'イベント企画', 'ブランディング'
  ],
  '小売・販売': [
    '小売', '販売', '店舗', 'ショップ', 'リテール', 'EC', 'ネット販売',
    '通販', 'eコマース', '百貨店', 'スーパー', 'コンビニ'
  ],
  '生活用品': [
    '生活用品', '日用品', '家庭用品', '雑貨', 'ホームケア', 'トイレタリー',
    '文房具', 'インテリア', '家具', 'キッチン用品'
  ],
  '電気製品': [
    '電気製品', '家電', '電子機器', 'エレクトロニクス', 'AV機器', 'PC',
    'スマートフォン', 'IoT機器', '半導体', '電子部品'
  ],
  'エネルギー': [
    'エネルギー', '電力', 'ガス', '石油', '再生可能エネルギー', '太陽光',
    '風力', '電気', '燃料', '発電', '省エネ', 'バッテリー', '蓄電'
  ],
  'コンサル': [
    'コンサル', 'コンサルティング', '経営コンサル', '戦略コンサル',
    'ITコンサル', '業務改善', 'アドバイザリー', 'シンクタンク'
  ],
  '医療・製薬・福祉': [
    '医療', '製薬', '福祉', '介護', '病院', 'クリニック', '医薬品',
    'ヘルスケア', '看護', 'リハビリ', 'ケア', '医療機器', '治療'
  ],
  '外食': [
    '外食', '飲食', 'レストラン', 'カフェ', '居酒屋', 'ファストフード',
    '給食', 'ケータリング', '食堂', 'バー', 'フードサービス'
  ],
  '金融': [
    '金融', '銀行', '証券', '投資', '保険', 'ファイナンス', '資産運用',
    '融資', 'ローン', 'リース', 'クレジット', 'Fintech'
  ],
  '車・乗り物': [
    '車', '自動車', '乗り物', 'カーメーカー', '自動車部品', '二輪',
    'バイク', 'モビリティ', 'EV', '電気自動車', 'カーシェア'
  ],
  '食品': [
    '食品', '食品メーカー', '加工食品', '飲料', '製菓', '製パン',
    '調味料', '乳製品', '冷凍食品', '惣菜', '食材'
  ],
  '製造': [
    '製造', '製造業', '工場', '生産', 'メーカー', '加工', '組立',
    '製品', '機械製造', '設備製造', '金属加工', '精密機械'
  ],
  '美容・服飾': [
    '美容', '服飾', 'アパレル', 'ファッション', '化粧品', 'コスメ',
    'エステ', 'サロン', '衣料', 'テキスタイル', 'ビューティー'
  ],
  'エンタメ': [
    'エンタメ', 'エンターテイメント', '娯楽', 'レジャー', 'アミューズメント',
    '映画', '音楽', 'ライブ', 'イベント', 'テーマパーク', 'レクリエーション'
  ],
  'その他サービス': [
    'サービス', '支援', '代行', 'BPO', 'アウトソーシング', 'シェアリング',
    'プラットフォーム', 'マッチング', '清掃', '警備', '設備管理'
  ],
  '運送・物流・輸送': [
    '運送', '物流', '輸送', '配送', '倉庫', 'ロジスティクス', '宅配',
    '配達', '貨物', 'トラック', '航空', '海運', '鉄道', '3PL'
  ],
  '機械系': [
    '機械', '産業機械', '工作機械', '建設機械', '農業機械', 'ロボット',
    '自動機', '装置', '設備機器', '重機', 'FA'
  ],
  '建設・工事・土木': [
    '建設', '工事', '土木', '建築', '施工', 'ゼネコン', '工務店',
    'リフォーム', 'リノベーション', '設計', 'インフラ', '造園'
  ],
  '商社': [
    '商社', '総合商社', '専門商社', '貿易', '卸売', '輸入', '輸出',
    '商品取引', '物販', 'トレーディング', '流通'
  ],
  '人材': [
    '人材', '人材紹介', '人材派遣', '転職', '求人', 'リクルート',
    '採用支援', 'HR', 'ヘッドハンティング', '就職支援'
  ],
  '通信・PC': [
    '通信', 'PC', 'ネットワーク', '電気通信', 'キャリア', 'ISP',
    '携帯電話', '固定電話', 'データ通信', '5G', 'パソコン', 'IT機器'
  ],
  '不動産': [
    '不動産', '不動産業', '住宅', 'マンション', 'ビル', '賃貸', '仲介',
    '売買', '不動産開発', 'デベロッパー', '不動産管理', 'REIT'
  ],
  'その他業界': []
};

/**
 * テキストから業種を判定
 */
function matchIndustry(text, source, log) {
  const matches = [];

  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    let matchCount = 0;
    const matchedKeywords = [];

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        matchCount++;
        matchedKeywords.push(keyword);
      }
    }

    if (matchCount > 0) {
      matches.push({
        industry,
        matchCount,
        matchedKeywords,
      });
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // マッチ数が最も多い業種を選択
  matches.sort((a, b) => b.matchCount - a.matchCount);
  const bestMatch = matches[0];

  log(`    ✓ 業種: ${bestMatch.industry} (source: ${source}, マッチ: ${bestMatch.matchCount}件, キーワード: ${bestMatch.matchedKeywords.slice(0, 3).join(', ')}...)`);
  return bestMatch.industry;
}

/**
 * 業種を抽出（2段階チェック）
 */
async function extractBusinessType(page, log) {
  try {
    // Step1: meta descriptionとタイトルから判定
    const metaData = await page.evaluate(() => {
      const metaDesc = document.querySelector('meta[name="description"]');
      const title = document.title;

      return {
        metaDescription: metaDesc ? metaDesc.content : '',
        title: title || '',
      };
    });

    const metaText = `${metaData.title} ${metaData.metaDescription}`;

    if (metaText.trim()) {
      const industry = matchIndustry(metaText, 'meta', log);
      if (industry) {
        return industry;
      }
    }

    log(`    ℹ️  metaディスクリプションでは判定できませんでした`);

    // Step2: ページテキストから判定
    log(`    🔍 ページテキストを確認中...`);

    const bodyText = await page.evaluate(() => {
      return document.body.innerText.substring(0, 5000); // 最初の5000文字
    });

    if (bodyText.trim()) {
      const industry = matchIndustry(bodyText, 'page-text', log);
      if (industry) {
        return industry;
      }
    }

    // どちらでも判定できない場合
    log(`    ⚠️ 業種: 判定できませんでした → その他業界`);
    return 'その他業界';

  } catch (error) {
    log(`    ❌ 業種抽出エラー: ${error.message}`);
    return 'その他業界';
  }
}

/**
 * 特定のページを探して遷移
 */
async function findSpecificPage(page, pageType, log) {
  try {
    let textPatterns, pathPatterns;

    if (pageType === 'company') {
      textPatterns = [
        '会社概要', '企業概要', '会社情報', '企業情報',
        'about us', 'about', 'company', '概要', 'profile'
      ];
      pathPatterns = [
        '/company', '/about', '/profile', '/overview',
        '/corporate', '/info', '/gaiyou'
      ];
    } else if (pageType === 'privacy') {
      textPatterns = [
        'プライバシーポリシー', '個人情報保護方針', 'privacy policy',
        'privacy', 'プライバシー'
      ];
      pathPatterns = [
        '/privacy', '/policy', '/privacypolicy'
      ];
    }

    const targetPageUrl = await page.evaluate((textPatterns, pathPatterns) => {
      const links = Array.from(document.querySelectorAll('a'));

      for (const link of links) {
        const text = link.innerText.toLowerCase().trim();
        const href = link.href.toLowerCase();

        // テキストマッチング
        for (const pattern of textPatterns) {
          if (text.includes(pattern.toLowerCase())) {
            return link.href;
          }
        }

        // パスマッチング
        for (const pattern of pathPatterns) {
          if (href.includes(pattern)) {
            return link.href;
          }
        }
      }

      return null;
    }, textPatterns, pathPatterns);

    if (targetPageUrl) {
      const pageName = pageType === 'company' ? '会社概要' : 'プライバシーポリシー';
      log(`    🔍 ${pageName}ページを発見: ${targetPageUrl}`);
      await page.goto(targetPageUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
      await sleep(3000, 3000); // DOMレンダリング完了を待つ（3秒）
      return true;
    }

    return false;
  } catch (error) {
    const pageName = pageType === 'company' ? '会社概要' : 'プライバシーポリシー';
    log(`    ⚠️ ${pageName}ページ遷移エラー: ${error.message}`);
    return false;
  }
}

/**
 * 会社概要ページを探して遷移（後方互換性のため）
 */
async function findCompanyInfoPage(page, log) {
  return await findSpecificPage(page, 'company', log);
}

/**
 * 住所がページ内に含まれているかチェック
 */
async function checkAddressMatch(page, company, log) {
  try {
    const prefecture = company.prefecture;

    // まず[市区町村]で抽出を試みる
    let cityMatch = company.address_1.match(/^(.{2,5}?[市区町村])/);
    // 失敗したら、数字が出るまでの文字列を使う（最大5文字）
    if (!cityMatch) {
      cityMatch = company.address_1.match(/^([^\d]{2,5})/);
    }
    const city = cityMatch ? cityMatch[1] : '';

    // まず現在のページで住所確認
    let pageText = await page.evaluate(() => document.body.innerText);
    let hasPrefecture = pageText.includes(prefecture);
    let hasCity = city && pageText.includes(city);

    // デバッグログ: 取得したテキストの一部を表示
    log(`    🔍 デバッグ: 検索対象 - 都道府県: "${prefecture}", 市区町村: "${city}"`);
    log(`    🔍 デバッグ: ページテキスト（最初の300文字）: "${pageText.substring(0, 300)}"`);
    log(`    🔍 デバッグ: 都道府県一致: ${hasPrefecture}, 市区町村一致: ${hasCity}`);

    // 市区町村があればそれで判定、なければ都道府県で判定
    if ((city && hasCity) || (!city && hasPrefecture)) {
      log(`    ✓ 住所確認: 現在のページで一致`);
      return true;
    }

    // 見つからない場合、会社概要ページを探す
    log(`    ℹ️  現在のページに住所なし → 会社概要ページを探索`);
    const foundCompany = await findSpecificPage(page, 'company', log);

    if (foundCompany) {
      // 会社概要ページで再度確認
      pageText = await page.evaluate(() => document.body.innerText);
      hasPrefecture = pageText.includes(prefecture);
      hasCity = city && pageText.includes(city);

      // 市区町村があればそれで判定、なければ都道府県で判定
      if ((city && hasCity) || (!city && hasPrefecture)) {
        log(`    ✓ 住所確認: 会社概要ページで一致`);
        return true;
      }
      log(`    ℹ️  会社概要ページでも住所なし → プライバシーポリシーを探索`);
    } else {
      log(`    ℹ️  会社概要ページが見つからない → プライバシーポリシーを探索`);
    }

    // プライバシーポリシーページを探す
    const foundPrivacy = await findSpecificPage(page, 'privacy', log);

    if (!foundPrivacy) {
      log(`    ⚠️ プライバシーポリシーページも見つかりません`);
      return false;
    }

    // プライバシーポリシーページで再度確認
    pageText = await page.evaluate(() => document.body.innerText);
    hasPrefecture = pageText.includes(prefecture);
    hasCity = city && pageText.includes(city);

    // 市区町村があればそれで判定、なければ都道府県で判定
    if ((city && hasCity) || (!city && hasPrefecture)) {
      log(`    ✓ 住所確認: プライバシーポリシーページで一致`);
      return true;
    }

    log(`    ✗ 住所確認: 全てのページで不一致`);
    return false;

  } catch (error) {
    log(`    ❌ 住所確認エラー: ${error.message}`);
    return false;
  }
}

/**
 * 1社の情報をスクレイピング
 */
async function scrapeCompany(browser, company, globalIndex, totalCompanies, batchIndex) {
  // ログをバッファに溜める
  const logs = [];

  // カスタムログ関数（console.logは上書きしない）
  const log = (...args) => logs.push(args.join(' '));

  try {
    const batchLabel = batchIndex !== undefined ? `[Browser ${batchIndex + 1}] ` : '';
    log(`\n${batchLabel}[${globalIndex + 1}/${totalCompanies}] ${company.company_name}`);
    log(`  📍 ${company.prefecture} ${company.address_1}`);

    const page = await browser.newPage();

    try {
      // User-Agentを設定
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

      // 検索クエリ（住所全部）
      const query = `${company.company_name} ${company.prefecture}${company.address_1}`;

      // DuckDuckGoで検索
      const searchResults = await searchDuckDuckGo(page, query, log);

      if (searchResults.length === 0) {
        log(`  ⚠️ 検索結果が0件でした`);
        return company;
      }

    // 上位3件をチェック
    for (const url of searchResults) {
      log(`\n  🌐 チェック中: ${url}`);

      // 下層ページまたは求人サイトはスキップ
      if (isDeepPage(url)) {
        log(`  ⏭️  スキップ: 下層ページ`);
        continue;
      }

      if (isSkipSite(url)) {
        log(`  ⏭️  スキップ: 求人・DBサイト`);
        continue;
      }

      // ページを開く
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
        await sleep(3000, 3000); // DOMレンダリング完了を待つ（3秒）
      } catch (error) {
        log(`  ❌ ページ読み込みエラー: ${error.message}`);
        continue;
      }

      // 住所マッチング
      const addressMatch = await checkAddressMatch(page, company, log);
      if (!addressMatch) {
        log(`  ⏭️  スキップ: 住所不一致`);
        continue;
      }

      log(`  ✅ ホームページを発見！`);

      // データ抽出前に会社概要ページへ移動
      log(`  🔍 会社概要ページでデータ抽出を試みます...`);
      const foundCompanyPage = await findCompanyInfoPage(page, log);

      if (!foundCompanyPage) {
        log(`  ⚠️ 会社概要ページが見つからないため、現在のページで抽出します`);
      }

      // データを抽出
      company.company_website = url;

      const representative = await extractRepresentative(page, log);
      if (representative) company.representative = representative;

      const capital = await extractCapital(page, log);
      if (capital) company.capital_amount = capital;

      const employees = await extractEmployees(page, log);
      if (employees) company.employees = employees;

      const businessType = await extractBusinessType(page, log);
      if (businessType) company.business_type = businessType;

      break; // 見つかったので次の会社へ
    }

      if (!company.company_website) {
        log(`  ⚠️ ホームページが見つかりませんでした`);
      }

    } catch (error) {
      log(`  ❌ スクレイピングエラー: ${error.message}`);
    } finally {
      await page.close();
    }

  } finally {
    // ロックを取得してログを出力
    await logLock;
    logLock = new Promise(resolve => {
      console.log(logs.join('\n'));
      resolve();
    });
  }

  return company;
}

/**
 * 1つのバッチを処理
 */
async function processBatch(batch, batchIndex, startIndex, totalCompanies) {
  try {
    console.log(`\n🚀 Browser ${batchIndex + 1} 起動中... (${batch.length}件を処理)`);

    const browser = await puppeteer.launch({
      headless: CONFIG.HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1000,800',  // ウィンドウサイズを小さく設定
        '--no-first-run',           // 初回実行ページを表示しない
        '--disable-default-apps'    // デフォルトアプリを無効化
      ],
      defaultViewport: {
        width: 1000,
        height: 800
      }
    });

    const results = [];

    for (let i = 0; i < batch.length; i++) {
      const company = batch[i];
      const globalIndex = startIndex + i; // 全体の通し番号
      const scrapedCompany = await scrapeCompany(browser, { ...company }, globalIndex, totalCompanies, batchIndex);
      results.push(scrapedCompany);
    }

    await browser.close();

    return results;

  } catch (error) {
    console.error(`\n❌ Browser ${batchIndex + 1} エラー:`, error.message);
    return batch; // エラー時は元のデータを返す
  }
}

/**
 * Step2メイン処理
 */
async function scrapeCompanies(companies) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌐 Step2: 企業情報スクレイピング');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📊 対象件数: ${companies.length}件`);
  console.log(`⚙️  ブラウザ表示: ${CONFIG.HEADLESS ? 'なし' : 'あり'}`);
  console.log(`🔢 並列ブラウザ数: ${CONFIG.PARALLEL_BROWSERS}\n`);

  // データをバッチに分割
  const batches = [];
  const batchStarts = []; // 各バッチの開始インデックス
  const batchSize = Math.ceil(companies.length / CONFIG.PARALLEL_BROWSERS);

  for (let i = 0; i < CONFIG.PARALLEL_BROWSERS; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, companies.length);
    if (start < companies.length) {
      batches.push(companies.slice(start, end));
      batchStarts.push(start);
    }
  }

  console.log(`📦 ${batches.length}個のバッチに分割 (各バッチ約${batchSize}件)\n`);

  // 全バッチを並列実行
  const allResults = await Promise.all(
    batches.map((batch, index) => processBatch(batch, index, batchStarts[index], companies.length))
  );

  // 結果を統合
  const results = allResults.flat();

  // 統計情報
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Step2完了');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const foundCount = results.filter(c => c.company_website).length;
  console.log(`✅ ホームページ発見: ${foundCount}/${results.length}件`);

  const representativeCount = results.filter(c => c.representative).length;
  console.log(`✅ 代表者名取得: ${representativeCount}/${results.length}件`);

  const capitalCount = results.filter(c => c.capital_amount).length;
  console.log(`✅ 資本金取得: ${capitalCount}/${results.length}件`);

  const employeesCount = results.filter(c => c.employees).length;
  console.log(`✅ 従業員数取得: ${employeesCount}/${results.length}件\n`);

  return results;
}

/**
 * メイン処理（単独実行時のみ）
 */
async function main() {
  // テストデータ
  const testCompanies = [
    {
      company_name: 'ＥＧアセット株式会社',
      company_website: null,
      representative: null,
      address_1: '港区元赤坂１丁目１番７－１２０９号株式会社赤坂国際会計内',
      address_2: null,
      prefecture: '東京都',
      employees: null,
      capital_amount: null,
      established_year: 2015,
      established_month: 10,
      listing_status: null,
      business_type: null,
      industry_1: null,
    },
  ];

  const results = await scrapeCompanies(testCompanies);
  console.log('\n📦 結果:');
  console.log(JSON.stringify(results, null, 2));
}

// スクリプト実行
if (require.main === module) {
  main();
}

module.exports = {
  scrapeCompanies,
};
