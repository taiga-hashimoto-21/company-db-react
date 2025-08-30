import { NextRequest, NextResponse } from 'next/server'
import { CorporateSearchResponse, Corporate } from '@/types/corporate'
import { searchCompanies, getCompanyStats } from '@/lib/database'

// Redis風キャッシュ（本格運用時はRedisに置き換え）
const CACHE_TTL = 300 // 5分間キャッシュ
const cache = new Map<string, { data: CorporateSearchResponse; timestamp: number }>()

// フォールバック用デフォルトデータ（PostgreSQL接続失敗時）
const getDefaultCompanies = (): Corporate[] => {
  return [
    {
      id: 1,
      companyName: '株式会社テックイノベーション',
      establishedDate: '2015-04-15',
      postalCode: '100-0001',
      address: '東京都千代田区大手町1-1-1',
      industry: 'IT・通信',
      website: 'https://tech-innovation.co.jp'
    },
    {
      id: 2,
      companyName: '大阪製造株式会社',
      establishedDate: '1985-09-20',
      postalCode: '530-0001',
      address: '大阪府大阪市北区梅田3-3-3',
      industry: '製造業',
      website: 'https://osaka-seizo.co.jp'
    },
    {
      id: 3,
      companyName: 'グローバル商事株式会社',
      establishedDate: '1995-12-10',
      postalCode: '220-0011',
      address: '神奈川県横浜市西区みなとみらい2-2-2',
      industry: '商社・流通',
      website: 'https://global-shoji.com'
    },
    {
      id: 4,
      companyName: '九州建設株式会社',
      establishedDate: '1978-03-05',
      postalCode: '812-0011',
      address: '福岡県福岡市博多区博多駅前1-1-1',
      industry: '不動産・建設'
    },
    {
      id: 5,
      companyName: '北海道食品株式会社',
      establishedDate: '2010-11-22',
      postalCode: '060-0001',
      address: '北海道札幌市中央区大通西5-5-5',
      industry: '食品・飲料',
      website: 'https://hokkaido-foods.jp'
    },
    {
      id: 6,
      companyName: '東京金融株式会社',
      establishedDate: '2000-03-15',
      postalCode: '104-0061',
      address: '東京都中央区銀座1-1-1',
      industry: '金融・保険',
      website: 'https://tokyo-finance.co.jp'
    },
    {
      id: 7,
      companyName: '関西医療サービス株式会社',
      establishedDate: '2005-07-20',
      postalCode: '550-0001',
      address: '大阪府大阪市西区土佐堀1-1-1',
      industry: '医療・介護'
    },
    {
      id: 8,
      companyName: '全国運輸株式会社',
      establishedDate: '1990-12-01',
      postalCode: '460-0008',
      address: '愛知県名古屋市中区栄2-2-2',
      industry: '運輸・物流'
    }
  ]
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
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
    } = await request.json()

    // バリデーション（1200万社対応）
    if (limit > 1000) {
      return NextResponse.json(
        { error: 'Limit cannot exceed 1000 for performance reasons' },
        { status: 400 }
      )
    }

    // キャッシュキー生成（新しい検索条件含む）
    const cacheKey = JSON.stringify({ 
      industries, prefectures, capitalMin, capitalMax, employeesMin, employeesMax,
      establishedYearMin, establishedYearMax, page, limit, companyName, 
      establishedDateStart, establishedDateEnd 
    })
    
    // キャッシュチェック（高速レスポンス）
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
      return NextResponse.json({
        ...cached.data,
        _cache: 'hit',
        _responseTime: Date.now() - startTime
      })
    }

    // PostgreSQL高速検索（フォールバック対応）
    let companies: Corporate[] = []
    let totalCount = 0
    let dataSource = 'postgresql'

    try {
      const result = await searchCompanies({
        industries,
        prefectures,
        capitalMin,
        capitalMax,
        employeesMin,
        employeesMax,
        establishedYearMin,
        establishedYearMax,
        page,
        limit,
        companyName,
        establishedDateStart,
        establishedDateEnd
      })
      companies = result.companies
      totalCount = result.totalCount
    } catch (dbError) {
      console.warn('PostgreSQL接続失敗、フォールバックモードに切り替え:', dbError)
      
      // フォールバック：デフォルトデータを使用
      const allCompanies = getDefaultCompanies()
      let filteredCompanies = allCompanies

      // 業種フィルタリング（インメモリ）
      if (industries && industries.length > 0) {
        filteredCompanies = allCompanies.filter(company => 
          industries.includes(company.industry)
        )
      }

      // 企業名フィルタリング（インメモリ）
      if (companyName) {
        filteredCompanies = filteredCompanies.filter(company =>
          company.companyName.toLowerCase().includes(companyName.toLowerCase())
        )
      }

      // ページネーション（インメモリ）
      const offset = (page - 1) * limit
      companies = filteredCompanies.slice(offset, offset + limit)
      totalCount = filteredCompanies.length
      dataSource = 'fallback'
    }
    
    const totalPages = Math.ceil(totalCount / limit)
    
    const response: CorporateSearchResponse = {
      companies,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }

    // キャッシュに保存（メモリ効率化）
    cache.set(cacheKey, { data: response, timestamp: Date.now() })
    
    // キャッシュサイズ管理（メモリリーク防止）
    if (cache.size > 1000) {
      const oldestKey = cache.keys().next().value
      cache.delete(oldestKey)
    }
    
    const responseTime = Date.now() - startTime
    
    return NextResponse.json({
      ...response,
      _cache: 'miss',
      _responseTime: responseTime,
      _queryInfo: {
        totalCount,
        dataSource,
        indexesUsed: dataSource === 'postgresql' ? 
          ['idx_companies_industry', 'idx_companies_company_name'] : 
          ['in-memory-filter'],
        filters: { industries, prefectures, capitalMin, capitalMax, employeesMin, employeesMax, establishedYearMin, establishedYearMax, companyName, establishedDateStart, establishedDateEnd }
      }
    })

  } catch (error) {
    console.error('PostgreSQL Search API Error:', error)
    return NextResponse.json(
      { 
        error: 'データベース検索中にエラーが発生しました',
        _responseTime: Date.now() - startTime,
        _errorType: error instanceof Error ? error.name : 'Unknown'
      },
      { status: 500 }
    )
  }
}

// 統計情報API（1200万社対応・フォールバック対応）
export async function GET() {
  const startTime = Date.now()
  
  try {
    let stats
    let dataSource = 'postgresql'
    
    try {
      stats = await getCompanyStats()
    } catch (dbError) {
      console.warn('PostgreSQL統計取得失敗、フォールバックモード:', dbError)
      
      // フォールバック：デフォルトデータから統計生成
      const defaultCompanies = getDefaultCompanies()
      const industryBreakdown = defaultCompanies.reduce((acc: any[], company) => {
        const existing = acc.find(item => item.industry === company.industry)
        if (existing) {
          existing.company_count += 1
        } else {
          acc.push({
            industry: company.industry,
            company_count: 1
          })
        }
        return acc
      }, [])
      
      stats = {
        totalCompanies: defaultCompanies.length,
        industryBreakdown
      }
      dataSource = 'fallback'
    }
    
    const responseTime = Date.now() - startTime
    
    return NextResponse.json({
      ...stats,
      _responseTime: responseTime,
      _dataSource: dataSource
    })

  } catch (error) {
    console.error('Stats API Error:', error)
    return NextResponse.json(
      { 
        error: '統計情報の取得に失敗しました',
        _responseTime: Date.now() - startTime
      },
      { status: 500 }
    )
  }
}

// キャッシュクリア（管理者用）
export async function DELETE() {
  cache.clear()
  return NextResponse.json({ message: 'Cache cleared successfully' })
}