'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { CompanySearch } from '@/components/ui/CompanySearch'
import { Company, CompanySearchFilters, CompanySearchResponse } from '@/types/company'
import { useAuth } from '@/contexts/AuthContext'
import { formatNumber, logPerformance, downloadCSV } from '@/lib/utils'

export default function Home() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [currentFilters, setCurrentFilters] = useState<CompanySearchFilters>({})
  const [exporting, setExporting] = useState(false)
  const [totalCount, setTotalCount] = useState<number>(0)
  const [countLoading, setCountLoading] = useState(false)
  const [searchResultCount, setSearchResultCount] = useState<number>(0)
  const [hasSearched, setHasSearched] = useState(false)
  const [copyFormat, setCopyFormat] = useState<'url' | 'url_name' | 'url_name_rep'>('url')
  const [notification, setNotification] = useState<{message: string, visible: boolean}>({
    message: '',
    visible: false
  })

  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
      if (!user) {
        router.push('/login')
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [user, router])

  // 件数のみ取得（リアルタイム検索用）
  const getCount = useCallback(async (filters: CompanySearchFilters) => {
    setCountLoading(true)
    try {
      const searchParams = {
        ...filters,
        countOnly: true
      }

      const response = await fetch('/api/companies/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams)
      })

      if (!response.ok) {
        throw new Error(`件数取得に失敗しました (${response.status})`)
      }

      const data: CompanySearchResponse = await response.json()
      setTotalCount(data.pagination.totalCount)

    } catch (err) {
      console.error('Count error:', err)
      setTotalCount(0)
    } finally {
      setCountLoading(false)
    }
  }, [])

  // 企業検索（全件取得）
  const searchCompanies = useCallback(async (filters: CompanySearchFilters, countOnly: boolean = false) => {
    // 件数のみの場合はgetCountを呼び出す
    if (countOnly) {
      getCount(filters)
      return
    }

    const startTime = Date.now()
    setLoading(true)
    setError('')
    setCopyFormat('url')
    setCompanies([]) // textareaの内容をリセット

    try {
      const searchParams = {
        ...filters,
        exportAll: true // 全件取得
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

      const data: CompanySearchResponse = await response.json()

      setCompanies(data.companies)
      setCurrentFilters(filters)
      setTotalCount(data.pagination.totalCount)
      setSearchResultCount(data.pagination.totalCount)
      setHasSearched(true)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '検索中にエラーが発生しました'
      setError(errorMessage)
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }, [getCount])

  // 初回は自動検索せず、ユーザーの検索操作を待つ

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const showNotification = useCallback((message: string) => {
    setNotification({ message, visible: true })

    const hideDelay = message.includes('停止') ? 3000 : 5000
    setTimeout(() => {
      setNotification(prev => ({ ...prev, visible: false }))
    }, hideDelay)
  }, [])

  const handleSearch = useCallback((filters: CompanySearchFilters, countOnly?: boolean) => {
    searchCompanies(filters, countOnly)
  }, [searchCompanies])


  const handleReset = useCallback(() => {
    // リセット時の通知は削除
  }, [])

  const displayCompanies = useMemo(() => {
    return companies.map(company => ({
      ...company,
      pressReleaseCount: 1
    }))
  }, [companies])

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
        default:
          return `${company.companyWebsite},${company.companyName},${representative}`
      }
    }).join('\n')
  }, [displayCompanies, copyFormat])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(copyData).then(() => {
      showNotification('コピーが完了しました！')
    }).catch(err => {
      console.error('コピーに失敗しました:', err)
      showNotification('コピーに失敗しました')
    })
  }, [copyData, showNotification])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const exportParams = {
        ...currentFilters,
        exportAll: true
      }

      const response = await fetch('/api/companies/search', {
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

      const csvData = data.companies.map((company: Company) => {
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
          default:
            return {
              'ホームページURL': company.companyWebsite,
              '会社名': company.companyName,
              '代表者名': representative
            }
        }
      })

      downloadCSV(csvData, `companies_${new Date().toISOString().slice(0, 10)}.csv`)
      showNotification('CSVエクスポートが完了しました！')

    } catch (err) {
      console.error('Export error:', err)
      showNotification('エクスポートに失敗しました')
    } finally {
      setExporting(false)
    }
  }, [currentFilters, copyFormat, showNotification])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
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
        title="企業検索"
        user={{ name: user.name, type: user.type as 'admin' | 'user' }}
        onLogout={handleLogout}
      />

      <main style={{ width: '1000px', margin: '0 auto', padding: '32px 24px' }} className="flex flex-col items-center">

        {/* 管理者の場合、管理画面で確認ボタンを一番上に配置 */}
        {user?.type === 'admin' && (
          <div className="w-full mb-8 flex justify-center" style={{ marginBottom: '30px' }}>
            <button
              onClick={() => router.push('/admin')}
              className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)]"
              style={{ padding: '12px 24px', fontSize: '16px' }}
            >
              管理画面で確認
            </button>
          </div>
        )}

        <div className="smarthr-card w-full">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-[var(--text-primary)]" style={{ marginBottom: '15px' }}>企業データ検索</h1>
          </div>
          <div>
            <div className="space-y-6">
              <CompanySearch
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
                    onChange={(e) => setCopyFormat(e.target.value as 'url' | 'url_name' | 'url_name_rep')}
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
                    onChange={(e) => setCopyFormat(e.target.value as 'url' | 'url_name' | 'url_name_rep')}
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
                    onChange={(e) => setCopyFormat(e.target.value as 'url' | 'url_name' | 'url_name_rep')}
                    className="mr-2"
                  />
                  <span className="text-sm">ホームページURLと会社名と代表者名</span>
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
