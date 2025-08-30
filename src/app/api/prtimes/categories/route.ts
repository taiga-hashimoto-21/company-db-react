import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const categoryType = searchParams.get('type')
    
    const client = await pool.connect()
    
    try {
      let query: string
      let params: any[] = []
      
      if (categoryType) {
        query = `
          SELECT DISTINCT category_name, usage_count 
          FROM prtimes_categories 
          WHERE category_type = $1 AND is_active = true
          ORDER BY 
            CASE WHEN category_name = '-' THEN 0 ELSE 1 END,
            usage_count DESC, 
            category_name ASC
        `
        params = [categoryType]
      } else {
        query = `
          SELECT category_type, category_name, usage_count 
          FROM prtimes_categories 
          WHERE is_active = true
          ORDER BY 
            category_type,
            CASE WHEN category_name = '-' THEN 0 ELSE 1 END,
            usage_count DESC, 
            category_name ASC
        `
      }
      
      const result = await client.query(query, params)
      
      if (categoryType) {
        return NextResponse.json({
          categories: result.rows.map(row => row.category_name)
        })
      } else {
        const categorizedData: Record<string, string[]> = {}
        result.rows.forEach(row => {
          if (!categorizedData[row.category_type]) {
            categorizedData[row.category_type] = []
          }
          categorizedData[row.category_type].push(row.category_name)
        })
        
        return NextResponse.json(categorizedData)
      }
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('PR TIMES categories fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch PR TIMES categories' },
      { status: 500 }
    )
  }
}