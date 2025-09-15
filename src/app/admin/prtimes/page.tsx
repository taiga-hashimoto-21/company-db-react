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
  const [totalCount, setTotalCount] = useState(0) // 重複除去前の全件数
  const [uniqueCount, setUniqueCount] = useState(0) // 重複除去後のユニーク件数
  const [uploads, setUploads] = useState<any[]>([])
  const [uploadsLoading, setUploadsLoading] = useState(false)
  const [notification, setNotification] = useState<{message: string, visible: boolean}>({
    message: '',
    visible: false
  })
  const [uploadProgress, setUploadProgress] = useState<{
    show: boolean
    processed: number
    total: number
    errors: number
    fileName: string
  }>({
    show: false,
    processed: 0,
    total: 0,
    errors: 0,
    fileName: ''
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
      // 検索APIを使って全ユニーク企業データを取得
      const response = await fetch('/api/prtimes/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ exportAll: true })
      })
      if (!response.ok) throw new Error('Failed to fetch companies')

      const data = await response.json()
      setAllCompanies(data.companies)
      setTotalCount(data.pagination.totalRawCount || data.pagination.totalCount) // 全件数
      setUniqueCount(data.pagination.uniqueCount || data.companies.length) // ユニーク企業数
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
      
      setTotalCount(data.pagination.totalCount) // 全件数
      setUniqueCount(data.pagination.uniqueCount) // ユニーク企業数（APIから取得）
      setHasMoreAdminData(data.pagination.hasNextPage)
    } catch (error) {
      console.error('Error fetching companies:', error)
    } finally {
      setLoading(false)
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

  // 管理者画面用データの生成（検索APIで既にユニーク化済み）
  const displayCompanies = useMemo(() => {
    // 検索APIで既にDISTINCT ON (company_name, company_website)済みなので
    // フロントエンドでの重複除去は不要、ソートのみ
    return allCompanies
      .map(company => ({ ...company, pressReleaseCount: 1 }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
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

  const monitorUploadProgress = useCallback(async (batchId: string) => {
    console.log('🔄 Progress monitoring started for batchId:', batchId)
    
    const checkProgress = async () => {
      try {
        console.log('📡 Fetching progress for:', batchId)
        const response = await fetch(`/api/prtimes/progress/${batchId}`)
        console.log('📡 Response status:', response.status)
        
        if (!response.ok) {
          console.error('❌ Progress API error:', response.status)
          return
        }
        
        const progress = await response.json()
        console.log('📊 Progress data:', progress)
        
        setUploadProgress(prev => ({
          ...prev,
          processed: progress.processed,
          total: progress.total,
          errors: progress.errors,
          fileName: prev.fileName // ファイル名を保持
        }))
        
        // まだ処理中なら続行（より頻繁にチェック）
        if (progress.status === 'processing' || progress.processed < progress.total) {
          setTimeout(checkProgress, 300) // 0.3秒後に再チェック（より高速）
        } else {
          // 完了時の処理
          console.log('✅ Upload completed!')
          const successCount = progress.success || 0
          const errorCount = progress.errors || 0
          
          // 完了通知
          if (successCount > 0) {
            showNotification(`アップロード完了: 成功 ${successCount}件${errorCount > 0 ? `, エラー ${errorCount}件` : ''}`)
          } else {
            showNotification(`アップロード失敗: エラー ${errorCount}件`)
          }
          
          // データ再読み込み
          if (successCount > 0) {
            await loadAllAdminData()
            await fetchUploads()
          }
          
          setTimeout(() => {
            setUploadProgress(prev => ({ ...prev, show: false, fileName: '' }))
          }, 3000) // 3秒後にプログレスバーを非表示
        }
      } catch (error) {
        console.error('Progress check error:', error)
      }
    }
    
    // 初回チェックを少し遅らせる
    setTimeout(checkProgress, 500)
  }, [fetchUploads])

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

    // アップロード中のファイル名を最初に保存（selectedFileがnullになる前に）
    const fileName = selectedFile.name

    setUploading(true)

    // CSVの行数を事前に取得してプログレスバーの初期設定
    const fileContent = await selectedFile.text()
    const lines = fileContent.split('\n').filter(line => line.trim() !== '')
    const totalRows = Math.max(0, lines.length - 2) // ヘッダーを除く

    setUploadProgress({
      show: true,
      processed: 0,
      total: totalRows,
      errors: 0,
      fileName: fileName
    })

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
      console.log('📤 Upload started:', result)

      // アップロード開始後、進捗を監視
      if (result.batchId) {
        console.log('🎯 Starting progress monitoring for batchId:', result.batchId)
        monitorUploadProgress(result.batchId)
      } else {
        console.error('❌ No batchId in upload result')
      }

      // 非同期処理のため、ここではファイル入力をクリアするのみ
      setUploadResult(null)
      setSelectedFile(null)

      const fileInput = document.getElementById('csvFile') as HTMLInputElement
      if (fileInput) fileInput.value = ''
      
    } catch (error) {
      console.error('Upload error:', error)
      showNotification('アップロードに失敗しました')
    } finally {
      setUploading(false)
      // エラー時はプログレスバーとファイル名をクリア
      if (!uploadProgress.show) {
        setUploadProgress(prev => ({ ...prev, fileName: '' }))
      }
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
              
              {/* プログレスバー */}
              {(uploading || uploadProgress.show) && (
                <div className="mt-4">
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">CSV処理中... ({uploadProgress.fileName})</span>
                    <span className="text-[var(--text-primary)]">
                      {uploadProgress.processed} / {uploadProgress.total} 件 ({Math.round((uploadProgress.processed / uploadProgress.total) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-lg h-3">
                    <div 
                      className="bg-[var(--primary)] h-3 rounded-lg transition-all duration-300 ease-out"
                      style={{ 
                        width: `${uploadProgress.total > 0 ? (uploadProgress.processed / uploadProgress.total) * 100 : 0}%` 
                      }}
                    ></div>
                  </div>
                  {uploadProgress.errors > 0 && (
                    <div className="mt-2 text-sm text-red-600">
                      エラー: {uploadProgress.errors} 件
                    </div>
                  )}
                </div>
              )}
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
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '180px', minWidth: '180px', maxWidth: '180px' }}>アップロード日時</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '160px', minWidth: '160px', maxWidth: '160px' }}>ファイル名</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>総件数</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>成功</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>エラー</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>ステータス</th>
                    <th className="text-left py-3 px-4 font-medium" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>操作</th>
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
                        <td className="py-4 px-4 text-sm text-left" style={{ width: '180px', minWidth: '180px', maxWidth: '180px' }}>
                          <div className="truncate">
                            {new Date(upload.uploadDate).toLocaleString('ja-JP', {
                              year: 'numeric',
                              month: '2-digit', 
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </td>
                        <td className="py-4 px-4 font-medium text-left" style={{ width: '160px', minWidth: '160px', maxWidth: '160px' }}>
                          <div className="truncate" title={upload.filename}>
                            {upload.filename}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-sm text-left" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
                          <div className="truncate">
                            {upload.totalRecords}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-sm text-left" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
                          <div className="truncate">
                            <span className="text-green-600">{upload.successRecords || 0}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-sm text-left" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
                          <div className="truncate">
                            <span className="text-red-600">{upload.errorRecords || 0}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-left" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>
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
                        <td className="py-4 px-4 text-left" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
                          <button
                            onClick={() => handleDeleteUpload(upload.batchId, upload.filename)}
                            style={{ padding: '3px 15px', height: '25px', fontSize: '12px' }}
                            className="smarthr-button bg-red-500 text-white border-transparent hover:bg-red-600"
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
              登録済みデータ ({loading ? '読み込み中...' : `ユニーク企業${formatNumber(uniqueCount)}件 / 全${formatNumber(totalCount)}件`})
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