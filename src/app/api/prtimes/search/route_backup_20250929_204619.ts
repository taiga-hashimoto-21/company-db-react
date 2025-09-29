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
          SELECT DISTINCT business_category
          FROM prtimes_companies
          WHERE business_category IS NOT NULL AND business_category != ''
          ORDER BY business_category
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
        industries: industriesResult.rows.map(row => row.business_category),
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
      conditions.push(`(business_category = ANY($${paramIndex}) OR industry_category = ANY($${paramIndex}))`)
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
    const responseTime = Date.now() - startTime

    console.log(`✅ Database search completed: ${dataResult.rows.length} results in ${responseTime}ms`)

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
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(dataResult.rows.length / actualLimit),
        totalCount: dataResult.rows.length,
        hasNextPage: page * actualLimit < dataResult.rows.length,
        hasPrevPage: page > 1
      },
      _responseTime: responseTime,
      _searchMethod: 'database_optimized'
    })

  } finally {
    client.release()
  }
}

// 実際のキャッシュ初期化処理
async function globalInitializeCacheInternal() {
  try {
    const client = await pool.connect()

    try {
      // 全件数をまず取得（進捗表示用）
      const countResult = await client.query(`
        SELECT COUNT(*) as total
        FROM prtimes_companies
        WHERE company_website IS NOT NULL AND company_website != '' AND company_website != '-'
      `)
      const totalRows = parseInt(countResult.rows[0].total)
      console.log(`📊 Total companies to process: ${totalRows}`)

      // 全件取得（クエリにタイムアウト設定）
      const searchQuery = `
        SELECT *
        FROM prtimes_companies
        WHERE company_website IS NOT NULL AND company_website != '' AND company_website != '-'
        ORDER BY delivery_date DESC
      `

      // クエリタイムアウトを設定（60秒）
      client.query('SET statement_timeout = 60000')
      const result = await client.query(searchQuery)
      console.log(`📊 Loaded ${result.rows.length} companies from database`)

      // 安全なドメイン抽出関数
      function extractDomainSafe(url: string): string | null {
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

      // 会社名正規化関数
      function normalizeCompanyName(name: string): string {
        if (!name || !name.trim()) return 'no-name'
        return name.trim()
          .toLowerCase()
          .replace(/株式会社|（株）|\(株\)|有限会社|合同会社|co\.,ltd\.|ltd\.|inc\.|corp\./g, '')
          .replace(/\s+/g, '')
      }

      // ドメインベースの重複除去（エラーハンドリング強化）
      const companyMap = new Map()
      let processedCount = 0
      let errorCount = 0

      result.rows.forEach(row => {
        try {
          const domain = extractDomainSafe(row.company_website)
          const normalizedName = normalizeCompanyName(row.company_name)
          const key = domain || normalizedName || `fallback_${row.id}`

          const existingCompany = companyMap.get(key)

          if (!existingCompany || new Date(row.delivery_date) > new Date(existingCompany.delivery_date)) {
            companyMap.set(key, {
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
            })
          }
          processedCount++
        } catch (error) {
          errorCount++
          console.warn(`⚠️ Error processing row ${row.id}:`, error instanceof Error ? error.message : error)
        }
      })

      COMPANIES_CACHE = Array.from(companyMap.values())
      TOTAL_RAW_COUNT = totalRows
      console.log(`✅ Deduplicated to ${COMPANIES_CACHE.length} unique companies`)
      console.log(`📊 Processed: ${processedCount}, Errors: ${errorCount}`)

      // インデックス構築
      console.log('🔍 Building search indexes...')
      INDUSTRY_INDEX.clear()
      CAPITAL_INDEX.clear()
      LISTING_INDEX.clear()
      PRESS_TYPE_INDEX.clear()

      COMPANIES_CACHE.forEach(company => {
        // 業界別インデックス
        if (company.industry) {
          if (!INDUSTRY_INDEX.has(company.industry)) {
            INDUSTRY_INDEX.set(company.industry, [])
          }
          INDUSTRY_INDEX.get(company.industry)!.push(company)
        }

        // 資本金別インデックス
        if (company.capitalAmountNumeric) {
          const capitalRange = getCapitalRange(company.capitalAmountNumeric)
          if (!CAPITAL_INDEX.has(capitalRange)) {
            CAPITAL_INDEX.set(capitalRange, [])
          }
          CAPITAL_INDEX.get(capitalRange)!.push(company)
        }

        // 上場状況別インデックス
        if (company.listingStatus) {
          if (!LISTING_INDEX.has(company.listingStatus)) {
            LISTING_INDEX.set(company.listingStatus, [])
          }
          LISTING_INDEX.get(company.listingStatus)!.push(company)
        }

        // プレスリリース種類別インデックス
        if (company.pressReleaseType) {
          if (!PRESS_TYPE_INDEX.has(company.pressReleaseType)) {
            PRESS_TYPE_INDEX.set(company.pressReleaseType, [])
          }
          PRESS_TYPE_INDEX.get(company.pressReleaseType)!.push(company)
        }
      })

      CACHE_INITIALIZED = true
      console.log(`🎉 Cache initialization completed! Indexes built:`)
      console.log(`   - Industries: ${INDUSTRY_INDEX.size}`)
      console.log(`   - Capital ranges: ${CAPITAL_INDEX.size}`)
      console.log(`   - Listing status: ${LISTING_INDEX.size}`)
      console.log(`   - Press release types: ${PRESS_TYPE_INDEX.size}`)

    } finally {
      client.release()
    }
  } catch (error) {
    console.error('❌ Cache initialization failed:', error)
    CACHE_INITIALIZED = false
  } finally {
    CACHE_INITIALIZING = false
  }
}

export function refreshCacheInBackground() {
  if (CACHE_INITIALIZING) {
    console.log('⏳ Cache initialization already in progress, skipping background refresh')
    return
  }

  console.log('🔄 Starting background cache refresh...')
  setTimeout(async () => {
    try {
      CACHE_INITIALIZED = false
      await globalInitializeCache()
      console.log('✅ Background cache refresh completed')
    } catch (error) {
      console.error('❌ Background cache refresh failed:', error)
    }
  }, 2000) // 2秒後に開始
}

// フォールバック検索（データベース直接検索）
async function performFallbackSearch(body: any, startTime: number) {
  console.log('🔍 Performing fallback database search...')

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
    limit = 1000000,
    exportAll = false,
    tableOnly = false,
    countOnly = false
  } = body

  const actualLimit = tableOnly ? 50 : (exportAll ? 1000000 : limit)
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
      conditions.push(`(business_category = ANY($${paramIndex}) OR industry_category = ANY($${paramIndex}))`)
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

    // 総件数取得
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

    // countOnlyの場合は件数のみ返す
    if (countOnly) {
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
        _cache: 'fallback'
      })
    }

    // データ取得（重複除去）
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

    const responseTime = Date.now() - startTime
    console.log(`✅ Fallback search completed: ${totalCount} results in ${responseTime}ms`)

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
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / actualLimit),
        totalCount,
        totalRawCount: null, // フォールバック時は生データ件数は取得しない
        uniqueCount: totalCount,
        hasNextPage: page < Math.ceil(totalCount / actualLimit),
        hasPrevPage: page > 1
      },
      _responseTime: responseTime,
      _cache: 'fallback',
      cacheStatus: 'unavailable'
    })

  } finally {
    client.release()
  }
}

export async function GET(request: NextRequest) {
  // キャッシュステータス確認用エンドポイント
  const searchParams = request.nextUrl.searchParams
  const forceRefresh = searchParams.get('forceRefresh') === 'true'

  if (forceRefresh) {
    console.log('🔄 Force refreshing cache via GET request...')
    CACHE_INITIALIZED = false
    await globalInitializeCache()
  }

  return NextResponse.json({
    cacheInitialized: CACHE_INITIALIZED,
    cacheInitializing: CACHE_INITIALIZING,
    totalCount: CACHE_INITIALIZED ? COMPANIES_CACHE.length : null,
    totalRawCount: CACHE_INITIALIZED ? TOTAL_RAW_COUNT : null,
    indexSizes: CACHE_INITIALIZED ? {
      industries: INDUSTRY_INDEX.size,
      capitalRanges: CAPITAL_INDEX.size,
      listingStatuses: LISTING_INDEX.size,
      pressReleaseTypes: PRESS_TYPE_INDEX.size
    } : null,
    cacheStatus: CACHE_INITIALIZED ? 'ready' : (CACHE_INITIALIZING ? 'initializing' : 'not_initialized')
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
      limit = 1000000,
      exportAll = false,
      tableOnly = false,
      countOnly = false
    } = body

    // テーブル専用リクエスト時は50件ずつ、それ以外は制限なし
    const actualLimit = tableOnly ? 50 : (exportAll ? 1000000 : limit)

    const offset = exportAll ? 0 : (page - 1) * actualLimit
    
    // ドメイン抽出関数
    function extractDomain(url: string): string | null {
      if (!url || !url.trim()) return null
      try {
        const cleanUrl = url.trim()
        // httpまたはhttpsで始まらない場合は追加
        const fullUrl = cleanUrl.match(/^https?:\/\//) ? cleanUrl : `https://${cleanUrl}`
        const domain = new URL(fullUrl).hostname.toLowerCase()
        // www.を除去
        return domain.replace(/^www\./, '')
      } catch {
        return null
      }
    }

    // 会社名正規化関数
    function normalizeCompanyName(name: string): string {
      if (!name || !name.trim()) return 'no-name'
      return name.trim()
        .toLowerCase()
        .replace(/株式会社|（株）|\(株\)|有限会社|合同会社|co\.,ltd\.|ltd\.|inc\.|corp\./g, '')
        .replace(/\s+/g, '')
    }


    // 強制リフレッシュの処理
    if (body?.forceRefresh) {
      console.log('🔄 Force refreshing cache...')
      CACHE_INITIALIZED = false
      await globalInitializeCache()
    }

    // キャッシュ初期化（必要に応じて）
    if (!CACHE_INITIALIZED) {
      await globalInitializeCache()
    }

    // キャッシュが利用できない場合はフォールバック検索を実行
    if (!CACHE_INITIALIZED) {
      console.warn('⚠️ Cache not available, falling back to database search')
      return await performFallbackSearch(body, startTime)
    }

    // 高速フィルタリング（メモリ内検索）
    console.log('🔍 Starting fast search with filters:', body)

    let filteredCompanies = COMPANIES_CACHE

    // 会社名フィルタ
    if (companyName) {
      filteredCompanies = filteredCompanies.filter(company =>
        company.companyName?.toLowerCase().includes(companyName.toLowerCase())
      )
    }

    // 業種フィルタ（インデックス使用）
    if (industry && industry.length > 0) {
      const industryResults = new Set<any>()
      industry.forEach((ind: string) => {
        const companiesInIndustry = INDUSTRY_INDEX.get(ind) || []
        companiesInIndustry.forEach(company => industryResults.add(company))
      })
      filteredCompanies = filteredCompanies.filter(company => industryResults.has(company))
    }

    // プレスリリース種類フィルタ（インデックス使用）
    if (pressReleaseType && pressReleaseType.length > 0) {
      const pressTypeResults = new Set<any>()
      pressReleaseType.forEach((type: string) => {
        const companiesWithType = PRESS_TYPE_INDEX.get(type) || []
        companiesWithType.forEach(company => pressTypeResults.add(company))
      })
      filteredCompanies = filteredCompanies.filter(company => pressTypeResults.has(company))
    }

    // 上場区分フィルタ（インデックス使用）
    if (listingStatus && listingStatus.length > 0) {
      const listingResults = new Set<any>()
      listingStatus.forEach((status: string) => {
        const companiesWithStatus = LISTING_INDEX.get(status) || []
        companiesWithStatus.forEach(company => listingResults.add(company))
      })
      filteredCompanies = filteredCompanies.filter(company => listingResults.has(company))
    }

    // 資本金フィルタ
    if (capitalMin !== undefined && capitalMin > 0) {
      filteredCompanies = filteredCompanies.filter(company =>
        company.capitalAmountNumeric && company.capitalAmountNumeric >= capitalMin
      )
    }

    if (capitalMax !== undefined && capitalMax > 0) {
      filteredCompanies = filteredCompanies.filter(company =>
        company.capitalAmountNumeric && company.capitalAmountNumeric <= capitalMax
      )
    }

    // 設立年フィルタ
    if (establishedYearMin !== undefined && establishedYearMin > 0) {
      filteredCompanies = filteredCompanies.filter(company =>
        company.establishedYear && company.establishedYear >= establishedYearMin
      )
    }

    if (establishedYearMax !== undefined && establishedYearMax > 0) {
      filteredCompanies = filteredCompanies.filter(company =>
        company.establishedYear && company.establishedYear <= establishedYearMax
      )
    }

    // 配信日フィルタ
    if (deliveryDateFrom) {
      const fromDate = new Date(deliveryDateFrom)
      filteredCompanies = filteredCompanies.filter(company =>
        company.deliveryDate && new Date(company.deliveryDate) >= fromDate
      )
    }

    if (deliveryDateTo) {
      const toDate = new Date(deliveryDateTo)
      filteredCompanies = filteredCompanies.filter(company =>
        company.deliveryDate && new Date(company.deliveryDate) <= toDate
      )
    }

    // ソート（配信日降順）
    filteredCompanies.sort((a: any, b: any) =>
      new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime()
    )

    const totalCount = filteredCompanies.length

    // countOnlyの場合は件数のみ返す
    if (countOnly) {
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
        _cache: 'hit'
      })
    }

    // ページネーション処理
    const startIndex = exportAll ? 0 : offset
    const endIndex = exportAll ? filteredCompanies.length : offset + actualLimit
    const paginatedCompanies = filteredCompanies.slice(startIndex, endIndex)

    const totalPages = Math.ceil(totalCount / actualLimit)
    const responseTime = Date.now() - startTime

    console.log(`✅ Fast search completed: ${totalCount} results in ${responseTime}ms`)

    return NextResponse.json({
      companies: paginatedCompanies.map(row => ({
        id: row.id,
        deliveryDate: row.deliveryDate,
        pressReleaseUrl: row.pressReleaseUrl,
        pressReleaseTitle: row.pressReleaseTitle,
        pressReleaseType: row.pressReleaseType,
        pressReleaseCategory1: row.pressReleaseCategory1,
        pressReleaseCategory2: row.pressReleaseCategory2,
        companyName: row.companyName,
        companyWebsite: row.companyWebsite,
        businessCategory: row.businessCategory,
        industryCategory: row.industryCategory,
        industry: row.industry,
        address: row.address,
        phoneNumber: row.phoneNumber,
        representative: row.representative,
        listingStatus: row.listingStatus,
        capitalAmountText: row.capitalAmountText,
        establishedDateText: row.establishedDateText,
        capitalAmountNumeric: row.capitalAmountNumeric,
        establishedYear: row.establishedYear,
        establishedMonth: row.establishedMonth,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        totalRawCount: TOTAL_RAW_COUNT,
        uniqueCount: COMPANIES_CACHE.length,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      _responseTime: responseTime,
      _cache: 'hit'
    })
  } catch (error) {
    console.error('PR TIMES search error:', error)
    return NextResponse.json(
      { error: 'Failed to search PR TIMES companies' },
      { status: 500 }
    )
  }
}