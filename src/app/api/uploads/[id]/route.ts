import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: uploadId } = await params
    
    if (!uploadId) {
      return NextResponse.json({ error: 'Upload ID is required' }, { status: 400 })
    }

    const client = await pool.connect()
    
    try {
      // トランザクション開始
      await client.query('BEGIN')
      
      // アップロード履歴から該当するbatch_idを取得
      const uploadResult = await client.query(
        'SELECT batch_id FROM prtimes_uploads WHERE id = $1',
        [uploadId]
      )
      
      if (uploadResult.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
      }
      
      const batchId = uploadResult.rows[0].batch_id
      
      // PR TIMESデータを削除（upload_batch_idベース）
      const deleteDataResult = await client.query(
        'DELETE FROM prtimes_companies WHERE upload_batch_id = $1',
        [batchId]
      )
      
      // カテゴリデータは削除しない（他のアップロードでも使用されている可能性があるため）
      
      // アップロード履歴を削除
      await client.query(
        'DELETE FROM prtimes_uploads WHERE id = $1',
        [uploadId]
      )
      
      // コミット
      await client.query('COMMIT')
      
      return NextResponse.json({
        message: 'Upload data deleted successfully',
        deletedRecords: deleteDataResult.rowCount
      })
      
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    
  } catch (error) {
    console.error('Delete upload data error:', error)
    return NextResponse.json(
      { error: 'Failed to delete upload data' },
      { status: 500 }
    )
  }
}