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
    
    const client = await pool.connect()
    
    try {
      const countQuery = `SELECT COUNT(*) FROM (SELECT DISTINCT company_name, company_website FROM prtimes_companies ${whereClause}) AS distinct_companies`
      const countResult = await client.query(countQuery, params)
      const totalCount = parseInt(countResult.rows[0].count)
      
      const searchQuery = `
        SELECT DISTINCT ON (company_name, company_website) * 
        FROM prtimes_companies 
        ${whereClause}
        ORDER BY company_name, company_website, delivery_date DESC 
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `
      
      const searchParams = [...params, actualLimit, offset]
      const companiesResult = await client.query(searchQuery, searchParams)
      
      const totalPages = Math.ceil(totalCount / actualLimit)
      const responseTime = Date.now() - startTime
      
      return NextResponse.json({
        companies: companiesResult.rows.map(row => ({
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