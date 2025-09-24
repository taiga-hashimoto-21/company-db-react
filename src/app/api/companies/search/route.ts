import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      companyName = '',
      prefecture = [],
      industry = [],
      employeesMin,
      employeesMax,
      capitalMin,
      capitalMax,
      establishedYearMin,
      establishedYearMax,
      page = 1,
      tableOnly = false,
      exportAll = false,
      countOnly = false
    } = body

    const limit = exportAll ? 100000 : tableOnly ? 50 : 100000
    const offset = (page - 1) * limit

    // クエリ条件を構築
    const conditions = []
    const params = []
    let paramIndex = 1

    // 会社名検索
    if (companyName && companyName.trim()) {
      conditions.push(`company_name ILIKE $${paramIndex}`)
      params.push(`%${companyName.trim()}%`)
      paramIndex++
    }

    // 都道府県フィルター
    if (prefecture && prefecture.length > 0) {
      conditions.push(`prefecture = ANY($${paramIndex})`)
      params.push(prefecture)
      paramIndex++
    }

    // 業界フィルター
    if (industry && industry.length > 0) {
      conditions.push(`industry = ANY($${paramIndex})`)
      params.push(industry)
      paramIndex++
    }

    // 従業員数範囲
    if (employeesMin !== undefined) {
      conditions.push(`employee_count >= $${paramIndex}`)
      params.push(employeesMin)
      paramIndex++
    }
    if (employeesMax !== undefined) {
      conditions.push(`employee_count <= $${paramIndex}`)
      params.push(employeesMax)
      paramIndex++
    }

    // 資本金範囲（万円単位で受け取って実際は円単位で検索）
    if (capitalMin !== undefined) {
      conditions.push(`capital_amount >= $${paramIndex}`)
      params.push(capitalMin * 10000) // 万円を円に変換
      paramIndex++
    }
    if (capitalMax !== undefined) {
      conditions.push(`capital_amount <= $${paramIndex}`)
      params.push(capitalMax * 10000) // 万円を円に変換
      paramIndex++
    }

    // 設立年範囲
    if (establishedYearMin !== undefined) {
      conditions.push(`EXTRACT(YEAR FROM established_date) >= $${paramIndex}`)
      params.push(establishedYearMin)
      paramIndex++
    }
    if (establishedYearMax !== undefined) {
      conditions.push(`EXTRACT(YEAR FROM established_date) <= $${paramIndex}`)
      params.push(establishedYearMax)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // カウントクエリ
    const countQuery = `
      SELECT COUNT(*) as total
      FROM companies
      ${whereClause}
    `

    const countParams = params.slice() // 現在のパラメータをコピー

    // countOnlyの場合は件数のみ返す
    if (countOnly) {
      const countResult = await pool.query(countQuery, countParams)
      const totalCount = parseInt(countResult.rows[0].total)

      return NextResponse.json({
        companies: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount,
          hasNextPage: false,
          hasPrevPage: false
        },
        _responseTime: Date.now() - Date.now(),
        _cache: 'miss'
      })
    }

    // メインクエリ
    const query = `
      SELECT
        id,
        company_name as "companyName",
        website as "companyWebsite",
        address,
        prefecture,
        industry,
        employee_count as "employees",
        capital_amount as "capital",
        EXTRACT(YEAR FROM established_date) as "establishedYear",
        established_date as "establishedDate",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM companies
      ${whereClause}
      ORDER BY company_name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    params.push(limit, offset)

    const [companiesResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ])

    const companies = companiesResult.rows.map(row => ({
      ...row,
      representative: null, // PRTimesとは異なり代表者情報は持たない
      capital: row.capital ? Math.floor(row.capital / 10000) : null // 円を万円に変換
    }))

    const totalCount = parseInt(countResult.rows[0].total)
    const totalPages = Math.ceil(totalCount / limit)

    const pagination = {
      currentPage: page,
      totalPages,
      totalCount,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }

    return NextResponse.json({
      companies,
      pagination,
      _responseTime: Date.now() - Date.now(), // 簡易的な応答時間
      _cache: 'miss' // 簡易的なキャッシュ状態
    })

  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

