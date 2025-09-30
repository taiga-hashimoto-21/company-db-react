import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// 軽量キャッシュ（統計情報のみ）
let STATS_CACHE: {
  industries: string[],
  pressTypes: string[],
  listingStatuses: string[],
  lastUpdated: number
} | null = null
let STATS_CACHE_TTL = 5 * 60 * 1000 // 5分間キャッシュ

// 統計情報キャッシュの更新
async function updateStatsCache() {
  if (STATS_CACHE && Date.now() - STATS_CACHE.lastUpdated < STATS_CACHE_TTL) {
    return STATS_CACHE
  }

  try {
    const client = await pool.connect()
    try {
      const [industriesResult, pressTypesResult, listingResult] = await Promise.all([
        client.query(`
          SELECT DISTINCT industry
          FROM prtimes_companies
          WHERE industry IS NOT NULL AND industry != ''
          ORDER BY industry
        `),
        client.query(`
          SELECT DISTINCT press_release_type
          FROM prtimes_companies
          WHERE press_release_type IS NOT NULL AND press_release_type != ''
          ORDER BY press_release_type
        `),
        client.query(`
          SELECT DISTINCT listing_status
          FROM prtimes_companies
          WHERE listing_status IS NOT NULL AND listing_status != ''
          ORDER BY listing_status
        `)
      ])

      STATS_CACHE = {
        industries: industriesResult.rows.map(row => row.industry),
        pressTypes: pressTypesResult.rows.map(row => row.press_release_type),
        listingStatuses: listingResult.rows.map(row => row.listing_status),
        lastUpdated: Date.now()
      }

      return STATS_CACHE
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Stats cache update failed:', error)
    return STATS_CACHE || { industries: [], pressTypes: [], listingStatuses: [], lastUpdated: 0 }
  }
}

// レガシー関数（互換性維持のため空実装）
export function updateCacheWithNewData(newCompanies: any[]) {
  console.log('Legacy cache update called - now handled by database search')
}

export function refreshCacheInBackground() {
  console.log('Legacy cache refresh called - now handled by database search')
}

// DB主導の検索関数
async function performDatabaseSearch(searchParams: any, startTime: number) {
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
    page = 1,
    limit = 50, // デフォルトを安全な値に変更
    exportAll = false,
    tableOnly = false,
    countOnly = false
  } = searchParams

  const actualLimit = exportAll ? 10000 : (tableOnly ? 50 : Math.min(limit, 1000)) // 上限を設定
  const offset = exportAll ? 0 : (page - 1) * actualLimit

  const client = await pool.connect()
  try {
    // WHERE条件を構築
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
      conditions.push(`industry = ANY($${paramIndex})`)
      params.push(industry)
      paramIndex++
    }

    if (pressReleaseType && pressReleaseType.length > 0) {
      conditions.push(`press_release_type = ANY($${paramIndex})`)
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

    // countOnlyの場合は件数のみ取得
    if (countOnly) {
      const countQuery = `
        SELECT COUNT(DISTINCT
          CASE
            WHEN company_website ~ '^https?://' THEN
              regexp_replace(
                regexp_replace(company_website, '^https?://', ''),
                '/.*$', ''
              )
            ELSE company_website
          END
        ) as total
        FROM prtimes_companies
        ${whereClause}
      `

      const countResult = await client.query(countQuery, params)
      const totalCount = parseInt(countResult.rows[0].total)
      const responseTime = Date.now() - startTime

      return NextResponse.json({
        companies: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount,
          hasNextPage: false,
          hasPrevPage: false
        },
        _responseTime: responseTime,
        _searchMethod: 'database_optimized'
      })
    }

    // データ取得（重複除去付き）
    const dataQuery = `
      WITH deduplicated AS (
        SELECT DISTINCT ON (
          CASE
            WHEN company_website ~ '^https?://' THEN
              regexp_replace(
                regexp_replace(company_website, '^https?://', ''),
                '/.*$', ''
              )
            ELSE company_website
          END
        ) *
        FROM prtimes_companies
        ${whereClause}
        ORDER BY
          CASE
            WHEN company_website ~ '^https?://' THEN
              regexp_replace(
                regexp_replace(company_website, '^https?://', ''),
                '/.*$', ''
              )
            ELSE company_website
          END,
          delivery_date DESC
      )
      SELECT * FROM deduplicated
      ORDER BY delivery_date DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    const dataResult = await client.query(dataQuery, [...params, actualLimit, offset])

    // 総件数も取得（正確なページング計算のため）
    const countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT DISTINCT
          CASE
            WHEN company_website ~ '^https?://' THEN
              regexp_replace(
                regexp_replace(company_website, '^https?://', ''),
                '/.*$', ''
              )
            ELSE company_website
          END
        FROM prtimes_companies
        ${whereClause}
      ) as unique_companies
    `

    const countResult = await client.query(countQuery, params)
    const totalCount = parseInt(countResult.rows[0].total)
    const responseTime = Date.now() - startTime

    console.log(`✅ Database search completed: ${dataResult.rows.length}/${totalCount} results in ${responseTime}ms`)

    return NextResponse.json({
      companies: dataResult.rows.map(row => ({
        id: row.id,
        deliveryDate: row.delivery_date,
        pressReleaseUrl: row.press_release_url,
        pressReleaseTitle: row.press_release_title,
        pressReleaseType: row.press_release_type,
        pressReleaseCategory1: row.press_release_category1,
        pressReleaseCategory2: row.press_release_category2,
        companyName: row.company_name,
        companyWebsite: row.company_website,
        industry: row.industry,
        businessCategory: row.industry,
        industryCategory: undefined,
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
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / actualLimit),
        totalCount,
        hasNextPage: page < Math.ceil(totalCount / actualLimit),
        hasPrevPage: page > 1
      },
      _responseTime: responseTime,
      _searchMethod: 'database_optimized'
    })

  } finally {
    client.release()
  }
}

export async function GET(request: NextRequest) {
  // 統計情報確認用エンドポイント
  const stats = await updateStatsCache()

  return NextResponse.json({
    cacheStatus: 'database_optimized',
    stats: {
      industries: stats.industries.length,
      pressTypes: stats.pressTypes.length,
      listingStatuses: stats.listingStatuses.length,
      lastUpdated: stats.lastUpdated
    },
    message: 'Now using database-optimized search'
  })
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

    // 安全な limit デフォルト値設定
    const safeBody = {
      ...body,
      limit: body.exportAll ? 10000 : Math.min(body.limit || 50, 1000)
    }

    // DB主導の検索を実行
    return await performDatabaseSearch(safeBody, startTime)

  } catch (error) {
    console.error('PR TIMES search error:', error)
    return NextResponse.json(
      {
        error: 'Failed to search PR TIMES companies',
        _searchMethod: 'database_optimized_failed'
      },
      { status: 500 }
    )
  }
}