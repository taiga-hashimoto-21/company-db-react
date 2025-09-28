'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { Header } from '@/components/ui/Header'
import { Pagination } from '@/components/ui/Pagination'
import { PRTimesSearch } from '@/components/ui/PRTimesSearch'
import { CheckboxGroup } from '@/components/ui/CheckboxGroup'
import { PRTimesCompany, PRTimesSearchFilters, PRTimesSearchResponse } from '@/types/prtimes'
import { useAuth } from '@/contexts/AuthContext'
import { formatNumber, logPerformance, downloadCSV } from '@/lib/utils'

export default function PRTimesPage() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [companies, setCompanies] = useState<PRTimesCompany[]>([])
  const [tableCompanies, setTableCompanies] = useState<PRTimesCompany[]>([])
  const [tablePage, setTablePage] = useState(1)
  const [hasMoreTableData, setHasMoreTableData] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [currentFilters, setCurrentFilters] = useState<PRTimesSearchFilters>({})
  const [exporting, setExporting] = useState(false)
  const [responseTime, setResponseTime] = useState<number>(0)
  const [cacheStatus, setCacheStatus] = useState<'hit' | 'miss' | null>(null)
  const [copyFormat, setCopyFormat] = useState<'url' | 'url_name' | 'url_name_rep' | 'url_name_rep_press'>('url')
  const [totalCount, setTotalCount] = useState<number>(0)
  const [countLoading, setCountLoading] = useState(false)
  const [searchResultCount, setSearchResultCount] = useState<number>(0)
  const [hasSearched, setHasSearched] = useState(false)
  const [notification, setNotification] = useState<{message: string, visible: boolean}>({
    message: '',
    visible: false
  })
  

  // ローディング中は何もしない
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 初期化を待つ
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 100)
    
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, router, isLoading])

  // 件数のみ取得（リアルタイム検索用）
  const getCount = useCallback(async (filters: PRTimesSearchFilters) => {
    setCountLoading(true)
    try {
      const searchParams = {
        ...filters,
        countOnly: true
      }

      const response = await fetch('/api/prtimes/fast-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams)
      })

      if (!response.ok) {
        throw new Error(`件数取得に失敗しました (${response.status})`)
      }

      const data: PRTimesSearchResponse = await response.json()
      setTotalCount(data.pagination.totalCount)

    } catch (err) {
      console.error('Count error:', err)
      setTotalCount(0)
    } finally {
      setCountLoading(false)
    }
  }, [])

  // 送信先リストデータ用の検索（全件取得）
  const searchCompanies = useCallback(async (filters: PRTimesSearchFilters, countOnly: boolean = false, page: number = 1) => {
    // 件数のみの場合はgetCountを呼び出す
    if (countOnly) {
      getCount(filters)
      return
    }

    const startTime = Date.now()
    setLoading(true)
    setError('')
    setResponseTime(0)
    setCacheStatus(null)
    setCopyFormat('url')
    setTableCompanies([])
    setTablePage(1)
    setHasMoreTableData(true)
    setCompanies([]) // textareaの内容をリセット
    
    try {
      const searchParams = {
        ...filters,
        page
      }

      const response = await fetch('/api/prtimes/fast-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams)
      })
      
      if (!response.ok) {
        throw new Error(`検索に失敗しました (${response.status})`)
      }
      
      const data: PRTimesSearchResponse & {
        _responseTime?: number
        _cache?: 'hit' | 'miss'
        _queryInfo?: any
      } = await response.json()
      
      setCompanies(data.companies)
      setPagination(data.pagination)
      setCurrentFilters(filters)
      setTotalCount(data.pagination.totalCount)
      setSearchResultCount(data.pagination.totalCount)
      setHasSearched(true)
      
      // パフォーマンス情報の表示
      if (data._responseTime) {
        setResponseTime(data._responseTime)
        setCacheStatus(data._cache || null)
        logPerformance(
          `PR TIMES Search (page ${page})`,
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
    } finally {
      setLoading(false)
    }

    // 初回テーブルデータ読み込み
    loadTableData(filters, 1)
  }, [getCount])

  // テーブル用データの読み込み（50件ずつ）
  const loadTableData = useCallback(async (filters: PRTimesSearchFilters, page: number, append: boolean = false) => {
    if (!append) setTableLoading(true)
    
    try {
      const searchParams = {
        ...filters,
        page,
        tableOnly: true
      }

      const response = await fetch('/api/prtimes/fast-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: PRTimesSearchResponse = await response.json()
      
      if (append) {
        setTableCompanies(prev => [...prev, ...data.companies])
      } else {
        setTableCompanies(data.companies)
      }
      
      setHasMoreTableData(data.pagination.hasNextPage)
      
    } catch (error) {
      console.error('Table data loading error:', error)
    } finally {
      setTableLoading(false)
    }
  }, [])

  // ドメイン抽出関数
  const extractDomain = useCallback((url: string | null | undefined): string | null => {
    if (!url || !url.trim()) return null
    try {
      const cleanUrl = url.trim()
      // httpまたはhttpsで始まらない場合は追加
      const fullUrl = cleanUrl.match(/^https?:\/\//) ? cleanUrl : `https://${cleanUrl}`
      const domain = new URL(fullUrl).hostname.toLowerCase()
      // www.を除去
      return domain.replace(/^www\./, '')
    } catch {
      return null
    }
  }, [])

  // 会社名正規化関数
  const normalizeCompanyName = useCallback((name: string | null | undefined): string => {
    if (!name || !name.trim()) return 'no-name'
    return name.trim()
      .toLowerCase()
      .replace(/株式会社|（株）|\(株\)|有限会社|合同会社|co\.,ltd\.|ltd\.|inc\.|corp\./g, '')
      .replace(/\s+/g, '')
  }, [])

  // テーブル表示用データの生成（バックエンドで既にドメインベース重複除去済み）
  const displayCompanies = useMemo(() => {
    // バックエンドで既にドメインベース重複除去済みなので、そのまま使用
    return companies.map(company => ({
      ...company,
      pressReleaseCount: 1 // バックエンドで各ドメインから1件選択済み
    }))
  }, [companies])

  // コピー用データの生成（displayCompaniesは既に重複除去済み）
  const copyData = useMemo(() => {
    return displayCompanies.map(company => {
      const representative = company.representative && company.representative.trim() !== '' && company.representative.trim() !== '-'
        ? company.representative
        : 'ご担当者'

      switch (copyFormat) {
        case 'url':
          return company.companyWebsite
        case 'url_name':
          return `${company.companyWebsite},${company.companyName}`
        case 'url_name_rep':
          return `${company.companyWebsite},${company.companyName},${representative}`
        case 'url_name_rep_press':
        default:
          return `${company.companyWebsite},${company.companyName},${representative},${company.pressReleaseUrl || ''}`
      }
    }).join('\n')
  }, [displayCompanies, copyFormat])

  // 初回は自動検索せず、ユーザーの検索操作を待つ

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const showNotification = useCallback((message: string) => {
    setNotification({ message, visible: true })
    
    // 停止時は3秒後、正常完了時は5秒後に非表示
    const hideDelay = message.includes('停止') ? 3000 : 5000
    setTimeout(() => {
      setNotification(prev => ({ ...prev, visible: false }))
    }, hideDelay)
  }, [])

  // 無限スクロール用のhook
  const loadMoreRef = useCallback((node: HTMLDivElement) => {
    if (tableLoading) return
    
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreTableData && !tableLoading) {
        const nextPage = tablePage + 1
        setTablePage(nextPage)
        loadTableData(currentFilters, nextPage, true)
      }
    })
    
    if (node) observer.observe(node)
    
    return () => {
      if (node) observer.unobserve(node)
    }
  }, [tableLoading, hasMoreTableData, tablePage, currentFilters, loadTableData])

  const handleSearch = useCallback((filters: PRTimesSearchFilters, countOnly?: boolean) => {
    searchCompanies(filters, countOnly, 1)
  }, [searchCompanies])
  
  const handlePageChange = (page: number) => {
    searchCompanies(currentFilters, false, page)
  }

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(copyData).then(() => {
      showNotification('コピーが完了しました！')
    }).catch(err => {
      console.error('コピーに失敗しました:', err)
      showNotification('コピーに失敗しました')
    })
  }, [copyData, showNotification])

  const handleReset = useCallback(() => {
    // リセット時の通知は削除
  }, [])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const exportParams = {
        ...currentFilters,
        exportAll: true
      }

      const response = await fetch('/api/prtimes/fast-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportParams)
      })
      
      if (!response.ok) {
        throw new Error('エクスポートに失敗しました')
      }
      
      const data = await response.json()

      // バックエンドで既にドメインベース重複除去済みなので、そのまま使用
      const csvData = data.companies.map((company: PRTimesCompany) => {
        const representative = company.representative && company.representative.trim() !== '' 
          ? company.representative 
          : 'ご担当者'
          
        switch (copyFormat) {
          case 'url':
            return {
              'ホームページURL': company.companyWebsite
            }
          case 'url_name':
            return {
              'ホームページURL': company.companyWebsite,
              '会社名': company.companyName
            }
          case 'url_name_rep':
            return {
              'ホームページURL': company.companyWebsite,
              '会社名': company.companyName,
              '代表者名': representative
            }
          case 'url_name_rep_press':
          default:
            return {
              'ホームページURL': company.companyWebsite,
              '会社名': company.companyName,
              '代表者名': representative,
              'プレスリリースURL': company.pressReleaseUrl || ''
            }
        }
      })
      
      downloadCSV(csvData, `prtimes_companies_${new Date().toISOString().slice(0, 10)}.csv`)
      showNotification('CSVエクスポートが完了しました！')
      
    } catch (err) {
      console.error('Export error:', err)
      showNotification('エクスポートに失敗しました')
    } finally {
      setExporting(false)
    }
  }, [currentFilters, copyFormat, showNotification])

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* 完了通知エリア */}
      <div 
        className="completion-notification"
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          display: notification.visible ? 'block' : 'none'
        }}
      >
        <div className="completion-message">
          {notification.message}
        </div>
      </div>
      
      <Header
        title="PR TIMES企業検索"
        user={{ name: user.name, type: user.type as 'admin' | 'user' }}
        onLogout={handleLogout}
      />
      
      <main style={{ width: '1000px', margin: '0 auto', padding: '32px 24px' }} className="flex flex-col items-center">
        
        {/* 管理者の場合、管理画面で確認ボタンを一番上に配置 */}
        {user?.type === 'admin' && (
          <div className="w-full mb-8 flex justify-center" style={{ marginBottom: '30px' }}>
            <button 
              onClick={() => router.push('/admin/prtimes')}
              className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)]"
              style={{ padding: '12px 24px', fontSize: '16px' }}
            >
              管理画面で確認
            </button>
          </div>
        )}

        <div className="smarthr-card w-full">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-[var(--text-primary)]" style={{ marginBottom: '15px' }}>PR TIMES データ検索</h1>
          </div>
          <div>
            <div className="space-y-6">
              <PRTimesSearch
                onSearch={handleSearch}
                onReset={handleReset}
                loading={loading}
                realtime={true}
                totalCount={totalCount}
                countLoading={countLoading}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="smarthr-card w-full">
            <div className="p-4 bg-[#fee2e2] border border-[#fecaca] rounded-lg text-[#991b1b] text-sm">
              {error}
            </div>
          </div>
        )}

        <div className="smarthr-card w-full">
          <div className="mb-6">
            <h2 style={{ marginBottom: '10px' }} className="text-lg font-semibold text-[var(--text-primary)]">
              検索結果 ({loading ? '検索中...' : hasSearched ? `${formatNumber(searchResultCount)}件` : '-'})
            </h2>
          </div>
          
          <div style={{ padding: '15px', marginBottom: '30px' }} className="bg-[#139ea8]/5 border border-[#139ea8]/20 rounded-lg">
            <label style={{ marginBottom: '10px' }} className="block text-base font-medium text-[var(--text-primary)]">
              送信先リストデータ
            </label>
            
            <div className="mb-6">
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="copyFormat"
                    value="url"
                    checked={copyFormat === 'url'}
                    onChange={(e) => setCopyFormat(e.target.value as 'url' | 'url_name' | 'url_name_rep' | 'url_name_rep_press')}
                    className="mr-2"
                  />
                  <span className="text-sm">ホームページURLのみ</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="copyFormat"
                    value="url_name"
                    checked={copyFormat === 'url_name'}
                    onChange={(e) => setCopyFormat(e.target.value as 'url' | 'url_name' | 'url_name_rep' | 'url_name_rep_press')}
                    className="mr-2"
                  />
                  <span className="text-sm">ホームページURLと会社名</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="copyFormat"
                    value="url_name_rep"
                    checked={copyFormat === 'url_name_rep'}
                    onChange={(e) => setCopyFormat(e.target.value as 'url' | 'url_name' | 'url_name_rep' | 'url_name_rep_press')}
                    className="mr-2"
                  />
                  <span className="text-sm">ホームページURLと会社名と代表者名</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="copyFormat"
                    value="url_name_rep_press"
                    checked={copyFormat === 'url_name_rep_press'}
                    onChange={(e) => setCopyFormat(e.target.value as 'url' | 'url_name' | 'url_name_rep' | 'url_name_rep_press')}
                    className="mr-2"
                  />
                  <span className="text-sm">ホームページURLと会社名と代表者名とプレスリリースURL</span>
                </label>
              </div>
            </div>
            
            <textarea
              value={copyData}
              readOnly
              style={{ marginTop: '10px' }}
              className="smarthr-input w-full h-40 resize-none font-mono text-xs"
              placeholder="検索結果がここに表示されます..."
            />
            <div className="flex gap-3" style={{ marginTop: '10px' }}>
              <button
                onClick={handleCopy}
                style={{ padding: '7px 15px', height: '35px' }}
                className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)] text-sm"
              >
                コピー
              </button>
              <button
                onClick={handleExport}
                disabled={loading || companies.length === 0 || exporting}
                style={{ padding: '7px 15px', height: '35px' }}
                className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)] text-sm disabled:opacity-50"
              >
                {exporting ? 'エクスポート中...' : 'CSVエクスポート'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}