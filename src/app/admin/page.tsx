'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { Header } from '@/components/ui/Header'
import { Pagination } from '@/components/ui/Pagination'
import { AdvancedSearch, SearchFilters } from '@/components/ui/AdvancedSearch'
import { Corporate, CorporateSearchResponse, PaginationInfo } from '@/types/corporate'
import { useAuth } from '@/contexts/AuthContext'
import { formatResponseTime, formatNumber, logPerformance } from '@/lib/utils'

export default function AdminPage() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [companies, setCompanies] = useState<Corporate[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [responseTime, setResponseTime] = useState<number>(0)
  const [cacheStatus, setCacheStatus] = useState<'hit' | 'miss' | null>(null)

  // 管理者権限チェック
  useEffect(() => {
    if (!user) {
      router.push('/login')
    } else if (user.type !== 'admin') {
      router.push('/search') // 一般ユーザーは検索画面へリダイレクト
    }
  }, [user, router])

  // 高パフォーマンス検索API呼び出し関数（管理者向け全フィールド表示）
  const searchCompanies = useCallback(async (filters: SearchFilters, page: number = 1) => {
    const startTime = Date.now()
    setLoading(true)
    setError('')
    setResponseTime(0)
    setCacheStatus(null)
    
    try {
      // 検索条件の構築
      const searchParams: any = {
        page,
        limit: 100
      }

      // 業界（複数選択対応）
      if (filters.industries && filters.industries.length > 0) {
        searchParams.industries = filters.industries
      }

      // 都道府県
      if (filters.prefecture && filters.prefecture !== '指定なし') {
        searchParams.prefectures = [filters.prefecture]
      }

      // 資本金（指定なしでない場合）
      if (!filters.capitalEnabled && (filters.capitalMin || filters.capitalMax)) {
        if (filters.capitalMin) searchParams.capitalMin = filters.capitalMin
        if (filters.capitalMax) searchParams.capitalMax = filters.capitalMax
      }

      // 従業員数（指定なしでない場合）
      if (!filters.employeesEnabled && (filters.employeesMin || filters.employeesMax)) {
        if (filters.employeesMin) searchParams.employeesMin = filters.employeesMin
        if (filters.employeesMax) searchParams.employeesMax = filters.employeesMax
      }

      // 設立年（指定なしでない場合）
      if (!filters.establishedYearEnabled && (filters.establishedYearMin || filters.establishedYearMax)) {
        if (filters.establishedYearMin) searchParams.establishedYearMin = filters.establishedYearMin
        if (filters.establishedYearMax) searchParams.establishedYearMax = filters.establishedYearMax
      }
      
      const response = await fetch('/api/companies/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams)
      })
      
      if (!response.ok) {
        throw new Error(`検索に失敗しました (${response.status})`)
      }
      
      const data: CorporateSearchResponse & {
        _responseTime?: number
        _cache?: 'hit' | 'miss'
        _queryInfo?: any
      } = await response.json()
      
      setCompanies(data.companies)
      setPagination(data.pagination)
      
      // パフォーマンス情報の表示
      if (data._responseTime) {
        setResponseTime(data._responseTime)
        setCacheStatus(data._cache || null)
        logPerformance(
          `Admin Company Search (page ${page})`,
          startTime,
          {
            totalResults: data.pagination.totalCount,
            cacheStatus: data._cache,
            serverTime: data._responseTime,
            clientTime: Date.now() - startTime,
            filters: JSON.stringify(filters)
          }
        )
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '検索中にエラーが発生しました'
      setError(errorMessage)
      setCompanies([])
      setPagination({
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        hasNextPage: false,
        hasPrevPage: false
      })
      
      logPerformance('Admin Company Search Error', startTime, { error: errorMessage })
      
    } finally {
      setLoading(false)
    }
  }, [])

  // 初回検索（全件表示）
  useEffect(() => {
    if (user && user.type === 'admin') {
      const defaultFilters: SearchFilters = {
        industries: [],
        prefecture: '指定なし',
        capitalMin: 0,
        capitalMax: 0,
        capitalEnabled: true,
        employeesMin: 0,
        employeesMax: 0,
        employeesEnabled: true,
        establishedYearMin: 0,
        establishedYearMax: 0,
        establishedYearEnabled: true,
      }
      searchCompanies(defaultFilters)
    }
  }, [user, searchCompanies])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const handleAdvancedSearch = useCallback((filters: SearchFilters) => {
    searchCompanies(filters, 1)
  }, [searchCompanies])
  
  const handlePageChange = (page: number) => {
    // 現在の検索条件を維持してページ変更
    const currentFilters: SearchFilters = {
      industries: [],
      prefecture: '指定なし',
      capitalMin: 0,
      capitalMax: 0,
      capitalEnabled: true,
      employeesMin: 0,
      employeesMax: 0,
      employeesEnabled: true,
      establishedYearMin: 0,
      establishedYearMax: 0,
      establishedYearEnabled: true,
    }
    searchCompanies(currentFilters, page)
  }

  // 権限チェック中の表示
  if (!user || user.type !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header 
        title="企業データベース（管理者画面）"
        user={{ name: user.name, type: user.type }}
        onLogout={handleLogout}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 高度な検索フォーム */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>企業検索（管理者向け・高度な絞り込み）</CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              業界、所在地、資本金、従業員数、設立年で絞り込み検索ができます（全フィールド表示）
            </p>
          </CardHeader>
          <CardBody>
            <AdvancedSearch 
              onSearch={handleAdvancedSearch}
              loading={loading}
            />
            <div className="flex gap-3 flex-wrap mt-6 pt-6 border-t border-[var(--border-color)]">
              <Button variant="secondary" disabled={loading || companies.length === 0}>CSV出力</Button>
              <Button variant="secondary" disabled={loading || companies.length === 0}>テキスト出力</Button>
              <Button 
                variant="primary" 
                onClick={() => router.push('/admin/prtimes')}
              >
                PR TIMES管理
              </Button>
              <Button 
                variant="primary" 
                onClick={() => router.push('/admin/users')}
              >
                ユーザー管理
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* エラー表示 */}
        {error && (
          <Card className="mb-6">
            <CardBody>
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            </CardBody>
          </Card>
        )}

        {/* 検索結果 */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>
                検索結果 ({loading ? '検索中...' : `${formatNumber(pagination.totalCount)}件`})
              </CardTitle>
              {/* パフォーマンス情報 */}
              {responseTime > 0 && !loading && (
                <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                  <span>
                    応答時間: <strong className={responseTime < 1000 ? 'text-green-600' : responseTime < 3000 ? 'text-yellow-600' : 'text-red-600'}>
                      {formatResponseTime(responseTime)}
                    </strong>
                  </span>
                  {cacheStatus && (
                    <span className={`px-2 py-1 rounded text-xs ${
                      cacheStatus === 'hit' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {cacheStatus === 'hit' ? 'キャッシュ' : 'DB検索'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">企業名</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">業種</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">都道府県</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">資本金</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">従業員数</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">設立年</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">ホームページURL</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    // ローディング表示
                    Array.from({ length: 10 }).map((_, index) => (
                      <tr key={`loading-${index}`} className="border-b border-[var(--border-color)]">
                        <td colSpan={7} className="py-4 px-4 text-center">
                          <div className="animate-pulse bg-[var(--bg-light)] h-6 rounded"></div>
                        </td>
                      </tr>
                    ))
                  ) : companies.length === 0 ? (
                    // データなし表示
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-[var(--text-secondary)]">
                        検索条件に一致する企業が見つかりませんでした
                      </td>
                    </tr>
                  ) : (
                    // 検索結果表示（管理者向け全フィールド）
                    companies.map((corporate) => (
                    <tr key={corporate.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {corporate.companyName}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-[var(--text-primary)]">
                        <span className="inline-block bg-[var(--bg-light)] text-[var(--text-primary)] px-2 py-1 rounded-md text-sm">
                          {corporate.industry}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-[var(--text-primary)]">
                        {corporate.prefecture || '-'}
                      </td>
                      <td className="py-4 px-4 text-[var(--text-primary)]">
                        {corporate.capitalAmount ? 
                          `${(corporate.capitalAmount / 10000).toLocaleString()}万円` : 
                          '-'
                        }
                      </td>
                      <td className="py-4 px-4 text-[var(--text-primary)]">
                        {corporate.employeeCount ? 
                          `${corporate.employeeCount.toLocaleString()}名` : 
                          '-'
                        }
                      </td>
                      <td className="py-4 px-4 text-[var(--text-primary)]">
                        {new Date(corporate.establishedDate).getFullYear()}年
                      </td>
                      <td className="py-4 px-4">
                        {corporate.website ? (
                          <a 
                            href={corporate.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[var(--primary)] hover:underline text-sm break-all"
                          >
                            {corporate.website}
                          </a>
                        ) : (
                          <span className="text-[var(--text-light)] text-sm">-</span>
                        )}
                      </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* ページネーション */}
            {!loading && companies.length > 0 && (
              <Pagination
                pagination={pagination}
                onPageChange={handlePageChange}
                loading={loading}
              />
            )}
          </CardBody>
        </Card>
      </main>
    </div>
  )
}