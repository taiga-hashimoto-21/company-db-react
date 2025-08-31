'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { Header } from '@/components/ui/Header'
import { Input } from '@/components/ui/Input'
import { PRTimesCompany } from '@/types/prtimes'
import { useAuth } from '@/contexts/AuthContext'
import { formatNumber } from '@/lib/utils'

export default function AdminPRTimesPage() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [companies, setCompanies] = useState<PRTimesCompany[]>([])
  const [allCompanies, setAllCompanies] = useState<PRTimesCompany[]>([])
  const [adminPage, setAdminPage] = useState(1)
  const [hasMoreAdminData, setHasMoreAdminData] = useState(true)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    message: string
    successCount: number
    errorCount: number
    errors: string[]
  } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [uploads, setUploads] = useState<any[]>([])
  const [uploadsLoading, setUploadsLoading] = useState(false)
  const [notification, setNotification] = useState<{message: string, visible: boolean}>({
    message: '',
    visible: false
  })

  // ローディング中は何もしない
  const [isPageLoading, setIsPageLoading] = useState(true)

  const showNotification = useCallback((message: string) => {
    setNotification({ message, visible: true })
    
    // 5秒後に非表示
    setTimeout(() => {
      setNotification(prev => ({ ...prev, visible: false }))
    }, 5000)
  }, [])

  useEffect(() => {
    // 初期化を待つ
    const timer = setTimeout(() => {
      setIsPageLoading(false)
    }, 100)
    
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isPageLoading) {
      if (!user) {
        router.push('/login')
      } else if (user.type !== 'admin') {
        router.push('/prtimes')
      }
    }
  }, [user, router, isPageLoading])

  const loadAllAdminData = useCallback(async () => {
    setLoading(true)
    
    try {
      // 全データを取得するため大きなlimitを設定
      const response = await fetch(`/api/prtimes?page=1&limit=10000`)
      if (!response.ok) throw new Error('Failed to fetch companies')
      
      const data = await response.json()
      setAllCompanies(data.companies)
      setTotalCount(data.pagination.totalCount)
      setHasMoreAdminData(false) // 全データ取得済み
    } catch (error) {
      console.error('Error fetching companies:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAdminData = useCallback(async (page: number, append: boolean = false) => {
    if (!append) setLoading(true)
    
    try {
      const response = await fetch(`/api/prtimes?page=${page}&limit=50`)
      if (!response.ok) throw new Error('Failed to fetch companies')
      
      const data = await response.json()
      
      if (append) {
        setAllCompanies(prev => [...prev, ...data.companies])
      } else {
        setAllCompanies(data.companies)
      }
      
      setTotalCount(data.pagination.totalCount)
      setHasMoreAdminData(data.pagination.hasNextPage)
    } catch (error) {
      console.error('Error fetching companies:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 管理者画面用データの生成（企業単位でユニーク化、会社名+ホームページURLのみで判定）
  const displayCompanies = useMemo(() => {
    const uniqueCompaniesMap = new Map()
    
    allCompanies.forEach(company => {
      // 会社名とホームページURLのみで重複除去
      const websiteKey = company.companyWebsite?.trim() || 'no-website'
      const companyNameKey = company.companyName?.trim() || 'no-name'
      const key = `${websiteKey}_${companyNameKey}`
      
      if (!uniqueCompaniesMap.has(key)) {
        uniqueCompaniesMap.set(key, [])
      }
      uniqueCompaniesMap.get(key).push(company)
    })
    
    return Array.from(uniqueCompaniesMap.values()).map(companyGroup => {
      const sortedCompanies = companyGroup.sort((a, b) => 
        new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime()
      )
      return { ...sortedCompanies[0], pressReleaseCount: companyGroup.length }
    }).sort((a, b) => a.companyName.localeCompare(b.companyName))
  }, [allCompanies])

  const fetchUploads = useCallback(async () => {
    setUploadsLoading(true)
    try {
      const response = await fetch('/api/prtimes/uploads')
      if (!response.ok) throw new Error('Failed to fetch uploads')
      
      const data = await response.json()
      setUploads(data.uploads)
    } catch (error) {
      console.error('Error fetching uploads:', error)
    } finally {
      setUploadsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && user.type === 'admin') {
      loadAllAdminData()
      fetchUploads()
    }
  }, [user, loadAllAdminData, fetchUploads])

  // 無限スクロール用のhook
  const loadMoreRef = useCallback((node: HTMLDivElement) => {
    if (loading) return
    
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreAdminData && !loading) {
        const nextPage = adminPage + 1
        setAdminPage(nextPage)
        loadAdminData(nextPage, true)
      }
    })
    
    if (node) observer.observe(node)
    
    return () => {
      if (node) observer.unobserve(node)
    }
  }, [loading, hasMoreAdminData, adminPage, loadAdminData])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'text/csv') {
      setSelectedFile(file)
      setUploadResult(null)
    } else {
      alert('CSVファイルを選択してください')
      event.target.value = ''
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('ファイルを選択してください')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      
      const response = await fetch('/api/prtimes/upload', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }
      
      const result = await response.json()
      setUploadResult(null) // アップロード結果表示をクリア
      setSelectedFile(null)
      
      if (result.successCount > 0) {
        // 全データを再読み込み
        await loadAllAdminData()
        await fetchUploads()
        showNotification(`アップロード完了: 成功 ${result.successCount}件${result.errorCount > 0 ? `, エラー ${result.errorCount}件` : ''}`)
      } else {
        showNotification(`アップロード失敗: エラー ${result.errorCount}件`)
      }
      
      const fileInput = document.getElementById('csvFile') as HTMLInputElement
      if (fileInput) fileInput.value = ''
      
    } catch (error) {
      console.error('Upload error:', error)
      showNotification('アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteUpload = async (batchId: string, filename: string) => {
    if (!confirm(`「${filename}」のアップロードデータを削除してもよろしいですか？\nこのバッチのデータのみが削除されます。この操作は取り消せません。`)) {
      return
    }

    try {
      const response = await fetch(`/api/prtimes/uploads?batchId=${encodeURIComponent(batchId)}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        throw new Error('Delete failed')
      }
      
      const result = await response.json()
      showNotification(`削除完了: ${result.deletedCompanies}件の企業データと履歴を削除しました`)
      
      await fetchUploads()
      // 全データを再読み込み
      await loadAllAdminData()
    } catch (error) {
      console.error('Delete error:', error)
      showNotification('削除に失敗しました')
    }
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  if (isPageLoading || !user || user.type !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <Header 
        title="PR TIMES企業データ管理"
        user={{ name: user.name, type: user.type }}
        onLogout={handleLogout}
      />
      
      <main style={{ width: '1000px', margin: '0 auto', padding: '32px 24px' }} className="flex flex-col items-center">
        
        {/* ユーザー画面で確認ボタンを一番上に配置 */}
        <div className="w-full flex justify-center" style={{ marginBottom: '30px' }}>
          <button 
            onClick={() => router.push('/prtimes')}
            className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)]"
            style={{ padding: '12px 24px', fontSize: '16px' }}
          >
            ユーザー画面で確認
          </button>
        </div>
        <div className="smarthr-card w-full mb-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">CSVファイルアップロード</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              PR TIMESから取得した企業データをCSVファイルでアップロードできます
            </p>
          </div>
          <div>
            <div className="space-y-4">
              <div>
                <label htmlFor="csvFile" className="block text-sm font-medium mb-2">
                  CSVファイル選択
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    id="csvFile"
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    disabled={uploading}
                    className="smarthr-input flex-1 text-sm
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-medium
                      file:bg-[var(--primary)] file:text-white
                      hover:file:bg-[var(--primary-hover)]
                      file:cursor-pointer cursor-pointer"
                  />
                  <button 
                    onClick={handleUpload}
                    disabled={!selectedFile || uploading}
                    className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)] disabled:opacity-50"
                  >
                    {uploading ? 'アップロード中...' : 'アップロード'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="smarthr-card w-full mb-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">アップロード履歴</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              過去のCSVアップロード履歴を確認・削除できます。削除は該当バッチのデータのみが対象となります。
            </p>
          </div>
          <div>
            {/* 固定ヘッダー */}
            <div style={{ border: '1px solid var(--border-color)', borderBottom: 'none', borderRadius: '6px 6px 0 0', backgroundColor: 'white' }}>
              <table className="smarthr-table w-full" style={{ marginBottom: '0' }}>
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-left py-3 px-4 font-medium">アップロード日時</th>
                    <th className="text-left py-3 px-4 font-medium">ファイル名</th>
                    <th className="text-left py-3 px-4 font-medium">総件数</th>
                    <th className="text-left py-3 px-4 font-medium">成功</th>
                    <th className="text-left py-3 px-4 font-medium">エラー</th>
                    <th className="text-left py-3 px-4 font-medium">ステータス</th>
                    <th className="text-left py-3 px-4 font-medium">操作</th>
                  </tr>
                </thead>
              </table>
            </div>
            
            {/* スクロール可能なボディ */}
            <div className="overflow-x-auto" style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border-color)', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
              <table className="smarthr-table w-full" style={{ marginBottom: '0' }}>
                <tbody>
                  {uploadsLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <tr key={`upload-loading-${index}`} className="border-b border-[var(--border-color)]">
                        <td colSpan={7} className="py-4 px-4 text-center">
                          <div className="animate-pulse bg-[var(--bg-light)] h-6 rounded"></div>
                        </td>
                      </tr>
                    ))
                  ) : uploads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-[var(--text-secondary)]">
                        アップロード履歴がありません
                      </td>
                    </tr>
                  ) : (
                    uploads.map((upload) => (
                      <tr key={upload.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                        <td className="py-4 px-4 text-sm">
                          {new Date(upload.uploadDate).toLocaleString('ja-JP', {
                            year: 'numeric',
                            month: '2-digit', 
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="py-4 px-4 font-medium">
                          {upload.filename}
                        </td>
                        <td className="py-4 px-4 text-sm">
                          {upload.totalRecords}
                        </td>
                        <td className="py-4 px-4 text-sm">
                          <span className="text-green-600">{upload.successRecords || 0}</span>
                        </td>
                        <td className="py-4 px-4 text-sm">
                          <span className="text-red-600">{upload.errorRecords || 0}</span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2 py-1 rounded text-xs ${
                            upload.status === 'completed' ? 'bg-green-100 text-green-800' :
                            upload.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                            upload.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {upload.status === 'completed' ? '完了' :
                             upload.status === 'partial' ? '部分完了' :
                             upload.status === 'failed' ? '失敗' : '処理中'}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <button
                            onClick={() => handleDeleteUpload(upload.batchId, upload.filename)}
                            style={{ padding: '7px 15px', height: '35px' }}
                            className="smarthr-button bg-red-500 text-white border-transparent hover:bg-red-600 text-sm"
                            title={`このアップロード（${upload.filename}）のデータのみを削除します`}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>


        <div className="smarthr-card w-full">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
              登録済みデータ ({loading ? '読み込み中...' : `ユニーク企業${formatNumber(displayCompanies.length)}件 / 全${formatNumber(totalCount)}件`})
            </h2>
          </div>
          <div>
            <div className="overflow-x-auto">
              <table className="smarthr-table w-full">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '15%' }}>会社名</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '20%' }}>ホームページURL</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '15%' }}>資本金</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '12%' }}>設立年</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '12%' }}>業種</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '14%' }}>上場区分</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '12%' }}>代表者名</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && displayCompanies.length === 0 ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={`loading-${index}`} className="border-b border-[var(--border-color)]">
                        <td colSpan={7} className="py-4 px-4 text-center">
                          <div className="animate-pulse bg-[var(--bg-light)] h-6 rounded"></div>
                        </td>
                      </tr>
                    ))
                  ) : displayCompanies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-[var(--text-secondary)]">
                        登録されているデータがありません
                      </td>
                    </tr>
                  ) : (
                    <>
                      {displayCompanies.map((company, index) => (
                        <tr key={`${company.id}-${index}`} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                          <td className="py-4 px-4 font-medium">
                            {company.companyName}
                          </td>
                          <td className="py-4 px-4">
                            {company.companyWebsite ? (
                              <a 
                                href={company.companyWebsite} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[var(--primary)] hover:underline text-sm break-all"
                              >
                                {company.companyWebsite.length > 40 
                                  ? company.companyWebsite.substring(0, 40) + '...'
                                  : company.companyWebsite
                                }
                              </a>
                            ) : '-'}
                          </td>
                          <td className="py-4 px-4 text-sm">
                            {company.capitalAmountText || '-'}
                          </td>
                          <td className="py-4 px-4 text-sm">
                            {company.establishedYear || '-'}年
                          </td>
                          <td className="py-4 px-4 text-sm">
                            {company.businessCategory || company.industryCategory ? (
                              <span className="bg-[var(--bg-light)] px-2 py-1 rounded text-xs">
                                {company.businessCategory || company.industryCategory}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-4 px-4 text-sm">
                            {company.listingStatus || '-'}
                          </td>
                          <td className="py-4 px-4 text-sm">
                            {company.representative || '-'}
                          </td>
                        </tr>
                      ))}
                      
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* 通知モーダル */}
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
    </div>
  )
}