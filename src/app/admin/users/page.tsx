'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { Header } from '@/components/ui/Header'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useAuth } from '@/contexts/AuthContext'

interface User {
  id: string
  username: string
  name: string
  companyName?: string
  phoneNumber?: string
  email?: string
  type: 'admin' | 'user' | 'disabled'
  password?: string
  lastLogin?: string
}

export default function AdminUsersPage() {
  const { user, logout, getAllUsers, createUser, updateUser, updatePassword, deleteUser } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState<string | null>(null)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editingRowData, setEditingRowData] = useState<Partial<User>>({})

  // フィルター状態
  const [filters, setFilters] = useState({
    showAdmin: true,     // 管理者
    showUser: true,      // ユーザー
    showDisabled: true   // 無効
  })

  // フォーム状態
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    companyName: '',
    phoneNumber: '',
    type: 'user' as 'admin' | 'user' | 'disabled'
  })

  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  })
  
  const [notification, setNotification] = useState<{message: string, visible: boolean}>({
    message: '',
    visible: false
  })
  
  // ローディング中は何もしない
  const [isPageLoading, setIsPageLoading] = useState(true)

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
        router.push('/login')
      } else {
        loadUsers()
      }
    }
  }, [user, router, isPageLoading])

  const showNotification = useCallback((message: string) => {
    setNotification({ message, visible: true })
    
    // 5秒後に非表示
    setTimeout(() => {
      setNotification(prev => ({ ...prev, visible: false }))
    }, 5000)
  }, [])


  const loadUsers = async () => {
    const allUsers = await getAllUsers()
    setUsers(allUsers)
  }

  // フィルターされたユーザーリスト
  const filteredUsers = users.filter(user => {
    if (filters.showAdmin && user.type === 'admin') {
      return true
    }
    if (filters.showUser && user.type === 'user') {
      return true
    }
    if (filters.showDisabled && user.type === 'disabled') {
      return true
    }
    return false
  })

  // フィルター用のカウント計算
  const getCounts = () => {
    const adminCount = users.filter(u => u.type === 'admin').length
    const userCount = users.filter(u => u.type === 'user').length
    const disabledCount = users.filter(u => u.type === 'disabled').length
    return { adminCount, userCount, disabledCount }
  }

  const { adminCount, userCount, disabledCount } = getCounts()

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()

    const success = await createUser({
      username: formData.username,
      name: formData.name,
      companyName: formData.companyName,
      phoneNumber: formData.phoneNumber,
      email: '', // 空文字でセット
      type: formData.type,
      password: 'user123' // デフォルトパスワード
    })

    if (success) {
      setShowCreateForm(false)
      setFormData({ username: '', name: '', companyName: '', phoneNumber: '', type: 'user' })
      loadUsers()
      showNotification('ユーザーを作成しました（パスワード: user123）')
    } else {
      showNotification('ユーザー作成に失敗しました（ユーザーIDが重複している可能性があります）')
    }
  }

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return

    const success = updateUser(editingUser.id, {
      name: formData.name,
      companyName: formData.companyName,
      phoneNumber: formData.phoneNumber,
      email: '', // 空文字でセット
      type: formData.type
    })

    if (success) {
      setEditingUser(null)
      setFormData({ username: '', name: '', companyName: '', phoneNumber: '', type: 'user' })
      loadUsers()
      showNotification('ユーザー情報を更新しました')
    } else {
      showNotification('ユーザー更新に失敗しました')
    }
  }

  const handleUpdatePassword = async (userId: string) => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showNotification('パスワードが一致しません')
      return
    }

    if (passwordData.newPassword.length < 6) {
      showNotification('パスワードは6文字以上で設定してください')
      return
    }

    const success = await updatePassword(userId, passwordData.newPassword)
    if (success) {
      setShowPasswordForm(null)
      setPasswordData({ newPassword: '', confirmPassword: '' })
      showNotification('パスワードを更新しました')
    } else {
      showNotification('パスワード更新に失敗しました')
    }
  }

  const handleDeleteUser = async (userId: string, username: string) => {
    if (username === 'admin') {
      showNotification('管理者ユーザーは削除できません')
      return
    }

    if (confirm(`ユーザー「${username}」を削除しますか？`)) {
      const success = await deleteUser(userId)
      if (success) {
        loadUsers()
        showNotification('ユーザーを削除しました')
      } else {
        showNotification('ユーザー削除に失敗しました')
      }
    }
  }

  const startEdit = (editUser: User) => {
    setEditingUser(editUser)
    setFormData({
      username: editUser.username,
      name: editUser.name,
      companyName: editUser.companyName || '',
      phoneNumber: editUser.phoneNumber || '',
      type: editUser.type
    })
  }

  const startInlineEdit = (user: User) => {
    setEditingRowId(user.id)
    setEditingRowData({
      name: user.name,
      companyName: user.companyName || '',
      phoneNumber: user.phoneNumber || '',
      email: user.email || '',
      type: user.type
    })
  }

  const saveInlineEdit = async () => {
    if (!editingRowId || !editingRowData) return

    const updateData = {
      name: editingRowData.name || '',
      companyName: editingRowData.companyName || '',
      phoneNumber: editingRowData.phoneNumber || '',
      email: editingRowData.email || '',
      type: editingRowData.type || 'user'
    }
    
    console.log('Saving user update:', JSON.stringify({ userId: editingRowId, updateData }, null, 2))

    // ユーザー情報の更新
    const success = await updateUser(editingRowId, updateData)

    if (success) {
      loadUsers()
      setEditingRowId(null)
      setEditingRowData({})
      showNotification('ユーザー情報を更新しました')
    } else {
      showNotification('ユーザー更新に失敗しました')
    }
  }

  const cancelInlineEdit = () => {
    setEditingRowId(null)
    setEditingRowData({})
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

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
        title="ユーザー管理"
        user={{ name: user.name, type: user.type }}
        onLogout={handleLogout}
      />
      
      <main style={{ width: '1000px', margin: '0 auto', padding: '32px 24px' }} className="flex flex-col items-center">
        <div className="smarthr-card w-full mb-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">ユーザー管理</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              システムを利用するユーザーの管理を行うことができます
            </p>
          </div>
          <div>
            <div className="flex gap-3" style={{ marginTop: '10px' }}>
              <button
                onClick={() => setShowCreateForm(true)}
                className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)]"
                style={{ padding: '12px 24px', fontSize: '16px' }}
              >
                新規ユーザー作成
              </button>
            </div>
          </div>
        </div>

        {/* 新規ユーザー作成フォーム */}
        {showCreateForm && (
          <div className="smarthr-card w-full mb-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]" style={{ marginBottom: '20px' }}>新規ユーザー作成</h2>
            </div>
            <div>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="mb-4" style={{ width: '50%' }}>
                  <Select
                    label="権限"
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as 'admin' | 'user' | 'disabled'})}
                    options={[
                      { value: 'user', label: 'ユーザー' },
                      { value: 'admin', label: '管理者' },
                      { value: 'disabled', label: '無効' }
                    ]}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2">
                  <Input
                    label="ユーザーID"
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    required
                  />
                  <Input
                    label="氏名"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                  <Input
                    label="会社名"
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                  />
                  <Input
                    label="電話番号"
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                  />
                </div>
                <div className="flex gap-3" style={{ marginTop: '20px' }}>
                  <button 
                    type="submit" 
                    className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)]"
                    style={{ padding: '8px 16px' }}
                  >
                    作成
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false)
                      setFormData({ username: '', name: '', companyName: '', phoneNumber: '', type: 'user' })
                    }}
                    className="smarthr-button bg-[var(--secondary)] text-[var(--text-primary)] border-[var(--border-light)] hover:bg-[var(--bg-light)]"
                    style={{ padding: '8px 16px' }}
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 編集フォーム */}
        {editingUser && (
          <div className="smarthr-card w-full mb-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">ユーザー編集: {editingUser.username}</h2>
            </div>
            <div>
              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="ユーザーID"
                    type="text"
                    value={formData.username}
                    disabled
                  />
                  <Input
                    label="氏名"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                  <Input
                    label="会社名"
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                  />
                  <Input
                    label="電話番号"
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                  />
                  <Select
                    label="権限"
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as 'admin' | 'user' | 'disabled'})}
                    options={[
                      { value: 'user', label: 'ユーザー' },
                      { value: 'admin', label: '管理者' },
                      { value: 'disabled', label: '無効' }
                    ]}
                    disabled={editingUser.username === 'admin'}
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    type="submit" 
                    className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)]"
                    style={{ padding: '8px 16px' }}
                  >
                    更新
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUser(null)
                      setFormData({ username: '', name: '', companyName: '', phoneNumber: '', type: 'user' })
                    }}
                    className="smarthr-button bg-[var(--secondary)] text-[var(--text-primary)] border-[var(--border-light)] hover:bg-[var(--bg-light)]"
                    style={{ padding: '8px 16px' }}
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ユーザー一覧 */}
        <div className="smarthr-card w-full">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ marginBottom: '20px' }}>
              登録済みユーザー ({users.length}名)
            </h2>
          </div>

          {/* フィルター */}
          <div className="bg-gray-50 rounded-lg" style={{ padding: '15px', marginBottom: '10px' }}>
            <div style={{ marginBottom: '10px' }}>
              <span className="text-sm font-medium text-gray-700">表示フィルター</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.showAdmin}
                    onChange={(e) => setFilters({...filters, showAdmin: e.target.checked})}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">管理者</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.showUser}
                    onChange={(e) => setFilters({...filters, showUser: e.target.checked})}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">ユーザー</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.showDisabled}
                    onChange={(e) => setFilters({...filters, showDisabled: e.target.checked})}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">無効</span>
                </label>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-black">管理者 <span className="font-bold text-base" style={{ color: '#00a0a9ff' }}>{adminCount}</span> 人</span>
                <span className="text-black">ユーザー <span className="font-bold text-base" style={{ color: '#00a0a9ff' }}>{userCount}</span> 人</span>
                <span className="text-black">無効 <span className="font-bold text-base" style={{ color: '#00a0a9ff' }}>{disabledCount}</span> 人</span>
              </div>
            </div>
          </div>
          <div>
            <div className="border border-[var(--border-color)] rounded-lg overflow-hidden" style={{ height: 'auto', maxHeight: '400px' }}>
              <div className="overflow-x-auto h-full">
                <table className="smarthr-table w-full">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-[var(--border-color)]">
                      <th className="text-left px-3 font-medium w-24" style={{ paddingTop: '10px', paddingBottom: '10px' }}>ユーザーID</th>
                      <th className="text-left px-3 font-medium w-24" style={{ paddingTop: '10px', paddingBottom: '10px' }}>権限</th>
                      <th className="text-left px-3 font-medium w-32" style={{ paddingTop: '10px', paddingBottom: '10px' }}>会社名</th>
                      <th className="text-left px-3 font-medium w-48" style={{ paddingTop: '10px', paddingBottom: '10px' }}>詳細</th>
                      <th className="text-left px-3 font-medium w-20" style={{ paddingTop: '10px', paddingBottom: '10px' }}>編集</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                    const isEditing = editingRowId === u.id
                    return (
                      <tr key={u.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                        {/* ユーザーID */}
                        <td className="px-3 font-medium" style={{ paddingTop: '10px', paddingBottom: '10px', lineHeight: '22px' }}>{u.username}</td>

                        {/* 権限 */}
                        <td className="px-3" style={{ paddingTop: '10px', paddingBottom: '10px', lineHeight: '22px' }}>
                          {isEditing ? (
                            <select
                              value={editingRowData.type || 'user'}
                              onChange={(e) => setEditingRowData({...editingRowData, type: e.target.value as 'admin' | 'user' | 'disabled'})}
                              className="w-full px-2 py-1 border border-[var(--border-color)] rounded text-sm"
                            >
                              <option value="user">ユーザー</option>
                              <option value="admin">管理者</option>
                              <option value="disabled">無効</option>
                            </select>
                          ) : (
                            <span className={`inline-block rounded-md text-xs ${
                              u.type === 'admin' 
                                ? 'bg-green-100 text-green-800' 
                                : u.type === 'user'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                            style={{ padding: '3px 10px' }}>
                              {u.type === 'admin' ? '管理者' : u.type === 'user' ? 'ユーザー' : '無効'}
                            </span>
                          )}
                        </td>

                        {/* 会社名 */}
                        <td className="px-3 text-sm" style={{ paddingTop: '10px', paddingBottom: '10px', lineHeight: '22px' }}>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingRowData.companyName || ''}
                              onChange={(e) => setEditingRowData({...editingRowData, companyName: e.target.value})}
                              className="w-full px-2 py-1 border border-[var(--border-color)] rounded text-sm"
                            />
                          ) : (u.companyName || '-')}
                        </td>

                        {/* 詳細（氏名、電話番号） */}
                        <td className="px-3 text-sm" style={{ paddingTop: '10px', paddingBottom: '10px', lineHeight: '22px' }}>
                          {isEditing ? (
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={editingRowData.name || ''}
                                onChange={(e) => setEditingRowData({...editingRowData, name: e.target.value})}
                                className="w-full px-2 py-1 border border-[var(--border-color)] rounded text-sm"
                                placeholder="氏名"
                              />
                              <input
                                type="tel"
                                value={editingRowData.phoneNumber || ''}
                                onChange={(e) => setEditingRowData({...editingRowData, phoneNumber: e.target.value})}
                                className="w-full px-2 py-1 border border-[var(--border-color)] rounded text-sm"
                                placeholder="電話番号"
                              />
                            </div>
                          ) : (
                            <div className="space-y-1 text-xs">
                              <div>{u.name || '-'}</div>
                              <div>{u.phoneNumber || '-'}</div>
                            </div>
                          )}
                        </td>

                        {/* 編集アイコン/ボタン */}
                        <td className="px-3 w-24" style={{ paddingTop: '10px', paddingBottom: '10px', lineHeight: '22px' }}>
                          <div className="h-12 flex items-center justify-center">
                            {isEditing ? (
                              <div className="flex flex-col gap-0.5 w-full">
                                <button
                                  onClick={saveInlineEdit}
                                  className="bg-green-500 text-white rounded hover:bg-green-600 text-xs font-medium transition-colors whitespace-nowrap"
                                  style={{ padding: '2px 5px' }}
                                >
                                  保存
                                </button>
                                <button
                                  onClick={cancelInlineEdit}
                                  className="bg-gray-500 text-white rounded hover:bg-gray-600 text-xs font-medium transition-colors whitespace-nowrap"
                                  style={{ padding: '2px 5px' }}
                                >
                                  キャンセル
                                </button>
                                {u.username !== 'admin' && (
                                  <button
                                    onClick={() => {
                                      cancelInlineEdit()
                                      handleDeleteUser(u.id, u.username)
                                    }}
                                    className="bg-red-500 text-white rounded hover:bg-red-600 text-xs font-medium transition-colors whitespace-nowrap"
                                    style={{ padding: '2px 5px' }}
                                  >
                                    削除
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => startInlineEdit(u)}
                                className="p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--bg-light)] rounded transition-colors"
                                title="編集"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="m18.5 2.5 3 3L12 15l-4 1 1-4Z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* パスワード変更ダイアログ */}
        {showPasswordForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>パスワード変更</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  <Input
                    label="新しいパスワード"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                    placeholder="6文字以上"
                  />
                  <Input
                    label="パスワード確認"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                    placeholder="上記と同じパスワード"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleUpdatePassword(showPasswordForm)}
                      className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)]"
                      style={{ padding: '8px 16px' }}
                    >
                      更新
                    </button>
                    <button
                      onClick={() => {
                        setShowPasswordForm(null)
                        setPasswordData({ newPassword: '', confirmPassword: '' })
                      }}
                      className="smarthr-button bg-[var(--secondary)] text-[var(--text-primary)] border-[var(--border-light)] hover:bg-[var(--bg-light)]"
                      style={{ padding: '8px 16px' }}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

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
      </main>
    </div>
  )
}