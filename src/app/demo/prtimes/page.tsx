'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { Header } from '@/components/ui/Header'
import { Pagination } from '@/components/ui/Pagination'
import { PRTimesSearch } from '@/components/ui/PRTimesSearch'
import { PRTimesCompany, PRTimesSearchFilters, PRTimesSearchResponse } from '@/types/prtimes'
import { formatNumber, logPerformance, downloadCSV } from '@/lib/utils'
import Link from 'next/link'
import Image from 'next/image'

export default function DemoPRTimesPage() {
  const pathname = usePathname()
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

  // 件数のみ取得（リアルタイム検索用）
  const getCount = useCallback(async (filters: PRTimesSearchFilters) => {
    setCountLoading(true)
    try {
      const searchParams = {
        ...filters,
        countOnly: true
      }

      const response = await fetch('/api/prtimes/search', {
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
      setTotalCount(data.pagination.totalCount) // 実際の件数を表示

    } catch (err) {
      console.error('Count error:', err)
      setTotalCount(0)
    } finally {
      setCountLoading(false)
    }
  }, [])

  // 企業検索（100件制限）
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
        page,
        limit: 50 // デモ版は50件制限
      }

      const response = await fetch('/api/prtimes/search', {
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

      // 50件制限を適用
      const limitedCompanies = data.companies.slice(0, 50)
      setCompanies(limitedCompanies)
      setCurrentFilters(filters)
      setTotalCount(data.pagination.totalCount) // 実際の件数を表示
      setSearchResultCount(Math.min(data.pagination.totalCount, 50)) // 表示は50件固定
      setHasSearched(true)

      // パフォーマンス情報の表示
      if (data._responseTime) {
        setResponseTime(data._responseTime)
        setCacheStatus(data._cache || null)
        logPerformance(
          `PR TIMES Demo Search (page ${page})`,
          startTime,
          {
            totalResults: Math.min(data.pagination.totalCount, 100),
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

  // テーブル用データの読み込み（50件ずつ、100件制限）
  const loadTableData = useCallback(async (filters: PRTimesSearchFilters, page: number, append: boolean = false) => {
    if (!append) setTableLoading(true)
    
    try {
      const searchParams = {
        ...filters,
        page,
        tableOnly: true
      }

      const response = await fetch('/api/prtimes/search', {
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
      
      let newCompanies = data.companies
      let currentTotal = append ? tableCompanies.length : 0
      
      // 50件制限チェック
      if (currentTotal + newCompanies.length > 50) {
        newCompanies = newCompanies.slice(0, 50 - currentTotal)
      }

      let updatedTableCompanies
      if (append) {
        updatedTableCompanies = [...tableCompanies, ...newCompanies].slice(0, 50)
        setTableCompanies(updatedTableCompanies)
      } else {
        updatedTableCompanies = newCompanies.slice(0, 50)
        setTableCompanies(updatedTableCompanies)
      }

      // 50件に達したら無限スクロールを停止
      setHasMoreTableData(updatedTableCompanies.length < 50 && data.pagination.hasNextPage)
      
    } catch (error) {
      console.error('Table data loading error:', error)
    } finally {
      setTableLoading(false)
    }
  }, [tableCompanies.length])

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

      const response = await fetch('/api/prtimes/search', {
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
      
      // バックエンドで既にドメインベース重複除去済み、50件制限を適用
      const limitedCompanies = data.companies.slice(0, 50)
      const csvData = limitedCompanies.map((company: PRTimesCompany) => {
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
      
      downloadCSV(csvData, `prtimes_demo_${new Date().toISOString().slice(0, 10)}.csv`)
      showNotification('CSVエクスポートが完了しました！（デモ版：最大50件）')
      
    } catch (err) {
      console.error('Export error:', err)
      showNotification('エクスポートに失敗しました')
    } finally {
      setExporting(false)
    }
  }, [currentFilters, copyFormat, showNotification])

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
      
      {/* デモ用ヘッダー */}
      <header className="bg-white shadow-sm border-b border-[var(--border-color)] sticky top-0 z-50">
        <div className="w-full" style={{ padding: '0 30px' }}>
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Image
                  src="/logo.png"
                  alt="アプローチロボ"
                  width={200}
                  height={40}
                  className="h-10 w-auto cursor-pointer"
                />
              </Link>
              <div className="bg-orange-100 text-orange-800 rounded-full text-sm font-medium" style={{ padding: '3px 15px' }}>
                DEMO
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <nav className="flex items-center gap-6" style={{ padding: '8px' }}>
                <Link
                  href="/demo"
                  className={`text-sm font-medium text-black transition-colors relative ${
                    pathname === '/demo'
                      ? 'after:content-[""] after:absolute after:bottom-[-8px] after:left-0 after:right-0 after:h-0.5 after:bg-[var(--primary)]'
                      : 'hover:text-[var(--primary)]'
                  }`}
                >
                  企業DB
                </Link>
                <Link
                  href="/demo/prtimes"
                  className={`text-sm font-medium text-black transition-colors relative ${
                    pathname === '/demo/prtimes'
                      ? 'after:content-[""] after:absolute after:bottom-[-8px] after:left-0 after:right-0 after:h-0.5 after:bg-[var(--primary)]'
                      : 'hover:text-[var(--primary)]'
                  }`}
                >
                  プレスリリース
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-medium text-black transition-colors hover:text-[var(--primary)]"
                >
                  ログイン
                </Link>
              </nav>
              
              <button
                onClick={() => window.open('https://approach-robo.com/#price', '_blank')}
                className="text-white text-sm font-medium transition-colors cursor-pointer"
                style={{ 
                  padding: '7px 35px', 
                  borderRadius: '100px', 
                  backgroundColor: '#0f7f85ff',
                  border: 'none'
                }}
                onMouseEnter={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#0d6b70'
                }}
                onMouseLeave={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#0f7f85ff'
                }}
              >
                有料プランに移行
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <main style={{ width: '1000px', margin: '0 auto', padding: '32px 24px' }} className="flex flex-col items-center">
        
        <div className="smarthr-card w-full">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-[var(--text-primary)]" style={{ marginBottom: '15px' }}>PR TIMES データ検索（デモ版）</h1>
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
              {searchResultCount >= 50 && (
                <span className="text-orange-600 text-sm ml-2">（デモ版：最大50件）</span>
              )}
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