'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { Header } from '@/components/ui/Header'
import { useAuth } from '@/contexts/AuthContext'

interface CSVTask {
  id: number
  name: string
  totalCount: number
  processedCount: number
  successCount: number
  failedCount: number
  status: string
  createdBy: string
  createdAt: string
  progress: number
}

export default function DataAdminPage() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [tasks, setTasks] = useState<CSVTask[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [taskName, setTaskName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // 権限チェック（管理者のみアクセス可能）
  useEffect(() => {
    if (!user) {
      router.push('/login')
    } else if (user.role !== 'admin') {
      router.push('/search')
    }
  }, [user, router])

  // タスク一覧取得
  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/csv/upload')
      const data = await response.json()
      
      if (data.success) {
        setTasks(data.tasks)
      } else {
        console.error('タスク取得エラー:', data.error)
      }
    } catch (error) {
      console.error('タスク取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && user.role === 'admin') {
      fetchTasks()
    }
  }, [user, fetchTasks])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setSelectedFile(file || null)
    setUploadResult(null)
  }

  const handleUpload = async () => {
    if (!selectedFile || !taskName.trim()) {
      alert('CSVファイルとタスク名を入力してください')
      return
    }

    setUploading(true)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append('csvFile', selectedFile)
      formData.append('taskName', taskName.trim())
      formData.append('createdBy', user?.name || 'unknown')

      const response = await fetch('/api/csv/upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        setUploadResult(result)
        setTaskName('')
        setSelectedFile(null)
        fetchTasks() // タスク一覧を更新
        
        // ファイル入力をリセット
        const fileInput = document.getElementById('csvFile') as HTMLInputElement
        if (fileInput) fileInput.value = ''
        
      } else {
        alert(`アップロードエラー: ${result.error}`)
      }

    } catch (error) {
      console.error('アップロードエラー:', error)
      alert('アップロード中にエラーが発生しました')
    } finally {
      setUploading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800'
    }
    
    const labels = {
      pending: '待機中',
      processing: '処理中',
      completed: '完了',
      failed: 'エラー'
    }

    return (
      <span className={`px-2 py-1 rounded text-xs ${colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    )
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header 
        title="データ収集管理"
        user={{ name: user.name, role: user.role }}
        onLogout={handleLogout}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* CSVアップロード */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>CSVファイルアップロード</CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              国税庁APIから取得した企業データCSVをアップロードして、ホームページURL収集タスクを作成します
            </p>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  タスク名
                </label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="例: 2024年1月登録企業_1000件"
                  className="w-full px-4 py-3 border border-[var(--border-color)] rounded-md 
                             focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                  disabled={uploading}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  CSVファイル
                </label>
                <input
                  id="csvFile"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="w-full px-4 py-3 border border-[var(--border-color)] rounded-md 
                             focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                  disabled={uploading}
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  CSVファイルのみ対応（最大10MB）。必須項目: 法人名, 本店所在地
                </p>
              </div>
              
              <div className="flex gap-3">
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || !taskName.trim() || uploading}
                  loading={uploading}
                  className="px-6 py-3"
                >
                  {uploading ? 'アップロード中...' : 'アップロード'}
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* アップロード結果 */}
        {uploadResult && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-green-600">✅ アップロード完了</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-2">
                <p><strong>タスク名:</strong> {uploadResult.task.name}</p>
                <p><strong>企業数:</strong> {uploadResult.task.totalCount.toLocaleString()}件</p>
                <p><strong>作成日:</strong> {new Date(uploadResult.task.createdAt).toLocaleString('ja-JP')}</p>
              </div>
              
              {uploadResult.preview && (
                <div className="mt-4">
                  <h4 className="font-medium text-[var(--text-primary)] mb-2">データプレビュー（最初の5件）:</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border border-[var(--border-color)] rounded">
                      <thead>
                        <tr className="bg-[var(--bg-light)]">
                          {Object.keys(uploadResult.preview[0] || {}).map((key) => (
                            <th key={key} className="px-3 py-2 text-left text-xs font-medium">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {uploadResult.preview.map((row: any, index: number) => (
                          <tr key={index} className="border-t">
                            {Object.values(row).map((value: any, i: number) => (
                              <td key={i} className="px-3 py-2 text-xs">
                                {String(value).substring(0, 50)}
                                {String(value).length > 50 ? '...' : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* タスク一覧 */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>データ収集タスク一覧</CardTitle>
              <Button
                variant="secondary"
                onClick={fetchTasks}
                disabled={loading}
                size="sm"
              >
                🔄 更新
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">タスク名</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">ステータス</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">進捗</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">件数</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">成功率</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">作成者</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">作成日</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 px-4 text-center text-[var(--text-secondary)]">
                        読み込み中...
                      </td>
                    </tr>
                  ) : tasks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 px-4 text-center text-[var(--text-secondary)]">
                        タスクがありません
                      </td>
                    </tr>
                  ) : (
                    tasks.map((task) => (
                      <tr key={task.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                        <td className="py-4 px-4">
                          <div className="font-medium text-[var(--text-primary)]">
                            {task.name}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {getStatusBadge(task.status)}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-[var(--primary)] h-2 rounded-full transition-all duration-300"
                                style={{ width: `${task.progress}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-[var(--text-secondary)]">
                              {task.progress}%
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-[var(--text-primary)]">
                          {task.processedCount.toLocaleString()} / {task.totalCount.toLocaleString()}
                        </td>
                        <td className="py-4 px-4 text-[var(--text-primary)]">
                          {task.processedCount > 0 
                            ? `${Math.round((task.successCount / task.processedCount) * 100)}%`
                            : '-'
                          }
                        </td>
                        <td className="py-4 px-4 text-[var(--text-secondary)]">
                          {task.createdBy}
                        </td>
                        <td className="py-4 px-4 text-[var(--text-secondary)]">
                          {new Date(task.createdAt).toLocaleDateString('ja-JP')}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={task.status !== 'pending'}
                            >
                              実行
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                            >
                              詳細
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </main>
    </div>
  )
}