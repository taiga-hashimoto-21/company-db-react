const { Pool } = require('pg')

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'company_db',
  password: 'password',
  port: 5432,
})

// 都道府県リスト
const prefectures = [
  '東京都', '大阪府', '神奈川県', '愛知県', '埼玉県', '千葉県', '兵庫県',
  '北海道', '福岡県', '静岡県', '茨城県', '広島県', '京都府', '新潟県',
  '宮城県', '長野県', '岐阜県', '栃木県', '群馬県', '岡山県', '熊本県',
  '鹿児島県', '沖縄県', '青森県', '岩手県', '山形県', '福島県'
]

function getRandomPrefecture() {
  return prefectures[Math.floor(Math.random() * prefectures.length)]
}

function getRandomCapital() {
  // 1000万円から100億円まで（100万円〜10億円単位、円で格納）
  const amounts = [
    10000000,   // 1000万円
    30000000,   // 3000万円
    50000000,   // 5000万円
    100000000,  // 1億円
    300000000,  // 3億円
    500000000,  // 5億円
    1000000000, // 10億円
    3000000000, // 30億円
    5000000000, // 50億円
    10000000000 // 100億円
  ]
  return amounts[Math.floor(Math.random() * amounts.length)]
}

function getRandomEmployeeCount() {
  // 1名から10000名まで
  const counts = [
    1, 5, 10, 20, 30, 50, 100, 200, 300, 500, 
    1000, 2000, 3000, 5000, 10000
  ]
  return counts[Math.floor(Math.random() * counts.length)]
}

async function updateTestData() {
  const client = await pool.connect()
  
  try {
    console.log('🚀 10,000社のテストデータを更新中...')
    
    // バッチサイズを小さく（500件ずつ）
    const batchSize = 500
    const totalCount = 10000
    
    for (let offset = 0; offset < totalCount; offset += batchSize) {
      const startTime = Date.now()
      
      // バッチ内の各企業を更新
      const updatePromises = []
      
      for (let i = 0; i < batchSize && (offset + i) < totalCount; i++) {
        const id = offset + i + 1
        const capitalAmount = getRandomCapital()
        const employeeCount = getRandomEmployeeCount()
        const prefecture = getRandomPrefecture()
        
        const updatePromise = client.query(
          'UPDATE companies SET capital_amount = $1, employee_count = $2, prefecture = $3 WHERE id = $4',
          [capitalAmount, employeeCount, prefecture, id]
        )
        updatePromises.push(updatePromise)
      }
      
      await Promise.all(updatePromises)
      
      const processed = Math.min(offset + batchSize, totalCount)
      const percentage = ((processed / totalCount) * 100).toFixed(1)
      const rate = Math.round(batchSize / ((Date.now() - startTime) / 1000))
      
      console.log(`📝 データ更新中... ${processed.toLocaleString()}/${totalCount.toLocaleString()} (${percentage}%) - ${rate}件/秒`)
    }
    
    console.log('✅ テストデータの更新が完了しました！')
    
    // 統計表示
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(capital_amount) as with_capital,
        COUNT(employee_count) as with_employees,
        COUNT(prefecture) as with_prefecture
      FROM companies
    `)
    
    console.log('📊 データベース統計:')
    console.log(`  総企業数: ${stats.rows[0].total}`)
    console.log(`  資本金あり: ${stats.rows[0].with_capital}`)
    console.log(`  従業員数あり: ${stats.rows[0].with_employees}`)
    console.log(`  都道府県あり: ${stats.rows[0].with_prefecture}`)
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

updateTestData()