import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

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
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (companyName) {
      conditions.push(`company_name ILIKE $${paramIndex}`)
      params.push(`%${companyName}%`)
      paramIndex++
    }

    if (industry && industry.length > 0) {
      conditions.push(`business_category = ANY($${paramIndex})`)
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
      params.push(deliveryDateFrom)
      paramIndex++
    }

    if (deliveryDateTo) {
      conditions.push(`delivery_date <= $${paramIndex}`)
      params.push(deliveryDateTo)
      paramIndex++
    }

    // ホームページURLが有効なデータのみを取得する条件を追加
    conditions.push(`company_website IS NOT NULL AND company_website != '' AND company_website != '-'`)
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`
    
    // ドメイン抽出関数
    function extractDomain(url) {
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
    function normalizeCompanyName(name) {
      if (!name || !name.trim()) return 'no-name'
      return name.trim()
        .toLowerCase()
        .replace(/株式会社|（株）|\(株\)|有限会社|合同会社|co\.,ltd\.|ltd\.|inc\.|corp\./g, '')
        .replace(/\s+/g, '')
    }

    const client = await pool.connect()

    try {
      // 全データを取得してJavaScript側で重複除去
      const searchQuery = `
        SELECT *
        FROM prtimes_companies
        ${whereClause}
        ORDER BY delivery_date DESC
      `

      const companiesResult = await client.query(searchQuery, params)

      // ドメインベース重複除去
      const domainMap = new Map()

      companiesResult.rows.forEach(company => {
        const domain = extractDomain(company.company_website)
        const normalizedName = normalizeCompanyName(company.company_name)

        // ドメインがある場合はドメインをキーに、ない場合は正規化した会社名をキーに
        const key = domain || normalizedName

        if (!domainMap.has(key)) {
          domainMap.set(key, [])
        }
        domainMap.get(key).push(company)
      })

      // 各グループから最新のプレスリリースを選択
      const uniqueCompanies = Array.from(domainMap.values()).map(companyGroup => {
        const sortedCompanies = companyGroup.sort((a, b) =>
          new Date(b.delivery_date).getTime() - new Date(a.delivery_date).getTime()
        )
        return sortedCompanies[0]
      })

      const totalCount = uniqueCompanies.length

      // ページネーション処理
      const startIndex = exportAll ? 0 : offset
      const endIndex = exportAll ? uniqueCompanies.length : offset + actualLimit
      const paginatedCompanies = uniqueCompanies.slice(startIndex, endIndex)
      
      const totalPages = Math.ceil(totalCount / actualLimit)
      const responseTime = Date.now() - startTime

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
        _cache: 'miss'
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('PR TIMES search error:', error)
    return NextResponse.json(
      { error: 'Failed to search PR TIMES companies' },
      { status: 500 }
    )
  }
}