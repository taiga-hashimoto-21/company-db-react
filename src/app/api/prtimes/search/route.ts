import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// 起動時キャッシュとインデックス
let COMPANIES_CACHE: any[] = []
let INDUSTRY_INDEX = new Map<string, any[]>()
let CAPITAL_INDEX = new Map<number, any[]>()
let LISTING_INDEX = new Map<string, any[]>()
let PRESS_TYPE_INDEX = new Map<string, any[]>()
let CACHE_INITIALIZED = false
let CACHE_INITIALIZING = false

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    let body = {}
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
      tableOnly = false
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

    // キャッシュ初期化関数
    async function initializeCache() {
      if (CACHE_INITIALIZED || CACHE_INITIALIZING) return

      CACHE_INITIALIZING = true
      console.log('🚀 Initializing companies cache...')

      // タイムアウト設定（30秒）
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Cache initialization timeout')), 30000)
      })

      try {
        await Promise.race([initializeCacheInternal(), timeoutPromise])
      } catch (error) {
        console.error('❌ Cache initialization failed:', error)
        CACHE_INITIALIZED = false
        CACHE_INITIALIZING = false
      }
    }

    // 実際のキャッシュ初期化処理
    async function initializeCacheInternal() {
      try {
        const client = await pool.connect()

        try {
          // 全件取得
          const searchQuery = `
            SELECT *
            FROM prtimes_companies
            WHERE company_website IS NOT NULL AND company_website != '' AND company_website != '-'
            ORDER BY delivery_date DESC
          `

          const companiesResult = await client.query(searchQuery)
          console.log(`📊 Loaded ${companiesResult.rows.length} companies from database`)

          // ドメインベース重複除去
          const domainMap = new Map()

          companiesResult.rows.forEach(company => {
            const domain = extractDomain(company.company_website)
            const normalizedName = normalizeCompanyName(company.company_name)
            const key = domain || normalizedName

            if (!domainMap.has(key)) {
              domainMap.set(key, [])
            }
            domainMap.get(key).push(company)
          })

          // 各グループから最新のプレスリリースを選択
          const uniqueCompanies = Array.from(domainMap.values()).map(companyGroup => {
            const sortedCompanies = companyGroup.sort((a: any, b: any) =>
              new Date(b.delivery_date).getTime() - new Date(a.delivery_date).getTime()
            )
            return sortedCompanies[0]
          })

          COMPANIES_CACHE = uniqueCompanies
          console.log(`✅ Deduplicated to ${uniqueCompanies.length} unique companies`)

          // インデックス構築
          console.log('🔍 Building search indexes...')
          INDUSTRY_INDEX.clear()
          CAPITAL_INDEX.clear()
          LISTING_INDEX.clear()
          PRESS_TYPE_INDEX.clear()

          uniqueCompanies.forEach(company => {
            // 業種別インデックス
            if (company.business_category) {
              if (!INDUSTRY_INDEX.has(company.business_category)) {
                INDUSTRY_INDEX.set(company.business_category, [])
              }
              INDUSTRY_INDEX.get(company.business_category)!.push(company)
            }

            // 資本金別インデックス（1000万円単位）
            if (company.capital_amount_numeric) {
              const capitalRange = Math.floor(company.capital_amount_numeric / 10000) * 10000
              if (!CAPITAL_INDEX.has(capitalRange)) {
                CAPITAL_INDEX.set(capitalRange, [])
              }
              CAPITAL_INDEX.get(capitalRange)!.push(company)
            }

            // 上場区分別インデックス
            if (company.listing_status) {
              if (!LISTING_INDEX.has(company.listing_status)) {
                LISTING_INDEX.set(company.listing_status, [])
              }
              LISTING_INDEX.get(company.listing_status)!.push(company)
            }

            // プレスリリース種類別インデックス
            if (company.press_release_type) {
              if (!PRESS_TYPE_INDEX.has(company.press_release_type)) {
                PRESS_TYPE_INDEX.set(company.press_release_type, [])
              }
              PRESS_TYPE_INDEX.get(company.press_release_type)!.push(company)
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

    // キャッシュ初期化（必要に応じて）
    if (!CACHE_INITIALIZED) {
      await initializeCache()
    }

    // キャッシュが利用できない場合は従来の方法にフォールバック
    if (!CACHE_INITIALIZED) {
      console.warn('⚠️ Cache not available, falling back to database query')

      // フォールバック: 従来のデータベース検索
      const client = await pool.connect()
      try {
        const searchQuery = `
          SELECT *
          FROM prtimes_companies
          WHERE company_website IS NOT NULL AND company_website != '' AND company_website != '-'
          ORDER BY delivery_date DESC
          LIMIT 1000
        `

        const companiesResult = await client.query(searchQuery)
        const responseTime = Date.now() - startTime

        return NextResponse.json({
          companies: companiesResult.rows.slice(0, 50).map(row => ({
            id: row.id,
            deliveryDate: row.delivery_date,
            pressReleaseUrl: row.press_release_url,
            pressReleaseTitle: row.press_release_title,
            pressReleaseCategory1: row.press_release_category1,
            pressReleaseCategory2: row.press_release_category2,
            companyName: row.company_name,
            companyWebsite: row.company_website,
            industry: row.business_category,
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
            currentPage: 1,
            totalPages: Math.ceil(companiesResult.rows.length / 50),
            totalCount: companiesResult.rows.length,
            hasNextPage: companiesResult.rows.length > 50,
            hasPrevPage: false
          },
          _responseTime: responseTime,
          _cache: 'fallback'
        })
      } finally {
        client.release()
      }
    }

    // 高速フィルタリング（メモリ内検索）
    console.log('🔍 Starting fast search with filters:', body)

    let filteredCompanies = COMPANIES_CACHE

    // 会社名フィルタ
    if (companyName) {
      filteredCompanies = filteredCompanies.filter(company =>
        company.company_name.toLowerCase().includes(companyName.toLowerCase())
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
        company.capital_amount_numeric && company.capital_amount_numeric >= capitalMin
      )
    }

    if (capitalMax !== undefined && capitalMax > 0) {
      filteredCompanies = filteredCompanies.filter(company =>
        company.capital_amount_numeric && company.capital_amount_numeric <= capitalMax
      )
    }

    // 設立年フィルタ
    if (establishedYearMin !== undefined && establishedYearMin > 0) {
      filteredCompanies = filteredCompanies.filter(company =>
        company.established_year && company.established_year >= establishedYearMin
      )
    }

    if (establishedYearMax !== undefined && establishedYearMax > 0) {
      filteredCompanies = filteredCompanies.filter(company =>
        company.established_year && company.established_year <= establishedYearMax
      )
    }

    // 配信日フィルタ
    if (deliveryDateFrom) {
      const fromDate = new Date(deliveryDateFrom)
      filteredCompanies = filteredCompanies.filter(company =>
        company.delivery_date && new Date(company.delivery_date) >= fromDate
      )
    }

    if (deliveryDateTo) {
      const toDate = new Date(deliveryDateTo)
      filteredCompanies = filteredCompanies.filter(company =>
        company.delivery_date && new Date(company.delivery_date) <= toDate
      )
    }

    // ソート（配信日降順）
    filteredCompanies.sort((a: any, b: any) =>
      new Date(b.delivery_date).getTime() - new Date(a.delivery_date).getTime()
    )

    const totalCount = filteredCompanies.length

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
        deliveryDate: row.delivery_date,
        pressReleaseUrl: row.press_release_url,
        pressReleaseTitle: row.press_release_title,
        pressReleaseCategory1: row.press_release_category1,
        pressReleaseCategory2: row.press_release_category2,
        companyName: row.company_name,
        companyWebsite: row.company_website,
        industry: row.business_category,
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
        totalPages,
        totalCount,
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