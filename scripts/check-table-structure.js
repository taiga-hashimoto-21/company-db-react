const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function checkTableStructure() {
  const client = await pool.connect()

  try {
    // テーブル構造確認
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'companies'
      ORDER BY ordinal_position
    `)

    console.log('📊 Current companies table structure:')
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`)
    })

    // サンプルデータ確認
    const sampleResult = await client.query('SELECT * FROM companies LIMIT 1')
    console.log('\n📝 Sample data:')
    if (sampleResult.rows.length > 0) {
      console.log(JSON.stringify(sampleResult.rows[0], null, 2))
    } else {
      console.log('No data found')
    }

  } finally {
    client.release()
    process.exit(0)
  }
}

checkTableStructure().catch(console.error)