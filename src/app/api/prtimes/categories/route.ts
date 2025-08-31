import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function GET(request: NextRequest) {
  try {
    const client = await pool.connect()
    
    try {
      // 業種を取得 (business_categoryを使用)
      const industryResult = await client.query(`
        SELECT DISTINCT business_category as industry
        FROM prtimes_companies 
        WHERE business_category IS NOT NULL 
        AND business_category != ''
        ORDER BY business_category ASC
      `)
      
      // 上場区分を取得
      const listingResult = await client.query(`
        SELECT DISTINCT listing_status,
          CASE WHEN listing_status = '-' THEN 0 ELSE 1 END as sort_order
        FROM prtimes_companies 
        WHERE listing_status IS NOT NULL
        ORDER BY sort_order, listing_status ASC
      `)
      
      // プレスリリースカテゴリ1を取得
      const category1Result = await client.query(`
        SELECT DISTINCT press_release_category1,
          CASE WHEN press_release_category1 = '-' THEN 0 ELSE 1 END as sort_order
        FROM prtimes_companies 
        WHERE press_release_category1 IS NOT NULL
        ORDER BY sort_order, press_release_category1 ASC
      `)
      
      // プレスリリースカテゴリ2を取得
      const category2Result = await client.query(`
        SELECT DISTINCT press_release_category2,
          CASE WHEN press_release_category2 = '-' THEN 0 ELSE 1 END as sort_order
        FROM prtimes_companies 
        WHERE press_release_category2 IS NOT NULL
        ORDER BY sort_order, press_release_category2 ASC
      `)
      
      // プレスリリース種類を取得
      const pressTypeResult = await client.query(`
        SELECT DISTINCT press_release_type
        FROM prtimes_companies 
        WHERE press_release_type IS NOT NULL
        AND press_release_type != ''
        ORDER BY press_release_type ASC
      `)
      
      return NextResponse.json({
        industries: industryResult.rows.map(row => row.industry),
        listingStatuses: listingResult.rows.map(row => row.listing_status),
        pressReleaseTypes: pressTypeResult.rows.map(row => row.press_release_type),
        category1: category1Result.rows.map(row => row.press_release_category1),
        category2: category2Result.rows.map(row => row.press_release_category2)
      })
      
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