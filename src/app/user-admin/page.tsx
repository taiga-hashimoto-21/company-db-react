'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { Header } from '@/components/ui/Header'
import { useAuth } from '@/contexts/AuthContext'

interface UserFormData {
  username: string
  name: string
  email: string
  role: 'admin' | 'data_creator' | 'user'
  password: string
}

const initialFormData: UserFormData = {
  username: '',
  name: '',
  email: '',
  role: 'user',
  password: ''
}

export default function UserAdminPage() {
  const { user, logout, getAllUsers, createUser, updateUser, deleteUser } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [formData, setFormData] = useState<UserFormData>(initialFormData)
  const [loading, setLoading] = useState(false)

  // 権限チェック（管理者のみアクセス可能）
  useEffect(() => {
    if (!user) {
      router.push('/login')
    } else if (user.role !== 'admin') {
      router.push('/search')
    }
  }, [user, router])

  // ユーザー一覧取得
  const fetchUsers = () => {
    if (user?.role === 'admin') {
      const allUsers = getAllUsers()
      setUsers(allUsers)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [user])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const handleCreateUser = () => {
    setShowCreateForm(true)
    setEditingUser(null)
    setFormData(initialFormData)
  }

  const handleEditUser = (userToEdit: any) => {
    setShowCreateForm(true)
    setEditingUser(userToEdit)
    setFormData({
      username: userToEdit.username,
      name: userToEdit.name,
      email: userToEdit.email || '',
      role: userToEdit.role,
      password: '' // パスワードは編集時は空にする
    })
  }

  const handleDeleteUser = (userId: number) => {
    if (userId === user?.id) {
      alert('自分自身は削除できません')
      return
    }

    if (confirm('このユーザーを削除しますか？')) {
      const success = deleteUser(userId)
      if (success) {
        fetchUsers()
        alert('ユーザーを削除しました')
      } else {
        alert('ユーザーの削除に失敗しました')
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (editingUser) {
        // ユーザー更新
        const updates: any = {
          name: formData.name,
          email: formData.email,
          role: formData.role
        }
        
        // パスワードが入力されている場合のみ更新
        if (formData.password.trim()) {
          // パスワード更新ロジックは省略（実際の運用では適切に実装）
          alert('パスワード更新は現在未対応です')
        }

        const success = updateUser(editingUser.id, updates)
        if (success) {
          fetchUsers()
          setShowCreateForm(false)
          alert('ユーザー情報を更新しました')
        } else {
          alert('ユーザー情報の更新に失敗しました')
        }
      } else {
        // ユーザー作成
        if (!formData.username.trim() || !formData.password.trim()) {
          alert('ユーザー名とパスワードは必須です')
          return
        }

        const success = createUser({
          username: formData.username,
          name: formData.name,
          email: formData.email,
          role: formData.role
        })

        if (success) {
          fetchUsers()
          setShowCreateForm(false)
          setFormData(initialFormData)
          alert('ユーザーを作成しました')
        } else {
          alert('ユーザーの作成に失敗しました（ユーザー名が重複している可能性があります）')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const getRoleBadge = (role: string) => {
    const colors = {
      admin: 'bg-red-100 text-red-800',
      data_creator: 'bg-blue-100 text-blue-800',
      user: 'bg-green-100 text-green-800'
    }
    
    const labels = {
      admin: '管理者',
      data_creator: 'データ作成者',
      user: '一般ユーザー'
    }

    return (
      <span className={`px-2 py-1 rounded text-xs ${colors[role as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {labels[role as keyof typeof labels] || role}
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
        title="ユーザー管理"
        user={{ name: user.name, role: user.role }}
        onLogout={handleLogout}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ユーザー作成・編集フォーム */}
        {showCreateForm && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>
                  {editingUser ? 'ユーザー編集' : '新規ユーザー作成'}
                </CardTitle>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCreateForm(false)}
                >
                  ✕ 閉じる
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      ユーザー名 *
                    </label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full px-4 py-3 border border-[var(--border-color)] rounded-md 
                                 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                      disabled={loading || !!editingUser}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      表示名 *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 border border-[var(--border-color)] rounded-md 
                                 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                      disabled={loading}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      メールアドレス
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 border border-[var(--border-color)] rounded-md 
                                 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                      disabled={loading}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      権限 *
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as any }))}
                      className="w-full px-4 py-3 border border-[var(--border-color)] rounded-md 
                                 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                      disabled={loading}
                      required
                    >
                      <option value="user">一般ユーザー</option>
                      <option value="data_creator">データ作成者</option>
                      <option value="admin">管理者</option>
                    </select>
                  </div>
                  
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      パスワード {editingUser ? '（変更する場合のみ入力）' : '*'}
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-4 py-3 border border-[var(--border-color)] rounded-md 
                                 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                      disabled={loading}
                      required={!editingUser}
                    />
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Button
                    type="submit"
                    disabled={loading}
                    loading={loading}
                  >
                    {editingUser ? '更新' : '作成'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCreateForm(false)}
                    disabled={loading}
                  >
                    キャンセル
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        )}

        {/* ユーザー一覧 */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>ユーザー一覧</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={fetchUsers}
                  size="sm"
                >
                  🔄 更新
                </Button>
                <Button
                  onClick={handleCreateUser}
                  size="sm"
                >
                  ＋ 新規作成
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">ユーザー名</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">表示名</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">メール</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">権限</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">最終ログイン</th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-[var(--text-secondary)]">
                        ユーザーがありません
                      </td>
                    </tr>
                  ) : (
                    users.map((userItem) => (
                      <tr key={userItem.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                        <td className="py-4 px-4 font-mono text-sm text-[var(--text-primary)]">
                          {userItem.username}
                        </td>
                        <td className="py-4 px-4 text-[var(--text-primary)]">
                          {userItem.name}
                          {userItem.id === user.id && (
                            <span className="ml-2 text-xs text-[var(--text-secondary)]">(自分)</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-[var(--text-secondary)]">
                          {userItem.email || '-'}
                        </td>
                        <td className="py-4 px-4">
                          {getRoleBadge(userItem.role)}
                        </td>
                        <td className="py-4 px-4 text-[var(--text-secondary)]">
                          {userItem.lastLogin 
                            ? new Date(userItem.lastLogin).toLocaleString('ja-JP')
                            : '-'
                          }
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleEditUser(userItem)}
                            >
                              編集
                            </Button>
                            {userItem.id !== user.id && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleDeleteUser(userItem.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                削除
                              </Button>
                            )}
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