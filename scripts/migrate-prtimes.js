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
      CREATE TABLE IF NOT EXISTS prtimes_data (
        id BIGSERIAL PRIMARY KEY,
        delivery_date TIMESTAMP WITH TIME ZONE NOT NULL,
        press_release_url VARCHAR(1000) NOT NULL,
        press_release_title TEXT NOT NULL,
        press_release_type VARCHAR(100),
        press_release_category2 VARCHAR(100),
        company_name VARCHAR(255) NOT NULL,
        company_website VARCHAR(1000),
        business_category VARCHAR(100),
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

    console.log('Creating PR TIMES upload history table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS prtimes_uploads (
        id BIGSERIAL PRIMARY KEY,
        batch_id UUID DEFAULT gen_random_uuid(),
        filename VARCHAR(255) NOT NULL,
        total_records INTEGER NOT NULL DEFAULT 0,
        successful_records INTEGER DEFAULT 0,
        failed_records INTEGER DEFAULT 0,
        file_size_kb INTEGER,
        uploaded_by VARCHAR(100),
        status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
    
    console.log('Creating indexes...')
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_prtimes_company_name ON prtimes_data(company_name)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_business_category ON prtimes_data(business_category)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_capital_amount ON prtimes_data(capital_amount_numeric)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_established_year ON prtimes_data(established_year)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_established_month ON prtimes_data(established_month)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_delivery_date ON prtimes_data(delivery_date)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_listing_status ON prtimes_data(listing_status)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_press_type ON prtimes_data(press_release_type)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_press_category2 ON prtimes_data(press_release_category2)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_capital_year ON prtimes_data(capital_amount_numeric, established_year)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_business_capital ON prtimes_data(business_category, capital_amount_numeric)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_categories_type ON prtimes_categories(category_type)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_categories_active ON prtimes_categories(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_uploads_status ON prtimes_uploads(status)',
      'CREATE INDEX IF NOT EXISTS idx_prtimes_uploads_created ON prtimes_uploads(created_at)'
    ]
    
    for (const indexQuery of indexes) {
      await client.query(indexQuery)
    }
    
    console.log('Creating update function and triggers...')
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_prtimes_data_updated_at ON prtimes_data
    `)
    await client.query(`
      CREATE TRIGGER update_prtimes_data_updated_at 
      BEFORE UPDATE ON prtimes_data 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `)
    
    await client.query(`
      CREATE TRIGGER update_prtimes_uploads_updated_at 
      BEFORE UPDATE ON prtimes_uploads 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `)
    
    console.log('Creating PR TIMES statistics view...')
    await client.query(`
      DROP VIEW IF EXISTS prtimes_stats
    `)
    await client.query(`
      CREATE VIEW prtimes_stats AS
      SELECT 
        business_category,
        COUNT(*) as company_count,
        AVG(capital_amount_numeric) as avg_capital,
        MIN(established_year) as oldest_year,
        MAX(established_year) as newest_year
      FROM prtimes_data 
      WHERE business_category IS NOT NULL
      GROUP BY business_category
      ORDER BY company_count DESC
    `)
    
    await client.query('COMMIT')
    
    console.log('✅ PR TIMES database migration completed successfully!')
    
    const companyCount = await client.query('SELECT COUNT(*) FROM prtimes_data')
    const categoryCount = await client.query('SELECT COUNT(*) FROM prtimes_categories')
    const uploadCount = await client.query('SELECT COUNT(*) FROM prtimes_uploads')
    
    console.log(`📊 Current data:`)
    console.log(`   - Companies: ${companyCount.rows[0].count}`)
    console.log(`   - Categories: ${categoryCount.rows[0].count}`)
    console.log(`   - Upload History: ${uploadCount.rows[0].count}`)
    
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