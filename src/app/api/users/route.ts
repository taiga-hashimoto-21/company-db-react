import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import bcrypt from 'bcrypt'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// 全ユーザー取得
export async function GET(request: NextRequest) {
  try {
    const client = await pool.connect()
    
    try {
      const query = `
        SELECT u.id, u.username, u.name, u.company_name, u.email, u.phone_number, u.type, u.is_active, u.created_at
        FROM users u
        WHERE u.is_active = true
        ORDER BY u.created_at DESC
      `
      
      const result = await client.query(query)
      
      const users = result.rows.map(row => ({
        id: row.id,
        username: row.username,
        name: row.name,
        companyName: row.company_name,
        email: row.email,
        phoneNumber: row.phone_number,
        type: row.type,
        createdAt: row.created_at
      }))
      
      return NextResponse.json({ users })
      
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Get users error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// 新規ユーザー作成
export async function POST(request: NextRequest) {
  try {
    const { username, name, companyName, email, phoneNumber, type, password } = await request.json()

    if (!username || !name || !password || !type) {
      return NextResponse.json(
        { error: 'Required fields are missing' },
        { status: 400 }
      )
    }

    if (!['admin', 'user', 'disabled'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid user type' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')
      
      // ユーザー名重複チェック
      const existingUser = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      )
      
      if (existingUser.rows.length > 0) {
        return NextResponse.json(
          { error: 'Username already exists' },
          { status: 409 }
        )
      }
      
      // ユーザー作成
      const userInsert = await client.query(`
        INSERT INTO users (username, name, company_name, email, phone_number, type)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [username, name, companyName || '', email || '', phoneNumber || '', type])
      
      const userId = userInsert.rows[0].id
      
      // パスワードハッシュ化して保存
      const saltRounds = 10
      const passwordHash = await bcrypt.hash(password, saltRounds)
      
      await client.query(
        'INSERT INTO user_passwords (user_id, password_hash) VALUES ($1, $2)',
        [userId, passwordHash]
      )
      
      // 平文パスワードも保存（管理画面での表示用）
      await client.query(
        'INSERT INTO user_plain_passwords (user_id, plain_password) VALUES ($1, $2)',
        [userId, password]
      )
      
      await client.query('COMMIT')
      
      return NextResponse.json({
        success: true,
        user: {
          id: userId,
          username,
          name,
          companyName: companyName || '',
          email: email || '',
          phoneNumber: phoneNumber || '',
          type
        }
      })
      
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}