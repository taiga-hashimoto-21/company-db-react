import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function POST(request: NextRequest) {
  // セキュリティ: 本番では認証が必要
  const authHeader = request.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.MIGRATION_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = await pool.connect()
    
    try {
      // マイグレーション実行
      await client.query(`
        ALTER TABLE prtimes_uploads ADD COLUMN IF NOT EXISTS progress_count INTEGER DEFAULT 0;
      `)
      
      // 既存レコードの更新
      await client.query(`
        UPDATE prtimes_uploads 
        SET progress_count = COALESCE(success_records, 0) + COALESCE(error_records, 0) 
        WHERE progress_count IS NULL OR progress_count = 0;
      `)
      
      return NextResponse.json({ 
        message: 'Migration completed successfully',
        timestamp: new Date().toISOString()
      })
      
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: error.message },
      { status: 500 }
    )
  }
}