import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// 統計情報キャッシュ
let STATS_CACHE: {
  industries: string[],
  prefectures: string[],
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
      const [industriesResult, prefecturesResult] = await Promise.all([
        client.query(`
          SELECT DISTINCT industry_1
          FROM companies
          WHERE industry_1 IS NOT NULL AND industry_1 != ''
          ORDER BY industry_1
        `),
        client.query(`
          SELECT DISTINCT prefecture
          FROM companies
          WHERE prefecture IS NOT NULL AND prefecture != ''
          ORDER BY prefecture
        `)
      ])

      STATS_CACHE = {
        industries: industriesResult.rows.map(row => row.industry_1),
        prefectures: prefecturesResult.rows.map(row => row.prefecture),
        lastUpdated: Date.now()
      }

      return STATS_CACHE
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Stats cache update failed:', error)
    return STATS_CACHE || { industries: [], prefectures: [], lastUpdated: 0 }
  }
}

// DB主導の高速検索関数
async function performDatabaseSearch(searchParams: any, startTime: number) {
  const {
    companyName,
    prefecture,
    industry,
    employeesMin,
    employeesMax,
    capitalMin,
    capitalMax,
    establishedYearMin,
    establishedYearMax,
    page = 1,
    limit = 50,
    exportAll = false,
    tableOnly = false,
    countOnly = false
  } = searchParams

  const actualLimit = exportAll ? 10000 : (tableOnly ? 50 : Math.min(limit, 1000))
  const offset = exportAll ? 0 : (page - 1) * actualLimit

  const client = await pool.connect()
  try {
    // WHERE条件を構築
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // ウェブサイト存在チェック（countOnly以外の場合のみ）
    if (!countOnly) {
      conditions.push("company_website IS NOT NULL")
      conditions.push("company_website != ''")
      conditions.push("company_website != '-'")
    }

    if (companyName && companyName.trim()) {
      conditions.push(`company_name ILIKE $${paramIndex}`)
      params.push(`%${companyName.trim()}%`)
      paramIndex++
    }

    if (prefecture && prefecture.length > 0) {
      conditions.push(`prefecture = ANY($${paramIndex})`)
      params.push(prefecture)
      paramIndex++
    }

    if (industry && industry.length > 0) {
      // industry_1またはindustry_2_*のいずれかにマッチする条件
      const industryConditions = []
      industryConditions.push(`industry_1 = ANY($${paramIndex})`)
      for (let i = 1; i <= 20; i++) {
        industryConditions.push(`industry_2_${i} = ANY($${paramIndex})`)
      }
      conditions.push(`(${industryConditions.join(' OR ')})`)
      params.push(industry)
      paramIndex++
    }

    if (employeesMin !== undefined && employeesMin > 0) {
      conditions.push(`employees >= $${paramIndex}`)
      params.push(employeesMin)
      paramIndex++
    }

    if (employeesMax !== undefined && employeesMax > 0) {
      conditions.push(`employees <= $${paramIndex}`)
      params.push(employeesMax)
      paramIndex++
    }

    if (capitalMin !== undefined && capitalMin > 0) {
      conditions.push(`capital_amount >= $${paramIndex}`)
      params.push(capitalMin)
      paramIndex++
    }

    if (capitalMax !== undefined && capitalMax > 0) {
      conditions.push(`capital_amount <= $${paramIndex}`)
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // countOnlyの場合は件数のみ取得（重複除去後）
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
        FROM companies
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
        _searchMethod: 'database_optimized_deduplicated'
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
        FROM companies
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
          company_name ASC
      )
      SELECT
        id,
        company_name,
        company_website,
        representative,
        address_1,
        address_2,
        prefecture,
        employees,
        capital_amount,
        established_year,
        established_month,
        listing_status,
        business_type,
        industry_1,
        industry_2_1,
        industry_2_2,
        industry_2_3,
        industry_2_4,
        industry_2_5,
        created_at,
        updated_at
      FROM deduplicated
      ORDER BY company_name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    const dataResult = await client.query(dataQuery, [...params, actualLimit, offset])

    // 総件数も取得（正確なページング計算のため、重複除去後）
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
      FROM companies
      ${whereClause}
    `

    const countResult = await client.query(countQuery, params)
    const totalCount = parseInt(countResult.rows[0].total)
    const responseTime = Date.now() - startTime

    console.log(`✅ Companies search completed: ${dataResult.rows.length}/${totalCount} results in ${responseTime}ms`)

    return NextResponse.json({
      companies: dataResult.rows.map(row => ({
        id: row.id,
        companyName: row.company_name,
        companyWebsite: row.company_website,
        representative: row.representative || 'ご担当者',
        address: `${row.address_1 || ''} ${row.address_2 || ''}`.trim(),
        prefecture: row.prefecture,
        employees: row.employees,
        capital: row.capital_amount,
        establishedYear: row.established_year,
        establishedMonth: row.established_month,
        listingStatus: row.listing_status,
        businessType: row.business_type,
        industry: row.industry_1,
        industry1: row.industry_1,
        industry21: row.industry_2_1,
        industry22: row.industry_2_2,
        industry23: row.industry_2_3,
        industry24: row.industry_2_4,
        industry25: row.industry_2_5,
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
      _searchMethod: 'database_optimized_deduplicated'
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
      prefectures: stats.prefectures.length,
      lastUpdated: stats.lastUpdated
    },
    message: 'Companies search using database-optimized approach',
    availableIndustries: stats.industries.slice(0, 10), // 最初の10件を表示
    availablePrefectures: stats.prefectures.slice(0, 10) // 最初の10件を表示
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
    console.error('Companies search error:', error)
    return NextResponse.json(
      {
        error: 'Failed to search companies',
        _searchMethod: 'database_optimized_failed'
      },
      { status: 500 }
    )
  }
}