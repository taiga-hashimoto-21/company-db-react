import { NextRequest, NextResponse } from 'next/server'
import { MeiliSearch } from 'meilisearch'
import { Pool } from 'pg'

// MeiliSearch client - updated with 289,926 synced records
const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || 'http://127.0.0.1:7700',
  apiKey: process.env.MEILISEARCH_API_KEY || 'your-master-key-here'
})

// PostgreSQL pool (フォールバック用)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// ドメイン抽出関数（既存ロジック維持）
function extractDomain(url: string): string | null {
  if (!url || !url.trim()) return null
  try {
    const cleanUrl = url.trim()
    const fullUrl = cleanUrl.match(/^https?:\/\//) ? cleanUrl : `https://${cleanUrl}`
    const domain = new URL(fullUrl).hostname.toLowerCase()
    return domain.replace(/^www\./, '')
  } catch {
    return null
  }
}

// 会社名正規化関数（既存ロジック維持）
function normalizeCompanyName(name: string): string {
  if (!name || !name.trim()) return 'no-name'
  return name.trim()
    .toLowerCase()
    .replace(/株式会社|（株）|\(株\)|有限会社|合同会社|co\.,ltd\.|ltd\.|inc\.|corp\./g, '')
    .replace(/\s+/g, '')
}

// 重複除去関数（元のPostgreSQLロジックと完全に同じ）
function deduplicateCompanies(companies: any[]): any[] {
  const companyMap = new Map()

  companies.forEach(company => {
    // 元のPostgreSQLと同じフィールド名を使用
    const domain = extractDomain(company.companyWebsite)
    const normalizedName = normalizeCompanyName(company.companyName)
    const key = domain || normalizedName || `fallback_${company.id}`

    const existingCompany = companyMap.get(key)

    // より新しい配信日の会社を優先（元のロジックと同じ）
    if (!existingCompany || new Date(company.deliveryDate) > new Date(existingCompany.deliveryDate)) {
      companyMap.set(key, company)
    }
  })

  return Array.from(companyMap.values())
}

// MeiliSearchでの検索
async function searchWithMeiliSearch(searchParams: any): Promise<any> {
  try {
    const index = client.index('prtimes_companies')

    const {
      companyName,
      industry,
      pressReleaseType,
      listingStatus,
      capitalMin,
      capitalMax,
      establishedYearMin,
      establishedYearMax,
      deliveryDateFrom,
      deliveryDateTo,
      limit = 1000000,
      offset = 0
    } = searchParams

    // 検索クエリ構築
    let query = ''
    if (companyName) {
      query = companyName.trim()
    }

    // フィルター構築
    const filters = []

    if (industry && industry.length > 0) {
      const industryFilter = industry.map((ind: string) => `businessCategory = "${ind}"`).join(' OR ')
      filters.push(`(${industryFilter})`)
    }

    if (pressReleaseType && pressReleaseType.length > 0) {
      const typeFilter = pressReleaseType.map((type: string) => `pressReleaseType = "${type}"`).join(' OR ')
      filters.push(`(${typeFilter})`)
    }

    if (listingStatus && listingStatus.length > 0) {
      const statusFilter = listingStatus.map((status: string) => `listingStatus = "${status}"`).join(' OR ')
      filters.push(`(${statusFilter})`)
    }

    if (capitalMin !== undefined && capitalMin > 0) {
      filters.push(`capitalAmountNumeric >= ${capitalMin}`)
    }

    if (capitalMax !== undefined && capitalMax > 0) {
      filters.push(`capitalAmountNumeric <= ${capitalMax}`)
    }

    if (establishedYearMin !== undefined && establishedYearMin > 0) {
      filters.push(`establishedYear >= ${establishedYearMin}`)
    }

    if (establishedYearMax !== undefined && establishedYearMax > 0) {
      filters.push(`establishedYear <= ${establishedYearMax}`)
    }

    if (deliveryDateFrom) {
      const fromTimestamp = new Date(deliveryDateFrom).getTime()
      filters.push(`deliveryDateTimestamp >= ${fromTimestamp}`)
    }

    if (deliveryDateTo) {
      const toTimestamp = new Date(deliveryDateTo).getTime()
      filters.push(`deliveryDateTimestamp <= ${toTimestamp}`)
    }

    // MeiliSearch検索実行
    const searchOptions: any = {
      limit: Math.min(limit, 1000000),
      offset: offset
    }

    if (filters.length > 0) {
      searchOptions.filter = filters.join(' AND ')
    }

    console.log('🔍 MeiliSearch query:', { query, filter: searchOptions.filter })

    const searchResult = await index.search(query, searchOptions)

    // MeiliSearchの統計情報を取得（重複除去前の全ドキュメント数）
    const stats = await index.getStats()

    return {
      hits: searchResult.hits,
      totalHits: searchResult.estimatedTotalHits || searchResult.hits.length,
      totalRawDocuments: stats.numberOfDocuments, // 重複除去前の全ドキュメント数
      processingTimeMs: searchResult.processingTimeMs
    }

  } catch (error) {
    console.error('❌ MeiliSearch error:', error)
    throw error
  }
}

// PostgreSQLフォールバック検索（既存ロジック）
async function fallbackSearch(searchParams: any): Promise<any> {
  console.log('🔄 Falling back to PostgreSQL search...')

  const {
    companyName,
    industry,
    pressReleaseType,
    listingStatus,
    capitalMin,
    capitalMax,
    establishedYearMin,
    establishedYearMax,
    deliveryDateFrom,
    deliveryDateTo,
    limit = 1000000
  } = searchParams

  const client = await pool.connect()

  try {
    const conditions: string[] = [
      "company_website IS NOT NULL",
      "company_website != ''",
      "company_website != '-'"
    ]
    const params: any[] = []
    let paramIndex = 1

    if (companyName) {
      conditions.push(`company_name ILIKE $${paramIndex}`)
      params.push(`%${companyName}%`)
      paramIndex++
    }

    if (industry && industry.length > 0) {
      conditions.push(`(business_category = ANY($${paramIndex}) OR industry_category = ANY($${paramIndex}))`)
      params.push(industry)
      paramIndex++
    }

    if (pressReleaseType && pressReleaseType.length > 0) {
      conditions.push(`press_release_type = ANY($${paramIndex}`)
      params.push(pressReleaseType)
      paramIndex++
    }

    if (listingStatus && listingStatus.length > 0) {
      conditions.push(`listing_status = ANY($${paramIndex})`)
      params.push(listingStatus)
      paramIndex++
    }

    if (capitalMin !== undefined && capitalMin > 0) {
      conditions.push(`capital_amount_numeric >= $${paramIndex}`)
      params.push(capitalMin)
      paramIndex++
    }

    if (capitalMax !== undefined && capitalMax > 0) {
      conditions.push(`capital_amount_numeric <= $${paramIndex}`)
      params.push(capitalMax)
      paramIndex++
    }

    if (establishedYearMin !== undefined && establishedYearMin > 0) {
      conditions.push(`established_year >= $${paramIndex}`)
      params.push(establishedYearMin)
      paramIndex++
    }

    if (establishedYearMax !== undefined && establishedYearMax > 0) {
      conditions.push(`established_year <= $${paramIndex}`)
      params.push(establishedYearMax)
      paramIndex++
    }

    if (deliveryDateFrom) {
      conditions.push(`delivery_date >= $${paramIndex}`)
      params.push(new Date(deliveryDateFrom))
      paramIndex++
    }

    if (deliveryDateTo) {
      conditions.push(`delivery_date <= $${paramIndex}`)
      params.push(new Date(deliveryDateTo))
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const query = `
      SELECT *
      FROM prtimes_companies
      ${whereClause}
      ORDER BY delivery_date DESC
      LIMIT $${paramIndex}
    `

    const result = await client.query(query, [...params, limit])

    return {
      hits: result.rows.map(row => ({
        id: row.id,
        deliveryDate: row.delivery_date,
        pressReleaseUrl: row.press_release_url,
        pressReleaseTitle: row.press_release_title,
        pressReleaseType: row.press_release_type,
        pressReleaseCategory1: row.press_release_category1,
        pressReleaseCategory2: row.press_release_category2,
        companyName: row.company_name,
        companyWebsite: row.company_website,
        businessCategory: row.business_category,
        industryCategory: row.industry_category,
        industry: row.business_category || row.industry_category,
        address: row.address,
        phoneNumber: row.phone_number,
        representative: row.representative,
        listingStatus: row.listing_status,
        capitalAmountText: row.capital_amount_text,
        establishedDateText: row.established_date_text,
        capitalAmountNumeric: row.capital_amount_numeric,
        establishedYear: row.established_year,
        establishedMonth: row.established_month,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      totalHits: result.rows.length,
      processingTimeMs: 0
    }

  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    let body: any = {}
    try {
      const text = await request.text()
      if (text.trim()) {
        body = JSON.parse(text)
      }
    } catch (parseError) {
      console.log('Request body parsing fallback:', parseError)
      body = {}
    }
    const {
      page = 1,
      exportAll = false,
      tableOnly = false,
      countOnly = false
    } = body

    // テーブル専用リクエスト時は50件ずつ、それ以外は制限なし
    const actualLimit = tableOnly ? 50 : (exportAll ? 1000000 : 1000000)
    const offset = exportAll ? 0 : (page - 1) * actualLimit

    let searchResult
    let searchMethod = 'meilisearch'

    try {
      // MeiliSearchで検索（countOnlyの場合は効率化）
      const searchParams = {...body, offset}
      if (countOnly) {
        searchParams.limit = 100  // カウント取得のため小さめのlimit
        searchParams.offset = 0  // countOnlyではoffsetは不要
      }
      searchResult = await searchWithMeiliSearch(searchParams)
    } catch (error: any) {
      console.warn('⚠️ MeiliSearch failed, using PostgreSQL fallback:', error?.message || error)
      searchResult = await fallbackSearch(body)
      searchMethod = 'postgresql'
    }

    // MeiliSearchのdistinctAttributeが重複除去とソートを担当
    // countOnlyの場合は、実際の全件数を取得するため大きなlimitで再検索
    let totalCount
    if (countOnly && searchMethod === 'meilisearch') {
      // 全件数取得のため大きなlimitで検索
      const countResult = await searchWithMeiliSearch({...body, limit: 1000000, offset: 0})
      totalCount = countResult.hits.length
    } else {
      totalCount = searchResult.estimatedTotalHits || searchResult.hits.length
    }

    // countOnlyの場合は件数のみ返す
    if (countOnly) {
      const responseTime = Date.now() - startTime
      return NextResponse.json({
        companies: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount,
          totalRawCount: searchResult.totalRawDocuments, // 重複除去前の全ドキュメント数
          uniqueCount: totalCount,
          hasNextPage: false,
          hasPrevPage: false
        },
        _responseTime: responseTime,
        _cache: searchMethod,
        _searchMethod: searchMethod
      })
    }

    // MeiliSearchでページネーション済み
    const paginatedCompanies = searchResult.hits

    const totalPages = Math.ceil(totalCount / actualLimit)
    const responseTime = Date.now() - startTime

    console.log(`✅ Fast search completed: ${totalCount} results in ${responseTime}ms via ${searchMethod}`)

    return NextResponse.json({
      companies: paginatedCompanies,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        totalRawCount: searchResult.totalRawDocuments, // 重複除去前の全ドキュメント数
        uniqueCount: totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      _responseTime: responseTime,
      _cache: 'hit',
      _searchMethod: searchMethod,
      _meilisearchTime: searchResult.processingTimeMs || 0
    })

  } catch (error) {
    console.error('❌ Fast search error:', error)
    return NextResponse.json(
      { error: 'Failed to perform fast search' },
      { status: 500 }
    )
  }
}