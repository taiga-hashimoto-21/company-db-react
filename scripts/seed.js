const { Pool } = require('pg')
const bcrypt = require('bcrypt')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function seed() {
  const client = await pool.connect()
  
  try {
    console.log('Starting database seeding...')
    
    // デフォルト管理者ユーザーの作成
    const hashedPassword = await bcrypt.hash('admin123', 10)
    
    // ユーザーが既に存在するかチェック
    const existingUser = await client.query(
      'SELECT id FROM users WHERE username = $1',
      ['admin']
    )
    
    if (existingUser.rows.length > 0) {
      console.log('Admin user already exists, updating password...')
      
      // パスワードを更新
      await client.query(
        'UPDATE user_passwords SET password_hash = $1 WHERE user_id = $2',
        [hashedPassword, existingUser.rows[0].id]
      )
      
      console.log('Admin password updated successfully')
    } else {
      console.log('Creating admin user...')
      
      // 新しい管理者ユーザーを作成
      const userResult = await client.query(`
        INSERT INTO users (username, name, company_name, email, phone_number, type, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, ['admin', 'システム管理者', '管理会社', 'admin@example.com', '000-0000-0000', 'admin', true])
      
      const userId = userResult.rows[0].id
      
      // パスワードを挿入
      await client.query(`
        INSERT INTO user_passwords (user_id, password_hash)
        VALUES ($1, $2)
      `, [userId, hashedPassword])
      
      console.log('Admin user created successfully')
    }
    
    console.log('Database seeding completed!')
    console.log('Admin credentials: admin / admin123')
    
  } catch (error) {
    console.error('Error seeding database:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seeding finished successfully')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Seeding failed:', error)
      process.exit(1)
    })
}

module.exports = seed