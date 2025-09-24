import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import bcrypt from 'bcrypt'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// ユーザー情報取得
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
      const result = await client.query(
        'SELECT id, username, name, company_name, email, phone_number, type FROM users WHERE id = $1 AND is_active = true',
        [parseInt(userId)]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      const user = result.rows[0]

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
    console.error('Get user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ユーザー更新
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: userId } = await params
    const updates = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      // 現在のユーザー情報を取得
      const currentUser = await client.query(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [parseInt(userId)]
      )
      
      if (currentUser.rows.length === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      // 更新可能なフィールドのみを抽出
      const allowedUpdates = ['name', 'company_name', 'email', 'phone_number', 'type']
      const updateFields = []
      const updateValues = []
      let paramIndex = 2

      for (const [key, value] of Object.entries(updates)) {
        const dbField = key === 'companyName' ? 'company_name' 
                       : key === 'phoneNumber' ? 'phone_number'
                       : key
        
        if (allowedUpdates.includes(dbField)) {
          updateFields.push(`${dbField} = $${paramIndex}`)
          updateValues.push(value)
          paramIndex++
        }
      }

      if (updateFields.length === 0) {
        return NextResponse.json(
          { error: 'No valid fields to update' },
          { status: 400 }
        )
      }

      // type検証
      if (updates.type && !['admin', 'user', 'disabled'].includes(updates.type)) {
        return NextResponse.json(
          { error: 'Invalid user type' },
          { status: 400 }
        )
      }

      const updateQuery = `
        UPDATE users 
        SET ${updateFields.join(', ')}
        WHERE id = $1 AND is_active = true
        RETURNING id, username, name, company_name, email, phone_number, type
      `
      
      const result = await client.query(updateQuery, [parseInt(userId), ...updateValues])
      
      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Failed to update user' },
          { status: 500 }
        )
      }

      const updatedUser = result.rows[0]
      
      return NextResponse.json({
        success: true,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          name: updatedUser.name,
          companyName: updatedUser.company_name,
          email: updatedUser.email,
          phoneNumber: updatedUser.phone_number,
          type: updatedUser.type
        }
      })
      
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ユーザー削除（論理削除）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      const result = await client.query(
        'UPDATE users SET is_active = false WHERE id = $1 AND is_active = true RETURNING id',
        [parseInt(userId)]
      )
      
      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({ success: true })
      
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Delete user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// パスワード更新
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: userId } = await params
    const { password } = await request.json()

    if (!userId || !password) {
      return NextResponse.json(
        { error: 'User ID and password are required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      // ユーザー存在確認
      const userExists = await client.query(
        'SELECT id FROM users WHERE id = $1 AND is_active = true',
        [parseInt(userId)]
      )
      
      if (userExists.rows.length === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      // パスワードハッシュ化
      const saltRounds = 10
      const passwordHash = await bcrypt.hash(password, saltRounds)
      
      await client.query(
        'UPDATE user_passwords SET password_hash = $1 WHERE user_id = $2',
        [passwordHash, parseInt(userId)]
      )
      
      // 平文パスワードも更新
      await client.query(
        'UPDATE user_plain_passwords SET plain_password = $1 WHERE user_id = $2',
        [password, parseInt(userId)]
      )

      return NextResponse.json({ success: true })
      
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Update password error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}