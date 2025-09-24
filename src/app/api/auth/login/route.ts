import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      // ユーザー情報を取得（パスワード確認はスキップ）
      const userQuery = `
        SELECT u.id, u.username, u.name, u.company_name, u.email, u.phone_number, u.type, u.is_active
        FROM users u
        WHERE u.username = $1 AND u.is_active = true
      `
      
      const userResult = await client.query(userQuery, [username])
      
      if (userResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Invalid username' },
          { status: 401 }
        )
      }

      const user = userResult.rows[0]

      // 無効化されたユーザーはログイン拒否
      if (user.type === 'disabled') {
        return NextResponse.json(
          { error: 'Account is disabled' },
          { status: 401 }
        )
      }
      
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          companyName: user.company_name,
          email: user.email,
          phoneNumber: user.phone_number,
          type: user.type
        }
      })
      
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}