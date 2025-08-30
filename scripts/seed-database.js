#!/usr/bin/env node

const { Pool } = require('pg')

// PostgreSQL接続設定
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'company_db',
  password: process.env.POSTGRES_PASSWORD || 'password',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
})

// 1200万社データ生成用のマスターデータ
const industries = [
  'IT・通信', '製造業', '商社・流通', '金融・保険', '不動産・建設',
  'サービス業', '医療・介護', '教育', '運輸・物流', '食品・飲料',
  'エネルギー', 'その他'
]

const prefectures = [
  '東京都', '大阪府', '神奈川県', '愛知県', '埼玉県', '千葉県', '兵庫県',
  '北海道', '福岡県', '静岡県', '茨城県', '広島県', '京都府', '新潟県',
  '宮城県', '長野県', '岐阜県', '栃木県', '群馬県', '岡山県', '熊本県',
  '鹿児島県', '沖縄県', '青森県', '岩手県', '山形県', '福島県', '石川県'
]

const companyTypes = ['株式会社', '有限会社', '合同会社', '合資会社']

const businessNames = [
  'テクノロジー', 'イノベーション', 'ソリューション', 'システム', 'コンサルティング',
  '製作所', '工業', '商事', '物産', 'トレーディング', '建設', '不動産', '開発',
  'サービス', 'ホールディングス', 'グループ', 'エンタープライズ', 'ビジネス',
  'マネジメント', 'オペレーション', 'プロダクション', 'クリエイティブ', 'デザイン',
  'マーケティング', 'アドバンス', 'プレミアム', 'スタンダード', 'エクセレント'
]

// ランダム日付生成（1950-2024年）
function getRandomDate() {
  const start = new Date(1950, 0, 1)
  const end = new Date(2024, 11, 31)
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
  return date.toISOString().split('T')[0]
}

// ランダム郵便番号生成
function getRandomPostalCode() {
  const first = Math.floor(Math.random() * 900) + 100
  const second = Math.floor(Math.random() * 9000) + 1000
  return `${first}-${second}`
}

// ランダム企業名生成
function generateCompanyName() {
  const type = companyTypes[Math.floor(Math.random() * companyTypes.length)]
  const name1 = businessNames[Math.floor(Math.random() * businessNames.length)]
  const name2 = Math.random() > 0.7 ? businessNames[Math.floor(Math.random() * businessNames.length)] : ''
  return `${type}${name1}${name2}`
}

// ランダム住所生成
function generateAddress(prefecture) {
  const cities = ['中央区', '北区', '南区', '西区', '東区', '港区', '新宿区', '渋谷区']
  const city = cities[Math.floor(Math.random() * cities.length)]
  const block = Math.floor(Math.random() * 10) + 1
  const number = Math.floor(Math.random() * 50) + 1
  const building = Math.floor(Math.random() * 20) + 1
  return `${prefecture}${city}サンプル町${block}-${number}-${building}`
}

// Website URL生成（70%の確率で生成）
function generateWebsite(companyName) {
  if (Math.random() > 0.3) {
    const domain = companyName.replace(/[株式会社有限合同合資]/g, '').toLowerCase()
    const romanized = `company${Math.floor(Math.random() * 1000000)}`
    return `https://${romanized}.co.jp`
  }
  return null
}

// データベース初期化
async function initializeDatabase() {
  const client = await pool.connect()
  
  try {
    console.log('🔧 データベースを初期化中...')
    
    // テーブル削除（既存データクリア）
    await client.query('DROP TABLE IF EXISTS companies')
    
    // テーブル作成
    await client.query(`
      CREATE TABLE companies (
        id BIGSERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        established_date DATE NOT NULL,
        postal_code VARCHAR(10),
        address TEXT NOT NULL,
        industry VARCHAR(50) NOT NULL,
        website VARCHAR(500),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
    
    // pg_trgm拡張の有効化
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    
    console.log('✅ テーブル作成完了')
    
  } finally {
    client.release()
  }
}

// 大量データ挿入（バッチ処理で高速化）
async function insertBatchData(companies) {
  const client = await pool.connect()
  
  try {
    const query = `
      INSERT INTO companies (company_name, established_date, postal_code, address, industry, website)
      VALUES ${companies.map((_, i) => {
        const base = i * 6
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
      }).join(', ')}
    `
    
    const values = companies.flatMap(company => [
      company.company_name,
      company.established_date,
      company.postal_code,
      company.address,
      company.industry,
      company.website
    ])
    
    await client.query(query, values)
    
  } finally {
    client.release()
  }
}

// インデックス作成（検索高速化）
async function createIndexes() {
  const client = await pool.connect()
  
  try {
    console.log('🔧 インデックスを作成中...')
    
    // 各インデックスを順番に作成
    const indexes = [
      'CREATE INDEX idx_companies_industry ON companies(industry)',
      'CREATE INDEX idx_companies_company_name ON companies USING gin(company_name gin_trgm_ops)',
      'CREATE INDEX idx_companies_established_date ON companies(established_date)',
      'CREATE INDEX idx_companies_industry_date ON companies(industry, established_date)',
      'CREATE INDEX idx_companies_address ON companies USING gin(address gin_trgm_ops)'
    ]
    
    for (const indexQuery of indexes) {
      await client.query(indexQuery)
      console.log(`✅ ${indexQuery.split(' ')[2]} 作成完了`)
    }
    
    console.log('✅ 全インデックス作成完了')
    
  } finally {
    client.release()
  }
}

// メイン実行関数
async function seedDatabase() {
  const TARGET_COUNT = parseInt(process.argv[2]) || 100000 // デフォルト10万件（テスト用）
  const BATCH_SIZE = 1000 // バッチサイズ
  
  console.log(`🚀 ${TARGET_COUNT.toLocaleString()}社のデータを生成開始...`)
  console.log(`📊 想定メモリ使用量: ${Math.round(TARGET_COUNT * 0.3 / 1024)}MB`)
  
  try {
    // データベース初期化
    await initializeDatabase()
    
    // データ生成・挿入
    let insertedCount = 0
    const startTime = Date.now()
    
    while (insertedCount < TARGET_COUNT) {
      const batchSize = Math.min(BATCH_SIZE, TARGET_COUNT - insertedCount)
      const companies = []
      
      // バッチデータ生成
      for (let i = 0; i < batchSize; i++) {
        const industry = industries[Math.floor(Math.random() * industries.length)]
        const prefecture = prefectures[Math.floor(Math.random() * prefectures.length)]
        const companyName = generateCompanyName()
        
        companies.push({
          company_name: companyName,
          established_date: getRandomDate(),
          postal_code: getRandomPostalCode(),
          address: generateAddress(prefecture),
          industry: industry,
          website: generateWebsite(companyName)
        })
      }
      
      // バッチ挿入
      await insertBatchData(companies)
      insertedCount += batchSize
      
      // 進捗表示
      const progress = (insertedCount / TARGET_COUNT * 100).toFixed(1)
      const elapsed = Date.now() - startTime
      const rate = Math.round(insertedCount / (elapsed / 1000))
      
      process.stdout.write(`\r📝 データ挿入中... ${insertedCount.toLocaleString()}/${TARGET_COUNT.toLocaleString()} (${progress}%) - ${rate}件/秒`)
    }
    
    console.log('\n✅ データ挿入完了')
    
    // インデックス作成
    await createIndexes()
    
    // 統計表示
    const client = await pool.connect()
    try {
      const totalTime = Date.now() - startTime
      const result = await client.query('SELECT COUNT(*) as count FROM companies')
      const finalCount = parseInt(result.rows[0].count)
      
      console.log('\n🎉 データベース構築完了!')
      console.log(`📊 総企業数: ${finalCount.toLocaleString()}社`)
      console.log(`⏱️  総実行時間: ${Math.round(totalTime / 1000)}秒`)
      console.log(`🚀 平均挿入速度: ${Math.round(finalCount / (totalTime / 1000))}件/秒`)
      
      // 業種別統計
      const statsResult = await client.query(`
        SELECT industry, COUNT(*) as count 
        FROM companies 
        GROUP BY industry 
        ORDER BY count DESC
      `)
      
      console.log('\n📈 業種別統計:')
      statsResult.rows.forEach(row => {
        console.log(`  ${row.industry}: ${parseInt(row.count).toLocaleString()}社`)
      })
      
    } finally {
      client.release()
    }
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error)
  } finally {
    await pool.end()
  }
}

// 実行
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('\n🎯 1200万社対応データベース準備完了!')
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ シード実行エラー:', error)
      process.exit(1)
    })
}