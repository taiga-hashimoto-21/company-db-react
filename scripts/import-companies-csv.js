const { Pool } = require('pg')
const fs = require('fs')
const csv = require('csv-parser')
const path = require('path')

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// 都道府県抽出関数
function extractPrefecture(address) {
  const prefectures = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
    '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
    '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
    '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
  ]

  for (const pref of prefectures) {
    if (address && address.includes(pref)) {
      return pref
    }
  }
  return '不明'
}

// 数値変換（エラーハンドリング付き）
function parseNumber(value) {
  if (!value || value === '') return null
  const num = parseInt(value.toString().replace(/,/g, ''))
  return isNaN(num) ? null : num
}

async function createCompaniesTable() {
  const client = await pool.connect()
  try {
    // 既存テーブルを完全に削除（依存関係も含めて）
    await client.query('DROP TABLE IF EXISTS companies CASCADE')
    console.log('🗑️ Existing companies table dropped')

    // 新しいテーブル構造で作成
    await client.query(`
      CREATE TABLE companies (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        company_website TEXT,
        representative VARCHAR(255),
        address_1 VARCHAR(255),
        address_2 VARCHAR(255),
        prefecture VARCHAR(20),
        employees INTEGER,
        capital_amount BIGINT,
        established_year INTEGER,
        established_month INTEGER,
        listing_status VARCHAR(100),
        business_type VARCHAR(100),
        industry_1 VARCHAR(100),
        industry_2_1 VARCHAR(100),
        industry_2_2 VARCHAR(100),
        industry_2_3 VARCHAR(100),
        industry_2_4 VARCHAR(100),
        industry_2_5 VARCHAR(100),
        industry_2_6 VARCHAR(100),
        industry_2_7 VARCHAR(100),
        industry_2_8 VARCHAR(100),
        industry_2_9 VARCHAR(100),
        industry_2_10 VARCHAR(100),
        industry_2_11 VARCHAR(100),
        industry_2_12 VARCHAR(100),
        industry_2_13 VARCHAR(100),
        industry_2_14 VARCHAR(100),
        industry_2_15 VARCHAR(100),
        industry_2_16 VARCHAR(100),
        industry_2_17 VARCHAR(100),
        industry_2_18 VARCHAR(100),
        industry_2_19 VARCHAR(100),
        industry_2_20 VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

      // インデックス作成（検索高速化）
      await client.query('CREATE INDEX IF NOT EXISTS idx_companies_prefecture ON companies(prefecture)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_companies_industry_1 ON companies(industry_1)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_companies_employees ON companies(employees)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_companies_capital ON companies(capital_amount)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_companies_established_year ON companies(established_year)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_companies_company_name ON companies(company_name)')

    console.log('✅ Companies table created with indexes')
  } finally {
    client.release()
  }
}

async function importCSVData() {
  const csvPath = path.join(__dirname, '../data/◯IT_1.csv')
  const client = await pool.connect()

  try {
    let processedCount = 0
    let errorCount = 0
    const batchSize = 100
    let batch = []

    console.log('📊 Starting CSV import...')

    return new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          try {
            // データ変換
            const prefecture = extractPrefecture(row['住所1'])
            const employees = parseNumber(row['従業員数'])
            const capital = parseNumber(row['資本金'])
            const establishedYear = parseNumber(row['設立年'])
            const establishedMonth = parseNumber(row['設立月'])

            const companyData = {
              company_name: row['会社名'] || '',
              company_website: row['ホームページURL'] || '',
              representative: row['代表者名'] || '',
              address_1: row['住所1'] || '',
              address_2: row['住所2'] || '',
              prefecture,
              employees,
              capital_amount: capital,
              established_year: establishedYear,
              established_month: establishedMonth,
              listing_status: row['上場区分'] || '',
              business_type: row['業態'] || '',
              industry_1: row['業界1'] || '',
              industry_2_1: row['業界2-1'] || '',
              industry_2_2: row['業界2-2'] || '',
              industry_2_3: row['業界2-3'] || '',
              industry_2_4: row['業界2-4'] || '',
              industry_2_5: row['業界2-5'] || '',
              industry_2_6: row['業界2-6'] || '',
              industry_2_7: row['業界2-7'] || '',
              industry_2_8: row['業界2-8'] || '',
              industry_2_9: row['業界2-9'] || '',
              industry_2_10: row['業界2-10'] || '',
              industry_2_11: row['業界2-11'] || '',
              industry_2_12: row['業界2-12'] || '',
              industry_2_13: row['業界2-13'] || '',
              industry_2_14: row['業界2-14'] || '',
              industry_2_15: row['業界2-15'] || '',
              industry_2_16: row['業界2-16'] || '',
              industry_2_17: row['業界2-17'] || '',
              industry_2_18: row['業界2-18'] || '',
              industry_2_19: row['業界2-19'] || '',
              industry_2_20: row['業界2-20'] || ''
            }

            batch.push(companyData)

            // バッチ処理
            if (batch.length >= batchSize) {
              processBatch(client, batch.slice())
                .then(() => {
                  processedCount += batch.length
                  if (processedCount % 1000 === 0) {
                    console.log(`🔄 Processed ${processedCount} companies...`)
                  }
                })
                .catch((err) => {
                  errorCount += batch.length
                  console.error('Batch error:', err.message)
                })
              batch = []
            }

          } catch (error) {
            errorCount++
            console.warn(`⚠️ Error processing row: ${error.message}`)
          }
        })
        .on('end', async () => {
          // 残りのバッチを処理
          if (batch.length > 0) {
            try {
              await processBatch(client, batch)
              processedCount += batch.length
            } catch (err) {
              errorCount += batch.length
              console.error('Final batch error:', err.message)
            }
          }

          console.log(`✅ Import completed:`)
          console.log(`   - Processed: ${processedCount} companies`)
          console.log(`   - Errors: ${errorCount}`)

          // 最終統計
          try {
            const result = await client.query('SELECT COUNT(*) as total FROM companies')
            console.log(`📊 Total companies in DB: ${result.rows[0].total}`)
          } catch (err) {
            console.error('Count error:', err.message)
          }

          resolve()
        })
        .on('error', (error) => {
          console.error('CSV reading error:', error)
          reject(error)
        })
    })
  } finally {
    client.release()
  }
}

async function processBatch(client, companies) {
  if (companies.length === 0) return

  const placeholders = companies.map((_, index) => {
    const start = index * 33 + 1
    return `($${start}, $${start+1}, $${start+2}, $${start+3}, $${start+4}, $${start+5}, $${start+6}, $${start+7}, $${start+8}, $${start+9}, $${start+10}, $${start+11}, $${start+12}, $${start+13}, $${start+14}, $${start+15}, $${start+16}, $${start+17}, $${start+18}, $${start+19}, $${start+20}, $${start+21}, $${start+22}, $${start+23}, $${start+24}, $${start+25}, $${start+26}, $${start+27}, $${start+28}, $${start+29}, $${start+30}, $${start+31}, $${start+32})`
  }).join(', ')

  const query = `
    INSERT INTO companies (
      company_name, company_website, representative, address_1, address_2,
      prefecture, employees, capital_amount, established_year, established_month,
      listing_status, business_type, industry_1, industry_2_1, industry_2_2,
      industry_2_3, industry_2_4, industry_2_5, industry_2_6, industry_2_7,
      industry_2_8, industry_2_9, industry_2_10, industry_2_11, industry_2_12,
      industry_2_13, industry_2_14, industry_2_15, industry_2_16, industry_2_17,
      industry_2_18, industry_2_19, industry_2_20
    ) VALUES ${placeholders}
  `

  const values = companies.flatMap(company => [
    company.company_name, company.company_website, company.representative,
    company.address_1, company.address_2, company.prefecture,
    company.employees, company.capital_amount, company.established_year, company.established_month,
    company.listing_status, company.business_type, company.industry_1,
    company.industry_2_1, company.industry_2_2, company.industry_2_3, company.industry_2_4,
    company.industry_2_5, company.industry_2_6, company.industry_2_7, company.industry_2_8,
    company.industry_2_9, company.industry_2_10, company.industry_2_11, company.industry_2_12,
    company.industry_2_13, company.industry_2_14, company.industry_2_15, company.industry_2_16,
    company.industry_2_17, company.industry_2_18, company.industry_2_19, company.industry_2_20
  ])

  await client.query(query, values)
}

async function main() {
  try {
    console.log('🚀 Starting companies CSV import process...')

    await createCompaniesTable()
    await importCSVData()

    console.log('🎉 Import process completed successfully!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Import failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { createCompaniesTable, importCSVData }