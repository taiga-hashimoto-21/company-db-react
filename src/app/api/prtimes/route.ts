import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    const client = await pool.connect()
    
    try {
      // 全件数とユニーク企業数を並列取得
      const [totalResult, uniqueResult] = await Promise.all([
        client.query('SELECT COUNT(*) as total FROM prtimes_companies'),
        client.query(`
          SELECT COUNT(DISTINCT
            CASE
              WHEN company_website ~ '^https?://' THEN
                regexp_replace(
                  regexp_replace(company_website, '^https?://', ''),
                  '/.*$', ''
                )
              ELSE company_website
            END
          ) as unique
          FROM prtimes_companies
          WHERE company_website IS NOT NULL
          AND company_website != ''
          AND company_website != '-'
        `)
      ])

      const totalCount = parseInt(totalResult.rows[0].total)
      const uniqueCount = parseInt(uniqueResult.rows[0].unique)

      console.log('🔍 Debug - totalResult:', totalResult.rows[0])
      console.log('🔍 Debug - uniqueResult:', uniqueResult.rows[0])
      console.log('🔍 Debug - totalCount:', totalCount)
      console.log('🔍 Debug - uniqueCount:', uniqueCount)
      
      const companiesResult = await client.query(
        `SELECT * FROM prtimes_companies 
         ORDER BY delivery_date DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      )
      
      const totalPages = Math.ceil(totalCount / limit)
      
      return NextResponse.json({
        companies: companiesResult.rows.map(row => ({
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
          totalPages,
          totalCount,
          uniqueCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('PR TIMES companies fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch PR TIMES companies' },
      { status: 500 }
    )
  }
}