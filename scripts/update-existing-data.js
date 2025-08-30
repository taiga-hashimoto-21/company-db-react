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

// 都道府県リスト
const prefectures = [
  '東京都', '大阪府', '神奈川県', '愛知県', '埼玉県', '千葉県', '兵庫県',
  '北海道', '福岡県', '静岡県', '茨城県', '広島県', '京都府', '新潟県',
  '宮城県', '長野県', '岐阜県', '栃木県', '群馬県', '岡山県', '熊本県',
  '鹿児島県', '沖縄県', '青森県', '岩手県', '山形県', '福島県', '石川県',
  '富山県', '福井県', '山梨県', '長野県', '滋賀県', '三重県', '奈良県',
  '和歌山県', '鳥取県', '島根県', '山口県', '徳島県', '香川県', '愛媛県',
  '高知県', '佐賀県', '長崎県', '大分県', '宮崎県'
]

// 資本金レンジ（万円）
const capitalRanges = [
  { min: 100, max: 500 },      // 中小企業
  { min: 500, max: 1000 },     // 中規模企業
  { min: 1000, max: 5000 },    // 大企業
  { min: 5000, max: 10000 },   // 上場企業
  { min: 10000, max: 100000 }  // 大企業
]

// 従業員数レンジ
const employeeRanges = [
  { min: 1, max: 10 },       // 零細企業
  { min: 10, max: 50 },      // 小企業
  { min: 50, max: 300 },     // 中企業
  { min: 300, max: 1000 },   // 大企業
  { min: 1000, max: 10000 }  // 大企業
]

// ランダム値生成
function getRandomCapital() {
  const range = capitalRanges[Math.floor(Math.random() * capitalRanges.length)]
  return (Math.floor(Math.random() * (range.max - range.min)) + range.min) * 10000 // 万円を円に変換
}

function getRandomEmployees() {
  const range = employeeRanges[Math.floor(Math.random() * employeeRanges.length)]
  return Math.floor(Math.random() * (range.max - range.min)) + range.min
}

function getRandomPrefecture() {
  return prefectures[Math.floor(Math.random() * prefectures.length)]
}

// 既存データの更新
async function updateExistingData() {
  const BATCH_SIZE = 1000
  const client = await pool.connect()
  
  try {
    // 総レコード数を取得
    const countResult = await client.query('SELECT COUNT(*) as count FROM companies')
    const totalCount = parseInt(countResult.rows[0].count)
    
    console.log(`🔧 ${totalCount.toLocaleString()}社のデータを更新開始...`)
    
    let updatedCount = 0
    const startTime = Date.now()
    
    while (updatedCount < totalCount) {
      const batchSize = Math.min(BATCH_SIZE, totalCount - updatedCount)
      
      // バッチで既存データを取得
      const result = await client.query(
        'SELECT id FROM companies WHERE capital_amount IS NULL OR capital_amount = 0 LIMIT $1',
        [batchSize]
      )
      
      if (result.rows.length === 0) {
        break // 更新対象がない
      }
      
      // バッチ更新
      for (const row of result.rows) {
        const capital = getRandomCapital()
        const employees = getRandomEmployees()
        const prefecture = getRandomPrefecture()
        
        await client.query(
          'UPDATE companies SET capital_amount = $1, employee_count = $2, prefecture = $3 WHERE id = $4',
          [capital, employees, prefecture, row.id]
        )
      }
      
      updatedCount += result.rows.length
      
      // 進捗表示
      const progress = (updatedCount / totalCount * 100).toFixed(1)
      const elapsed = Date.now() - startTime
      const rate = Math.round(updatedCount / (elapsed / 1000))
      
      process.stdout.write(`\r📝 データ更新中... ${updatedCount.toLocaleString()}/${totalCount.toLocaleString()} (${progress}%) - ${rate}件/秒`)
    }
    
    console.log('\n✅ データ更新完了')
    
    // 統計表示
    const statsResult = await client.query(`
      SELECT 
        prefecture, 
        COUNT(*) as count,
        AVG(capital_amount)::BIGINT as avg_capital,
        AVG(employee_count)::INTEGER as avg_employees
      FROM companies 
      WHERE prefecture IS NOT NULL
      GROUP BY prefecture 
      ORDER BY count DESC
      LIMIT 10
    `)
    
    console.log('\n📈 都道府県別統計（上位10件）:')
    statsResult.rows.forEach(row => {
      console.log(`  ${row.prefecture}: ${parseInt(row.count).toLocaleString()}社 (平均資本金: ${(row.avg_capital / 10000).toLocaleString()}万円, 平均従業員: ${row.avg_employees}名)`)
    })
    
  } finally {
    client.release()
  }
}

// インデックス作成
async function createNewIndexes() {
  const client = await pool.connect()
  
  try {
    console.log('\n🔧 新しいインデックスを作成中...')
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_companies_prefecture ON companies(prefecture)',
      'CREATE INDEX IF NOT EXISTS idx_companies_capital ON companies(capital_amount)',
      'CREATE INDEX IF NOT EXISTS idx_companies_employees ON companies(employee_count)',
      'CREATE INDEX IF NOT EXISTS idx_companies_composite ON companies(industry, prefecture, capital_amount, employee_count)'
    ]
    
    for (const indexQuery of indexes) {
      await client.query(indexQuery)
      console.log(`✅ ${indexQuery.split(' ')[5]} 作成完了`)
    }
    
    console.log('✅ 全インデックス作成完了')
    
  } finally {
    client.release()
  }
}

// メイン実行関数
async function main() {
  try {
    await updateExistingData()
    await createNewIndexes()
    
    console.log('\n🎉 データベース拡張完了!')
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error)
  } finally {
    await pool.end()
  }
}

// 実行
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n🎯 高度検索対応完了!')
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ 更新実行エラー:', error)
      process.exit(1)
    })
}