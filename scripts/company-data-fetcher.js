const axios = require('axios')
const cheerio = require('cheerio')
const { Pool } = require('pg')

// データベース接続
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'company_db',
  password: 'password',
  port: 5432,
})

// 法人番号API設定
const HOUJIN_API_ID = 'KtLKHsYJGaNRT' // あなたのAPIキー
const HOUJIN_API_BASE_URL = 'https://api.houjin-bangou.nta.go.jp/4'

// Google Custom Search API設定（要設定）
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'YOUR_GOOGLE_API_KEY'
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID || 'YOUR_SEARCH_ENGINE_ID'

// 除外ドメイン
const EXCLUDE_DOMAINS = [
  'salesnow.jp', 'alermbox.com', 'baseconnect.in', 'musubu.in',
  'indeed.com', 'rikunabi.com', 'mynavi.jp', 'doda.jp', 'en-japan.com',
  'wantedly.com', 'openwork.jp', 'vorkers.com', 'gyosei.co.jp',
  'facebook.com', 'twitter.com', 'linkedin.com', 'wikipedia.org',
  'recruit.co.jp', 'jobcan.ne.jp', 'bizreach.jp'
]

// 企業判定キーワード
const COMPANY_INDICATORS = [
  '会社概要', '企業情報', '所在地', '代表取締役', '設立', 'アクセス',
  '本社', '事業内容', '沿革', '組織図', 'プライバシーポリシー'
]

// 30業種分類
const INDUSTRY_KEYWORDS = {
  '食品・飲料・たばこ製造業': ['食品', '飲料', 'たばこ', '製菓', '乳製品', '調味料', 'パン', '肉', '魚', '農産物'],
  '繊維・アパレル製造業': ['繊維', 'アパレル', '衣料', '服飾', 'ファッション', '糸', '布', '縫製', 'テキスタイル'],
  '化学・石油・ゴム製造業': ['化学', '石油', 'ゴム', 'プラスチック', '合成樹脂', '塗料', '接着剤', '化成品'],
  '医薬品・化粧品製造業': ['医薬品', '化粧品', 'ヘルスケア', '薬品', 'バイオ', '治療薬', 'スキンケア'],
  '鉄鋼・非鉄金属製造業': ['鉄鋼', '金属', 'アルミ', '銅', '鋼材', '合金', '製鋼'],
  '機械・設備製造業': ['機械', '設備', '産業機械', '工作機械', '建設機械', '農業機械'],
  '電子・電気機器製造業': ['電子', '電気機器', '半導体', '電子部品', '家電', 'LED', 'センサー'],
  '輸送用機器製造業': ['自動車', '航空機', '船舶', '鉄道車両', '部品', 'エンジン'],
  'ソフトウェア・IT開発業': ['ソフトウェア', 'IT', 'システム開発', 'アプリ開発', 'プログラム'],
  '情報処理・データセンター業': ['情報処理', 'データセンター', 'クラウド', 'サーバー', 'インフラ'],
  'インターネット・Web関連業': ['インターネット', 'Web', 'ECサイト', 'オンライン', 'デジタル'],
  '通信・放送業': ['通信', '放送', 'テレビ', 'ラジオ', '電話', '携帯'],
  '総合商社': ['総合商社', '商社', '貿易', '輸出入'],
  '専門商社': ['専門商社', '卸売', '流通'],
  '小売業': ['小売', '販売', '店舗', 'ショップ', 'ストア'],
  '電子商取引業': ['EC', '通販', 'オンラインショップ', 'eコマース'],
  '銀行・証券・保険業': ['銀行', '証券', '保険', '金融', '投資', '資産運用'],
  '不動産業': ['不動産', '物件', '賃貸', '売買', 'マンション', 'ビル'],
  '建設・土木業': ['建設', '土木', '建築', '工事', '施工', 'ゼネコン'],
  '運輸・物流業': ['運輸', '物流', '配送', '輸送', '宅配', 'トラック'],
  '旅行・宿泊・娯楽業': ['旅行', 'ホテル', '宿泊', '観光', 'レジャー', '娯楽'],
  '飲食・フードサービス業': ['飲食', 'レストラン', 'カフェ', '居酒屋', '食事'],
  '教育・研修業': ['教育', '研修', '学校', '塾', 'スクール', 'セミナー'],
  '医療・介護・福祉業': ['医療', '介護', '福祉', '病院', 'クリニック', 'ケア'],
  '法律・会計・コンサルティング業': ['法律', '会計', 'コンサルティング', '税理士', '弁護士', 'アドバイザリー'],
  '人材・派遣業': ['人材', '派遣', '転職', '求人', '採用', 'HR'],
  '広告・マーケティング業': ['広告', 'マーケティング', 'PR', '宣伝', 'デザイン'],
  '電力・ガス・水道業': ['電力', 'ガス', '水道', '電気', 'エネルギー', 'インフラ'],
  '官公庁・団体': ['官公庁', '団体', '協会', '組合', '財団'],
  'その他・複合業種': ['その他', '複合', '多角経営', 'グループ']
}

// 住所正規化
function normalizeAddress(address) {
  if (!address) return ''
  
  return address
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/[ａ-ｚＡ-Ｚ]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/[‐－―−]/g, '-')
    .replace(/\s+/g, '')
    .trim()
}

// 法人番号APIから企業データ取得
async function fetchCorporateData(date) {
  try {
    const url = `${HOUJIN_API_BASE_URL}/diff?id=${HOUJIN_API_ID}&from=${date}&to=${date}&type=01`
    console.log(`🔍 法人番号API呼び出し: ${url}`)
    
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'Accept': 'application/json'
      }
    })
    
    console.log(`✅ API応答: ${response.status} - ${response.data?.corporations?.length || 0}件取得`)
    return response.data.corporations || []
    
  } catch (error) {
    console.error('❌ 法人番号API呼び出しエラー:', error.message)
    throw error
  }
}

// Google検索APIでホームページ検索
async function searchCompanyWebsite(companyName, address) {
  try {
    const query = `"${companyName}" "${address.split(' ')[0]}" 会社概要`
    const url = `https://www.googleapis.com/customsearch/v1`
    
    const response = await axios.get(url, {
      params: {
        key: GOOGLE_API_KEY,
        cx: GOOGLE_SEARCH_ENGINE_ID,
        q: query,
        num: 10,
        lr: 'lang_ja',
        cr: 'countryJP'
      },
      timeout: 10000
    })
    
    const items = response.data.items || []
    console.log(`🔍 "${companyName}" の検索結果: ${items.length}件`)
    
    return items
    
  } catch (error) {
    console.error(`❌ Google検索エラー (${companyName}):`, error.message)
    return []
  }
}

// ページ内容取得とスコアリング
async function verifyCompanyWebsite(url, companyName, address) {
  try {
    console.log(`📄 ページ検証中: ${url}`)
    
    // ドメインチェック
    const domain = new URL(url).hostname.toLowerCase()
    if (EXCLUDE_DOMAINS.some(exclude => domain.includes(exclude))) {
      console.log(`❌ 除外ドメイン: ${domain}`)
      return { score: 0, reason: '除外ドメイン' }
    }
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    const $ = cheerio.load(response.data)
    const pageText = $('body').text().toLowerCase()
    
    let score = 0
    const reasons = []
    
    // 企業名マッチング
    if (pageText.includes(companyName.toLowerCase())) {
      score += 30
      reasons.push('企業名一致')
    }
    
    // 住所マッチング
    const normalizedAddress = normalizeAddress(address)
    const addressParts = normalizedAddress.split(/[市区町村]/)
    if (addressParts.length > 1) {
      const cityPart = addressParts[0] + addressParts[1].split('')[0]
      if (pageText.includes(cityPart.toLowerCase())) {
        score += 40
        reasons.push('住所部分一致')
      }
    }
    
    // 企業関連キーワード
    const foundKeywords = COMPANY_INDICATORS.filter(keyword => 
      pageText.includes(keyword.toLowerCase())
    )
    score += foundKeywords.length * 5
    if (foundKeywords.length > 0) {
      reasons.push(`企業キーワード: ${foundKeywords.length}個`)
    }
    
    console.log(`📊 スコア: ${score} - ${reasons.join(', ')}`)
    
    return { 
      score, 
      reasons: reasons.join(', '),
      foundKeywords,
      pageTitle: $('title').text().trim()
    }
    
  } catch (error) {
    console.log(`❌ ページ検証エラー: ${error.message}`)
    return { score: 0, reason: 'アクセスエラー' }
  }
}

// 業種自動判定
function detectIndustry(companyName, businessDescription = '') {
  const text = `${companyName} ${businessDescription}`.toLowerCase()
  
  let bestMatch = 'その他・複合業種'
  let bestScore = 0
  
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    const matchCount = keywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    ).length
    
    if (matchCount > bestScore) {
      bestScore = matchCount
      bestMatch = industry
    }
  }
  
  return { industry: bestMatch, confidence: bestScore }
}

// メイン処理
async function processCorporateData(date, limit = 50) {
  console.log(`🚀 企業データ処理開始 (日付: ${date}, 上限: ${limit}件)`)
  
  try {
    // 法人番号APIから企業データ取得
    const corporations = await fetchCorporateData(date)
    
    if (corporations.length === 0) {
      console.log('📭 該当する企業データがありません')
      return
    }
    
    console.log(`📝 処理対象: ${Math.min(corporations.length, limit)}件`)
    const client = await pool.connect()
    
    try {
      let processedCount = 0
      let successCount = 0
      
      for (const corp of corporations.slice(0, limit)) {
        processedCount++
        
        const companyName = corp.name || corp.company_name || ''
        const address = corp.location || corp.address || ''
        
        if (!companyName || !address) {
          console.log(`⚠️  不完全データをスキップ: ${companyName || '名前なし'}`)
          continue
        }
        
        console.log(`\n[${processedCount}/${Math.min(corporations.length, limit)}] 処理中: ${companyName}`)
        
        // Google検索でホームページ検索
        const searchResults = await searchCompanyWebsite(companyName, address)
        
        let bestWebsite = null
        let bestScore = 0
        
        // 検索結果を検証
        for (const result of searchResults.slice(0, 5)) {
          const verification = await verifyCompanyWebsite(result.link, companyName, address)
          
          if (verification.score > bestScore) {
            bestScore = verification.score
            bestWebsite = {
              url: result.link,
              title: result.title,
              score: verification.score,
              reasons: verification.reasons
            }
          }
          
          // レート制限対策
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
        // 業種自動判定
        const industryDetection = detectIndustry(companyName, corp.business_description)
        
        // データベースに保存（スコアが一定以上の場合）
        if (bestScore >= 30) {
          try {
            await client.query(`
              INSERT INTO companies (
                company_name, established_date, postal_code, address, 
                industry, website, verification_score, verification_status,
                houjin_bangou, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
              ON CONFLICT (company_name, address) DO UPDATE SET
                website = EXCLUDED.website,
                verification_score = EXCLUDED.verification_score,
                updated_at = NOW()
            `, [
              companyName,
              corp.established_date || '1900-01-01',
              corp.postal_code || '',
              address,
              industryDetection.industry,
              bestWebsite?.url || null,
              bestScore,
              bestScore >= 70 ? 'verified' : 'needs_review',
              corp.corporate_number || corp.houjin_bangou || ''
            ])
            
            successCount++
            console.log(`✅ 保存完了: ${companyName} (スコア: ${bestScore})`)
            
          } catch (dbError) {
            console.error(`❌ DB保存エラー: ${dbError.message}`)
          }
          
        } else {
          console.log(`⚠️  低スコアによりスキップ: ${companyName} (スコア: ${bestScore})`)
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      console.log(`\n🎉 処理完了: ${successCount}/${processedCount} 件保存`)
      
    } finally {
      client.release()
    }
    
  } catch (error) {
    console.error('❌ 処理エラー:', error)
  } finally {
    await pool.end()
  }
}

// 実行
if (require.main === module) {
  const date = process.argv[2] || '2024-01-01'
  const limit = parseInt(process.argv[3]) || 10
  
  console.log('📋 企業データ取得システム')
  console.log('使用方法: node company-data-fetcher.js [日付] [件数制限]')
  console.log(`実行パラメータ: 日付=${date}, 件数制限=${limit}`)
  console.log('')
  
  processCorporateData(date, limit)
}

module.exports = { processCorporateData }