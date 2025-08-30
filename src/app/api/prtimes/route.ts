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
      const countResult = await client.query(
        'SELECT COUNT(*) FROM prtimes_companies'
      )
      const totalCount = parseInt(countResult.rows[0].count)
      
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
          pressReleaseCategory1: row.press_release_category1,
          pressReleaseCategory2: row.press_release_category2,
          companyName: row.company_name,
          companyWebsite: row.company_website,
          industry: row.industry,
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