const { Pool } = require('pg')
const fs = require('fs').promises

async function migratePRTimesDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  })

  let client
  
  try {
    client = await pool.connect()
    
    console.log('Starting PR TIMES database migration...')
    
    await client.query('BEGIN')
    
    console.log('Creating PR TIMES companies table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS prtimes_companies (
        id BIGSERIAL PRIMARY KEY,
        delivery_date TIMESTAMP WITH TIME ZONE NOT NULL,
        press_release_url VARCHAR(1000) NOT NULL,
        press_release_title TEXT NOT NULL,
        press_release_category1 VARCHAR(100),
        press_release_category2 VARCHAR(100),
        company_name VARCHAR(255) NOT NULL,
        company_website VARCHAR(1000),
        industry VARCHAR(100),
        address TEXT,
        phone_number VARCHAR(50),
        representative VARCHAR(100),
        listing_status VARCHAR(50),
        capital_amount_text VARCHAR(100),
        established_date_text VARCHAR(50),
        capital_amount_numeric INTEGER,
        established_year INTEGER,
        established_month INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
    
    console.log('Creating PR TIMES categories table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS prtimes_categories (
        id SERIAL PRIMARY KEY,
        category_type VARCHAR(20) NOT NULL CHECK (category_type IN ('category1', 'category2', 'industry', 'listing_status')),
        category_name VARCHAR(100) NOT NULL,
        usage_count INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(category_type, category_name)
      )
    `)
    
    console.log('Creating indexes...')
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_prtimes_company_name ON prtimes_companies USING gin(company_name gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_industry ON prtimes_companies(industry)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_capital_amount ON prtimes_companies(capital_amount_numeric)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_established_year ON prtimes_companies(established_year)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_established_month ON prtimes_companies(established_month)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_delivery_date ON prtimes_companies(delivery_date)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_listing_status ON prtimes_companies(listing_status)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_press_category1 ON prtimes_companies(press_release_category1)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_press_category2 ON prtimes_companies(press_release_category2)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_capital_year ON prtimes_companies(capital_amount_numeric, established_year)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_industry_capital ON prtimes_companies(industry, capital_amount_numeric)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_categories_type ON prtimes_categories(category_type)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_categories_active ON prtimes_categories(is_active)'
    ]
    
    for (const indexQuery of indexes) {
      await client.query(indexQuery)
    }
    
    console.log('Creating triggers...')
    await client.query(`
      DROP TRIGGER IF EXISTS update_prtimes_companies_updated_at ON prtimes_companies
    `)
    await client.query(`
      CREATE TRIGGER update_prtimes_companies_updated_at 
      BEFORE UPDATE ON prtimes_companies 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `)
    
    console.log('Creating PR TIMES statistics view...')
    await client.query(`
      DROP VIEW IF EXISTS prtimes_stats
    `)
    await client.query(`
      CREATE VIEW prtimes_stats AS
      SELECT 
        industry,
        COUNT(*) as company_count,
        AVG(capital_amount_numeric) as avg_capital,
        MIN(established_year) as oldest_year,
        MAX(established_year) as newest_year
      FROM prtimes_companies 
      WHERE industry IS NOT NULL
      GROUP BY industry
      ORDER BY company_count DESC
    `)
    
    await client.query('COMMIT')
    
    console.log('✅ PR TIMES database migration completed successfully!')
    
    const companyCount = await client.query('SELECT COUNT(*) FROM prtimes_companies')
    const categoryCount = await client.query('SELECT COUNT(*) FROM prtimes_categories')
    
    console.log(`📊 Current data:`)
    console.log(`   - Companies: ${companyCount.rows[0].count}`)
    console.log(`   - Categories: ${categoryCount.rows[0].count}`)
    
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    if (client) {
      client.release()
    }
    await pool.end()
  }
}

if (require.main === module) {
  migratePRTimesDatabase().catch(console.error)
}

module.exports = { migratePRTimesDatabase }