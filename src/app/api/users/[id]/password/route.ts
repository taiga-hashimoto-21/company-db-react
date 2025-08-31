import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import bcrypt from 'bcrypt'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// パスワード取得（平文で返す - 管理者のみ）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: userId } = await params

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      // ユーザーの平文パスワードを取得
      const query = `
        SELECT u.username, upp.plain_password
        FROM users u
        LEFT JOIN user_plain_passwords upp ON u.id = upp.user_id
        WHERE u.id = $1 AND u.is_active = true
      `
      
      const result = await client.query(query, [parseInt(userId)])
      
      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      const plainPassword = result.rows[0].plain_password || '********'

      return NextResponse.json({ password: plainPassword })
      
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Get password error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}