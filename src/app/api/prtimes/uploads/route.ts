import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function GET() {
  try {
    const client = await pool.connect()
    
    try {
      const result = await client.query(`
        SELECT id, filename, upload_date, total_records, success_records, 
               error_records, file_size_kb, uploaded_by, batch_id, status
        FROM prtimes_uploads
        ORDER BY upload_date DESC
        LIMIT 50
      `)
      
      return NextResponse.json({
        uploads: result.rows.map(row => ({
          id: row.id,
          filename: row.filename,
          uploadDate: row.upload_date,
          totalRecords: row.total_records,
          successRecords: row.success_records,
          errorRecords: row.error_records,
          fileSizeKb: row.file_size_kb,
          uploadedBy: row.uploaded_by,
          batchId: row.batch_id,
          status: row.status
        }))
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Upload history fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch upload history' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const batchId = searchParams.get('batchId')
    
    if (!batchId) {
      return NextResponse.json(
        { error: 'Batch ID is required' },
        { status: 400 }
      )
    }
    
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')
      
      // バッチに関連するデータを削除
      const companiesResult = await client.query(
        'DELETE FROM prtimes_companies WHERE batch_id = $1',
        [batchId]
      )
      
      const uploadsResult = await client.query(
        'DELETE FROM prtimes_uploads WHERE batch_id = $1',
        [batchId]
      )
      
      await client.query('COMMIT')
      
      return NextResponse.json({
        message: 'Upload batch deleted successfully',
        deletedCompanies: companiesResult.rowCount || 0,
        deletedUploads: uploadsResult.rowCount || 0
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Upload batch delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete upload batch' },
      { status: 500 }
    )
  }
}