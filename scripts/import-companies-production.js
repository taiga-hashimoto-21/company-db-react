const { Pool } = require('pg')
const fs = require('fs')
const csv = require('csv-parser')
const path = require('path')
const copyFrom = require('pg-copy-streams').from
const { Transform } = require('stream')

// 本番環境対応の接続設定
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10, // 最大接続数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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
  if (!value || value === '') return '\\N'
  const num = parseInt(value.toString().replace(/,/g, ''))
  return isNaN(num) ? '\\N' : num
}

// 文字列のエスケープ処理
function escapeForCopy(value) {
  if (value === null || value === undefined || value === '') {
    return '\\N'
  }

  // タブ、改行、バックスラッシュをエスケープ
  return value.toString()
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

// 進捗管理クラス
class ProgressTracker {
  constructor(total) {
    this.total = total
    this.processed = 0
    this.errors = 0
    this.startTime = Date.now()
  }

  update(processed = 1, errors = 0) {
    this.processed += processed
    this.errors += errors

    if (this.processed % 1000 === 0 || this.processed === this.total) {
      const elapsed = (Date.now() - this.startTime) / 1000
      const rate = this.processed / elapsed
      const percentage = ((this.processed / this.total) * 100).toFixed(1)
      const eta = this.total > this.processed ? ((this.total - this.processed) / rate) : 0

      console.log(`📊 Progress: ${this.processed.toLocaleString()}/${this.total.toLocaleString()} (${percentage}%) | ${rate.toFixed(0)} records/sec | ETA: ${this.formatTime(eta)} | Errors: ${this.errors}`)
    }
  }

  formatTime(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
  }

  summary() {
    const elapsed = (Date.now() - this.startTime) / 1000
    const rate = this.processed / elapsed
    console.log(`\n✅ Import Summary:`)
    console.log(`   - Total processed: ${this.processed.toLocaleString()} records`)
    console.log(`   - Total errors: ${this.errors.toLocaleString()}`)
    console.log(`   - Total time: ${this.formatTime(elapsed)}`)
    console.log(`   - Average rate: ${rate.toFixed(0)} records/sec`)
  }
}

// テーブル作成関数（本番環境対応）
async function ensureTable() {
  const client = await pool.connect()

  try {
    // テーブル存在確認
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'companies'
      );
    `)

    if (!tableCheck.rows[0].exists) {
      console.log('🔧 Creating companies table...')

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

      // インデックス作成
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_companies_prefecture ON companies(prefecture)',
        'CREATE INDEX IF NOT EXISTS idx_companies_industry_1 ON companies(industry_1)',
        'CREATE INDEX IF NOT EXISTS idx_companies_employees ON companies(employees)',
        'CREATE INDEX IF NOT EXISTS idx_companies_capital ON companies(capital_amount)',
        'CREATE INDEX IF NOT EXISTS idx_companies_established_year ON companies(established_year)',
        'CREATE INDEX IF NOT EXISTS idx_companies_company_name ON companies(company_name)',
        'CREATE INDEX IF NOT EXISTS idx_companies_website ON companies(company_website)'
      ]

      for (const indexQuery of indexes) {
        await client.query(indexQuery)
      }

      console.log('✅ Companies table and indexes created')
    } else {
      console.log('✅ Companies table already exists')
    }

  } finally {
    client.release()
  }
}

// 高速COPY FROMインポート
async function importCSVWithCopyFrom(csvPath) {
  console.log(`🚀 Starting high-speed CSV import from: ${csvPath}`)

  // まずファイルの行数を取得
  let totalRows = 0
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', () => totalRows++)
      .on('end', resolve)
      .on('error', reject)
  })

  console.log(`📊 Total rows to process: ${totalRows.toLocaleString()}`)

  const progress = new ProgressTracker(totalRows)
  const client = await pool.connect()

  try {
    // COPY FROMコマンドを開始
    const copyQuery = `
      COPY companies (
        company_name, company_website, representative, address_1, address_2,
        prefecture, employees, capital_amount, established_year, established_month,
        listing_status, business_type, industry_1, industry_2_1, industry_2_2,
        industry_2_3, industry_2_4, industry_2_5, industry_2_6, industry_2_7,
        industry_2_8, industry_2_9, industry_2_10, industry_2_11, industry_2_12,
        industry_2_13, industry_2_14, industry_2_15, industry_2_16, industry_2_17,
        industry_2_18, industry_2_19, industry_2_20
      ) FROM STDIN WITH (FORMAT TEXT, DELIMITER E'\\t', NULL '\\N')
    `

    const stream = client.query(copyFrom(copyQuery))
    let processedCount = 0
    let errorCount = 0

    // CSV変換用のTransformストリーム
    const csvTransform = new Transform({
      objectMode: true,
      transform(row, encoding, callback) {
        try {
          // データ変換
          const prefecture = extractPrefecture(row['住所1'])
          const employees = parseNumber(row['従業員数'])
          const capital = parseNumber(row['資本金'])
          const establishedYear = parseNumber(row['設立年'])
          const establishedMonth = parseNumber(row['設立月'])

          // タブ区切り形式でデータを構築
          const values = [
            escapeForCopy(row['会社名'] || ''),
            escapeForCopy(row['ホームページURL'] || ''),
            escapeForCopy(row['代表者名'] || ''),
            escapeForCopy(row['住所1'] || ''),
            escapeForCopy(row['住所2'] || ''),
            escapeForCopy(prefecture),
            employees,
            capital,
            establishedYear,
            establishedMonth,
            escapeForCopy(row['上場区分'] || ''),
            escapeForCopy(row['業態'] || ''),
            escapeForCopy(row['業界1'] || ''),
            escapeForCopy(row['業界2-1'] || ''),
            escapeForCopy(row['業界2-2'] || ''),
            escapeForCopy(row['業界2-3'] || ''),
            escapeForCopy(row['業界2-4'] || ''),
            escapeForCopy(row['業界2-5'] || ''),
            escapeForCopy(row['業界2-6'] || ''),
            escapeForCopy(row['業界2-7'] || ''),
            escapeForCopy(row['業界2-8'] || ''),
            escapeForCopy(row['業界2-9'] || ''),
            escapeForCopy(row['業界2-10'] || ''),
            escapeForCopy(row['業界2-11'] || ''),
            escapeForCopy(row['業界2-12'] || ''),
            escapeForCopy(row['業界2-13'] || ''),
            escapeForCopy(row['業界2-14'] || ''),
            escapeForCopy(row['業界2-15'] || ''),
            escapeForCopy(row['業界2-16'] || ''),
            escapeForCopy(row['業界2-17'] || ''),
            escapeForCopy(row['業界2-18'] || ''),
            escapeForCopy(row['業界2-19'] || ''),
            escapeForCopy(row['業界2-20'] || '')
          ]

          const line = values.join('\t') + '\n'
          processedCount++
          progress.update()

          this.push(line)
          callback()
        } catch (error) {
          errorCount++
          progress.update(0, 1)
          console.warn(`⚠️ Row processing error: ${error.message}`)
          callback()
        }
      }
    })

    // ストリームパイプラインの構築
    const importPromise = new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({ processedCount, errorCount })
      })
      stream.on('error', reject)
    })

    // CSVファイルをストリーミング処理
    fs.createReadStream(csvPath)
      .pipe(csv())
      .pipe(csvTransform)
      .pipe(stream)

    const result = await importPromise
    progress.summary()

    // 最終確認
    const finalCount = await client.query('SELECT COUNT(*) as total FROM companies')
    console.log(`\n📊 Final database count: ${parseInt(finalCount.rows[0].total).toLocaleString()} companies`)

    return result

  } finally {
    client.release()
  }
}

// メイン実行関数
async function main() {
  const startTime = Date.now()

  try {
    console.log('🚀 Starting production-grade CSV import process...')
    console.log(`🔗 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`)
    console.log(`🏭 Environment: ${process.env.NODE_ENV || 'development'}`)

    // CSVファイルのパス確認
    const csvPath = process.argv[2] || path.join(__dirname, '../data/◯IT_1.csv')

    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`)
    }

    console.log(`📁 CSV file: ${csvPath}`)

    // テーブル確認・作成
    await ensureTable()

    // 高速インポート実行
    const result = await importCSVWithCopyFrom(csvPath)

    const totalTime = (Date.now() - startTime) / 1000
    console.log(`\n🎉 Production import completed successfully!`)
    console.log(`   ⏱️ Total time: ${totalTime.toFixed(2)}s`)
    console.log(`   📊 Processed: ${result.processedCount.toLocaleString()} records`)
    console.log(`   ❌ Errors: ${result.errorCount.toLocaleString()}`)
    console.log(`   🚀 Average speed: ${(result.processedCount / totalTime).toFixed(0)} records/sec`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Production import failed:', error)
    console.error('Stack trace:', error.stack)
    process.exit(1)
  }
}

// 未処理エラーのキャッチ
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  process.exit(1)
})

// モジュールとして実行された場合のみメイン関数を実行
if (require.main === module) {
  main()
}

module.exports = { main, importCSVWithCopyFrom, ensureTable }