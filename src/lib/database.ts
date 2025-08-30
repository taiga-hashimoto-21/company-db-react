import { Pool, PoolClient } from 'pg'
import { Corporate } from '@/types/corporate'

// PostgreSQL接続設定
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'company_db',
  password: process.env.POSTGRES_PASSWORD || 'password',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  max: 20, // 最大接続数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// 接続テスト
pool.on('connect', () => {
  console.log('✅ PostgreSQL connected')
})

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err)
})

// 高パフォーマンス企業検索（1200万社対応）- 高度な絞り込み対応
export async function searchCompanies(params: {
  industries?: string[]
  prefectures?: string[]
  capitalMin?: number
  capitalMax?: number
  employeesMin?: number
  employeesMax?: number
  establishedYearMin?: number
  establishedYearMax?: number
  page?: number
  limit?: number
  companyName?: string
  establishedDateStart?: string
  establishedDateEnd?: string
}): Promise<{
  companies: Corporate[]
  totalCount: number
}> {
  const client = await pool.connect()
  
  try {
    const {
      industries,
      prefectures,
      capitalMin,
      capitalMax,
      employeesMin,
      employeesMax,
      establishedYearMin,
      establishedYearMax,
      page = 1,
      limit = 100,
      companyName,
      establishedDateStart,
      establishedDateEnd
    } = params

    // SQLクエリ構築（インデックス最適化）
    let whereConditions: string[] = []
    let queryParams: any[] = []
    let paramIndex = 1

    // 業種フィルター（高速インデックス使用）
    if (industries && industries.length > 0) {
      whereConditions.push(`industry = ANY($${paramIndex})`)
      queryParams.push(industries)
      paramIndex++
    }

    // 都道府県フィルター
    if (prefectures && prefectures.length > 0) {
      whereConditions.push(`prefecture = ANY($${paramIndex})`)
      queryParams.push(prefectures)
      paramIndex++
    }

    // 資本金フィルター（万円を円に変換）
    if (capitalMin !== undefined && capitalMin > 0) {
      whereConditions.push(`capital_amount >= $${paramIndex}`)
      queryParams.push(capitalMin * 10000)
      paramIndex++
    }
    if (capitalMax !== undefined && capitalMax > 0) {
      whereConditions.push(`capital_amount <= $${paramIndex}`)
      queryParams.push(capitalMax * 10000)
      paramIndex++
    }

    // 従業員数フィルター
    if (employeesMin !== undefined && employeesMin > 0) {
      whereConditions.push(`employee_count >= $${paramIndex}`)
      queryParams.push(employeesMin)
      paramIndex++
    }
    if (employeesMax !== undefined && employeesMax > 0) {
      whereConditions.push(`employee_count <= $${paramIndex}`)
      queryParams.push(employeesMax)
      paramIndex++
    }

    // 設立年フィルター
    if (establishedYearMin !== undefined && establishedYearMin > 0) {
      whereConditions.push(`EXTRACT(YEAR FROM established_date) >= $${paramIndex}`)
      queryParams.push(establishedYearMin)
      paramIndex++
    }
    if (establishedYearMax !== undefined && establishedYearMax > 0) {
      whereConditions.push(`EXTRACT(YEAR FROM established_date) <= $${paramIndex}`)
      queryParams.push(establishedYearMax)
      paramIndex++
    }

    // 企業名フィルター（トライグラム検索）
    if (companyName) {
      whereConditions.push(`company_name ILIKE $${paramIndex}`)
      queryParams.push(`%${companyName}%`)
      paramIndex++
    }

    // 設立日フィルター
    if (establishedDateStart) {
      whereConditions.push(`established_date >= $${paramIndex}`)
      queryParams.push(establishedDateStart)
      paramIndex++
    }
    if (establishedDateEnd) {
      whereConditions.push(`established_date <= $${paramIndex}`)
      queryParams.push(establishedDateEnd)
      paramIndex++
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : ''

    // カウントクエリ（統計用）
    const countQuery = `
      SELECT COUNT(*) as total
      FROM companies 
      ${whereClause}
    `

    // データ取得クエリ（ページネーション付き）- 新しいフィールド対応
    const offset = (page - 1) * limit
    const dataQuery = `
      SELECT 
        id, company_name, established_date, postal_code, 
        address, industry, website, capital_amount, employee_count, prefecture,
        created_at, updated_at
      FROM companies 
      ${whereClause}
      ORDER BY company_name 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    // パラメータ追加
    const dataParams = [...queryParams, limit, offset]

    // 並列実行でパフォーマンス向上
    const [countResult, dataResult] = await Promise.all([
      client.query(countQuery, queryParams),
      client.query(dataQuery, dataParams)
    ])

    const totalCount = parseInt(countResult.rows[0].total)
    
    const companies: Corporate[] = dataResult.rows.map(row => ({
      id: row.id,
      companyName: row.company_name,
      establishedDate: row.established_date,
      postalCode: row.postal_code || '',
      address: row.address,
      industry: row.industry,
      website: row.website,
      capitalAmount: row.capital_amount,
      employeeCount: row.employee_count,
      prefecture: row.prefecture,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))

    return { companies, totalCount }

  } finally {
    client.release()
  }
}

// 企業作成（管理者用）
export async function createCompany(companyData: Omit<Corporate, 'id' | 'createdAt' | 'updatedAt'>): Promise<Corporate> {
  const client = await pool.connect()
  
  try {
    const query = `
      INSERT INTO companies (company_name, established_date, postal_code, address, industry, website)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, company_name, established_date, postal_code, address, industry, website, created_at, updated_at
    `
    
    const values = [
      companyData.companyName,
      companyData.establishedDate,
      companyData.postalCode || null,
      companyData.address,
      companyData.industry,
      companyData.website || null
    ]

    const result = await client.query(query, values)
    const row = result.rows[0]

    return {
      id: row.id,
      companyName: row.company_name,
      establishedDate: row.established_date,
      postalCode: row.postal_code || '',
      address: row.address,
      industry: row.industry,
      website: row.website,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }

  } finally {
    client.release()
  }
}

// 企業削除（管理者用）
export async function deleteCompany(companyId: number): Promise<boolean> {
  const client = await pool.connect()
  
  try {
    const query = 'DELETE FROM companies WHERE id = $1'
    const result = await client.query(query, [companyId])
    return result.rowCount > 0

  } finally {
    client.release()
  }
}

// 統計情報取得（ダッシュボード用）
export async function getCompanyStats(): Promise<{
  totalCompanies: number
  industryBreakdown: Array<{ industry: string; company_count: number }>
}> {
  const client = await pool.connect()
  
  try {
    const [totalResult, industryResult] = await Promise.all([
      client.query('SELECT COUNT(*) as total FROM companies'),
      client.query(`
        SELECT industry, COUNT(*) as company_count
        FROM companies 
        GROUP BY industry 
        ORDER BY company_count DESC
      `)
    ])

    return {
      totalCompanies: parseInt(totalResult.rows[0].total),
      industryBreakdown: industryResult.rows.map(row => ({
        industry: row.industry,
        company_count: parseInt(row.company_count)
      }))
    }

  } finally {
    client.release()
  }
}

// データベース初期化（開発用）
export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect()
  
  try {
    // テーブル作成
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id BIGSERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        established_date DATE NOT NULL,
        postal_code VARCHAR(10),
        address TEXT NOT NULL,
        industry VARCHAR(50) NOT NULL,
        website VARCHAR(500),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)

    // 高速検索用インデックス作成
    await client.query('CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(industry)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_companies_company_name ON companies USING gin(company_name gin_trgm_ops)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_companies_established_date ON companies(established_date)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_companies_industry_date ON companies(industry, established_date)')

    // トライグラム拡張の有効化
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')

    console.log('✅ Database initialized with indexes for 12M companies')

  } finally {
    client.release()
  }
}

export { pool }