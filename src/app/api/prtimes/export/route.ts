import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      companyName,
      industry,
      pressReleaseCategory1,
      pressReleaseCategory2,
      listingStatus,
      capitalMin,
      capitalMax,
      establishedYearMin,
      establishedYearMax,
      deliveryDateFrom,
      deliveryDateTo
    } = body

    const conditions: string[] = []
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

    if (pressReleaseCategory1 && pressReleaseCategory1.length > 0) {
      conditions.push(`press_release_category1 = ANY($${paramIndex})`)
      params.push(pressReleaseCategory1)
      paramIndex++
    }

    if (pressReleaseCategory2 && pressReleaseCategory2.length > 0) {
      conditions.push(`press_release_category2 = ANY($${paramIndex})`)
      params.push(pressReleaseCategory2)
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    
    const client = await pool.connect()
    
    try {
      const query = `
        SELECT company_name, company_website 
        FROM prtimes_companies 
        ${whereClause}
        ORDER BY company_name ASC
      `
      
      const result = await client.query(query, params)
      
      const csvHeader = '会社名,ホームページURL\n'
      const csvRows = result.rows.map(row => 
        `"${row.company_name}","${row.company_website || ''}"`
      ).join('\n')
      
      const csvContent = csvHeader + csvRows
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `prtimes_export_${timestamp}.csv`
      
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('PR TIMES export error:', error)
    return NextResponse.json(
      { error: 'Failed to export PR TIMES data' },
      { status: 500 }
    )
  }
}