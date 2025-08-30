'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { Header } from '@/components/ui/Header'
import { useAuth } from '@/contexts/AuthContext'

interface ExportTask {
  id: string
  date: string
  count: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  filename?: string
  createdAt: string
}

export default function DataCreatorPage() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [exportDate, setExportDate] = useState('')
  const [exportCount, setExportCount] = useState(1000)
  const [tasks, setTasks] = useState<ExportTask[]>([])
  const [isExporting, setIsExporting] = useState(false)

  // 権限チェック（データ作成者または管理者のみアクセス可能）
  useEffect(() => {
    if (!user) {
      router.push('/login')
    } else if (user.role !== 'data_creator' && user.role !== 'admin') {
      router.push('/search')
    }
  }, [user, router])

  // 今日の日付をデフォルトに設定
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setExportDate(today)
  }, [])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const handleExport = async () => {
    if (!exportDate || exportCount < 1) {
      alert('日付と件数を正しく入力してください')
      return
    }

    setIsExporting(true)
    
    try {
      const response = await fetch('/api/houjin/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: exportDate,
          count: exportCount,
          createdBy: user?.name || 'unknown'
        })
      })

      const result = await response.json()

      if (result.success) {
        // タスクリストに追加
        const newTask: ExportTask = {
          id: result.taskId,
          date: exportDate,
          count: exportCount,
          status: 'pending',
          progress: 0,
          createdAt: new Date().toISOString()
        }
        setTasks(prev => [newTask, ...prev])
        alert('エクスポートタスクを開始しました')
        
        // フォームリセット
        setExportCount(1000)
      } else {
        alert(`エクスポートエラー: ${result.error}`)
      }
    } catch (error) {
      console.error('エクスポートエラー:', error)
      alert('エクスポート中にエラーが発生しました')
    } finally {
      setIsExporting(false)
    }
  }

  const downloadCSV = (task: ExportTask) => {
    if (task.filename) {
      const link = document.createElement('a')
      link.href = `/api/houjin/download/${task.filename}`
      link.download = task.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800'
    }
    
    const labels = {
      pending: '待機中',
      running: '実行中',
      completed: '完了',
      failed: 'エラー'
    }

    return (
      <span className={`px-2 py-1 rounded text-xs ${colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    )
  }

  if (!user || (user.role !== 'data_creator' && user.role !== 'admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header 
        title="データ作成"
        user={{ name: user.name, role: user.role }}
        onLogout={handleLogout}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 国税庁APIからCSVエクスポート */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>国税庁APIから企業データCSV出力</CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              指定した日付の企業情報を国税庁法人番号公表サイトAPIから取得し、CSVファイルとして出力します
            </p>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    取得対象日
                  </label>
                  <input
                    type="date"
                    value={exportDate}
                    onChange={(e) => setExportDate(e.target.value)}
                    className="w-full px-4 py-3 border border-[var(--border-color)] rounded-md 
                               focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                    disabled={isExporting}
                  />
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    この日以降に更新された企業データを取得します
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    取得件数
                  </label>
                  <input
                    type="number"
                    value={exportCount}
                    onChange={(e) => setExportCount(Math.max(1, parseInt(e.target.value) || 1))}
                    min="1"
                    max="50000"
                    className="w-full px-4 py-3 border border-[var(--border-color)] rounded-md 
                               focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                    disabled={isExporting}
                  />
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    最大50,000件まで指定可能
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button
                  onClick={handleExport}
                  disabled={!exportDate || exportCount < 1 || isExporting}
                  loading={isExporting}
                  className="px-6 py-3"
                >
                  {isExporting ? 'エクスポート中...' : 'CSVエクスポート実行'}
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* エクスポート履歴 */}
        <Card>
          <CardHeader>
            <CardTitle>エクスポート履歴</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">対象日</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">件数</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">ステータス</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">進捗</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">作成日時</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-[var(--text-secondary)]">
                        エクスポート履歴がありません
                      </td>
                    </tr>
                  ) : (
                    tasks.map((task) => (
                      <tr key={task.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                        <td className="py-4 px-4 text-[var(--text-primary)]">
                          {new Date(task.date).toLocaleDateString('ja-JP')}
                        </td>
                        <td className="py-4 px-4 text-[var(--text-primary)]">
                          {task.count.toLocaleString()}件
                        </td>
                        <td className="py-4 px-4">
                          {getStatusBadge(task.status)}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-20">
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
                        <td className="py-4 px-4 text-[var(--text-secondary)]">
                          {new Date(task.createdAt).toLocaleString('ja-JP')}
                        </td>
                        <td className="py-4 px-4">
                          {task.status === 'completed' && task.filename ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => downloadCSV(task)}
                            >
                              ダウンロード
                            </Button>
                          ) : (
                            <span className="text-xs text-[var(--text-secondary)]">-</span>
                          )}
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