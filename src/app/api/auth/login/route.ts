import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import bcrypt from 'bcrypt'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      // ユーザー情報を取得
      const userQuery = `
        SELECT u.id, u.username, u.name, u.company_name, u.email, u.phone_number, u.type, u.is_active,
               up.password_hash
        FROM users u
        JOIN user_passwords up ON u.id = up.user_id
        WHERE u.username = $1 AND u.is_active = true
      `
      
      const userResult = await client.query(userQuery, [username])
      
      if (userResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Invalid username or password' },
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

      // パスワード検証
      const passwordValid = await bcrypt.compare(password, user.password_hash)
      
      if (!passwordValid) {
        return NextResponse.json(
          { error: 'Invalid username or password' },
          { status: 401 }
        )
      }

      // パスワードハッシュを除外してレスポンス
      const { password_hash, ...userResponse } = user
      
      return NextResponse.json({
        success: true,
        user: {
          id: userResponse.id,
          username: userResponse.username,
          name: userResponse.name,
          companyName: userResponse.company_name,
          email: userResponse.email,
          phoneNumber: userResponse.phone_number,
          type: userResponse.type
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