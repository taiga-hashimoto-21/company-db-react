const { MeiliSearch } = require('meilisearch')
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

// MeiliSearch client
const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || 'http://127.0.0.1:7700',
  apiKey: process.env.MEILISEARCH_API_KEY || 'your-master-key-here'
})

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function importPRTimesToMeiliSearch() {
  console.log('🚀 Starting PRTimes data import to MeiliSearch...')

  try {
    // PostgreSQLからデータ取得
    console.log('📊 Fetching data from PostgreSQL...')
    const client_pg = await pool.connect()

    const result = await client_pg.query(`
      SELECT * FROM prtimes_companies
      ORDER BY delivery_date DESC
    `)

    client_pg.release()

    console.log(`📊 Found ${result.rows.length} PRTimes companies to import`)

    if (result.rows.length === 0) {
      console.log('⚠️ No data to import')
      return
    }

    // MeiliSearchインデックス作成/取得
    console.log('🔍 Setting up MeiliSearch index...')
    const indexName = 'prtimes_companies'

    try {
      await client.createIndex(indexName, { primaryKey: 'id' })
      console.log(`✅ Created new index: ${indexName}`)
    } catch (error) {
      if (error.code === 'index_already_exists') {
        console.log(`✅ Using existing index: ${indexName}`)
      } else {
        throw error
      }
    }

    const index = client.index(indexName)

    // 重複除去キー生成関数（元のロジックと同じ）
    function extractDomain(url) {
      if (!url || !url.trim() || url === '-') return null
      try {
        const cleanUrl = url.trim()
        const fullUrl = cleanUrl.match(/^https?:\/\//) ? cleanUrl : `https://${cleanUrl}`
        const domain = new URL(fullUrl).hostname.toLowerCase()
        return domain.replace(/^www\./, '')
      } catch {
        return null
      }
    }

    function normalizeCompanyName(name) {
      if (!name || !name.trim()) return 'no-name'
      return name.trim()
        .toLowerCase()
        .replace(/株式会社|（株）|\(株\)|有限会社|合同会社|co\.,ltd\.|ltd\.|inc\.|corp\./g, '')
        .replace(/\s+/g, '')
    }

    // データ変換（ホームページURLが"-"の行を除外）
    console.log('🔄 Transforming data for MeiliSearch...')
    const documents = result.rows
      .filter(row => {
        // ホームページURLが"-"や空の場合は除外
        return row.company_website &&
               row.company_website.trim() !== '' &&
               row.company_website.trim() !== '-'
      })
      .map(row => {
        // 元のロジックと同じ重複除去キーを生成
        const domain = extractDomain(row.company_website)
        const normalizedName = normalizeCompanyName(row.company_name)
        const dedupeKey = domain || normalizedName || `fallback_${row.id}`

        return {
          id: row.id,
          deliveryDate: row.delivery_date,
          deliveryDateTimestamp: row.delivery_date ? new Date(row.delivery_date).getTime() : 0,
          pressReleaseUrl: row.press_release_url,
          pressReleaseTitle: row.press_release_title,
          pressReleaseType: row.press_release_type,
          pressReleaseCategory1: row.press_release_category1,
          pressReleaseCategory2: row.press_release_category2,
          companyName: row.company_name,
          companyWebsite: row.company_website,
          businessCategory: row.business_category,
          industryCategory: row.industry_category,
          subIndustryCategory: row.sub_industry_category,
          industry: row.business_category || row.industry_category,
          address: row.address,
          phoneNumber: row.phone_number,
          representative: row.representative,
          listingStatus: row.listing_status,
          capitalAmountText: row.capital_amount_text,
          establishedDateText: row.established_date_text,
          capitalAmountNumeric: row.capital_amount_numeric || 0,
          establishedYear: row.established_year || 0,
          establishedMonth: row.established_month || 0,
          createdAt: row.created_at,
          batchId: row.batch_id,
          dedupeKey: dedupeKey  // 重複除去キー追加
        }
      })

    console.log(`📊 Filtered ${result.rows.length} rows to ${documents.length} documents (excluded ${result.rows.length - documents.length} rows with invalid website)`)

    // バッチでインポート
    console.log('📥 Importing documents to MeiliSearch...')
    const batchSize = 1000
    const totalBatches = Math.ceil(documents.length / batchSize)

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize
      const end = Math.min(start + batchSize, documents.length)
      const batch = documents.slice(start, end)

      console.log(`📦 Importing batch ${i + 1}/${totalBatches} (${batch.length} documents)`)

      const task = await index.addDocuments(batch)
      console.log(`✅ Batch ${i + 1} uploaded (task: ${task.taskUid})`)
    }

    // インデックス設定
    console.log('⚙️ Configuring search settings...')

    // 検索可能属性
    await index.updateSearchableAttributes([
      'companyName',
      'pressReleaseTitle',
      'businessCategory',
      'industryCategory',
      'address',
      'representative'
    ])

    // フィルタ可能属性
    await index.updateFilterableAttributes([
      'businessCategory',
      'industryCategory',
      'pressReleaseType',
      'listingStatus',
      'capitalAmountNumeric',
      'establishedYear',
      'deliveryDateTimestamp'
    ])

    // ソート可能属性
    await index.updateSortableAttributes([
      'deliveryDateTimestamp',
      'capitalAmountNumeric',
      'establishedYear'
    ])

    // 統計取得
    const stats = await index.getStats()
    console.log(`🎉 Import completed!`)
    console.log(`📊 Total documents: ${stats.numberOfDocuments}`)

    console.log('✅ PRTimes MeiliSearch import finished successfully!')

  } catch (error) {
    console.error('❌ Import failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// スクリプト実行
if (require.main === module) {
  importPRTimesToMeiliSearch()
    .then(() => {
      console.log('🏁 Script finished')
      process.exit(0)
    })
    .catch(error => {
      console.error('💥 Script failed:', error)
      process.exit(1)
    })
}

module.exports = { importPRTimesToMeiliSearch }