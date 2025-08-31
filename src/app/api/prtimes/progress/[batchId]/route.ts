import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params
    
    if (!batchId) {
      return NextResponse.json(
        { error: 'Batch ID is required' },
        { status: 400 }
      )
    }
    
    const client = await pool.connect()
    
    try {
      const result = await client.query(`
        SELECT 
          progress_count,
          total_records,
          success_records,
          error_records,
          status
        FROM prtimes_uploads 
        WHERE batch_id = $1
      `, [batchId])
      
      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Upload not found' },
          { status: 404 }
        )
      }
      
      const upload = result.rows[0]
      
      return NextResponse.json({
        processed: upload.progress_count || 0,
        total: upload.total_records || 0,
        success: upload.success_records || 0,
        errors: upload.error_records || 0,
        status: upload.status
      })
      
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Progress fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    )
  }
}