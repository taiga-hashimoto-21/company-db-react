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
  const [userPasswords, setUserPasswords] = useState<Record<string, string>>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState<string | null>(null)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editingRowData, setEditingRowData] = useState<Partial<User>>({})

  // フォーム状態
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    companyName: '',
    phoneNumber: '',
    email: '',
    type: 'user' as 'admin' | 'user' | 'disabled',
    password: ''
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

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let password = ''
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return password
  }

  const handleGeneratePassword = () => {
    const newPassword = generateRandomPassword()
    setFormData({...formData, password: newPassword})
  }

  const loadUsers = async () => {
    const allUsers = await getAllUsers()
    setUsers(allUsers)
    
    // 各ユーザーのパスワードを取得
    const passwords: Record<string, string> = {}
    for (const user of allUsers) {
      try {
        const response = await fetch(`/api/users/${user.id}/password`)
        if (response.ok) {
          const data = await response.json()
          passwords[user.id] = data.password
        }
      } catch (error) {
        console.error(`Failed to get password for user ${user.username}:`, error)
        passwords[user.id] = '********'
      }
    }
    setUserPasswords(passwords)
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.password.length < 6) {
      showNotification('パスワードは6文字以上で設定してください')
      return
    }

    const success = await createUser({
      username: formData.username,
      name: formData.name,
      companyName: formData.companyName,
      phoneNumber: formData.phoneNumber,
      email: formData.email,
      type: formData.type,
      password: formData.password
    })

    if (success) {
      setShowCreateForm(false)
      setFormData({ username: '', name: '', companyName: '', phoneNumber: '', email: '', type: 'user', password: '' })
      loadUsers()
      showNotification('ユーザーを作成しました')
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
      email: formData.email,
      type: formData.type
    })

    if (success) {
      setEditingUser(null)
      setFormData({ username: '', name: '', companyName: '', phoneNumber: '', email: '', type: 'user', password: '' })
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
      email: editUser.email || '',
      type: editUser.type,
      password: ''
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <Input
                    label="メールアドレス"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
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
                  />
                  <div>
                    <label className="block text-sm font-medium mb-2">パスワード</label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        required
                        placeholder="6文字以上"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleGeneratePassword}
                        className="smarthr-button bg-[var(--secondary)] text-[var(--text-primary)] border-[var(--border-light)] hover:bg-[var(--bg-light)] text-sm"
                        style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}
                      >
                        生成
                      </button>
                    </div>
                  </div>
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
                      setFormData({ username: '', name: '', companyName: '', phoneNumber: '', email: '', type: 'user', password: '' })
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
                  <Input
                    label="メールアドレス"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
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
                      setFormData({ username: '', name: '', companyName: '', phoneNumber: '', email: '', type: 'user', password: '' })
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
          <div>
            <div className="overflow-x-auto">
              <table className="smarthr-table w-full">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-left py-3 px-4 font-medium w-24">ユーザーID</th>
                    <th className="text-left py-3 px-4 font-medium w-24">パスワード</th>
                    <th className="text-left py-3 px-4 font-medium w-24">権限</th>
                    <th className="text-left py-3 px-4 font-medium w-32">会社名</th>
                    <th className="text-left py-3 px-4 font-medium w-48">詳細</th>
                    <th className="text-left py-3 px-4 font-medium w-20">編集</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isEditing = editingRowId === u.id
                    return (
                      <tr key={u.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                        {/* ユーザーID */}
                        <td className="py-4 px-4 font-medium">{u.username}</td>
                        
                        {/* パスワード */}
                        <td className="py-4 px-4 text-sm font-mono">
                          {userPasswords[u.id] || '読み込み中...'}
                        </td>
                        
                        {/* 権限 */}
                        <td className="py-4 px-4">
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
                        <td className="py-4 px-4 text-sm">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingRowData.companyName || ''}
                              onChange={(e) => setEditingRowData({...editingRowData, companyName: e.target.value})}
                              className="w-full px-2 py-1 border border-[var(--border-color)] rounded text-sm"
                            />
                          ) : (u.companyName || '-')}
                        </td>
                        
                        {/* 詳細（氏名、電話番号、メールアドレス） */}
                        <td className="py-4 px-4 text-sm">
                          {isEditing ? (
                            <div className="space-y-2">
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
                              <input
                                type="email"
                                value={editingRowData.email || ''}
                                onChange={(e) => setEditingRowData({...editingRowData, email: e.target.value})}
                                className="w-full px-2 py-1 border border-[var(--border-color)] rounded text-sm"
                                placeholder="メールアドレス"
                              />
                            </div>
                          ) : (
                            <div className="space-y-1 text-xs">
                              <div>{u.name || '-'}</div>
                              <div>{u.phoneNumber || '-'}</div>
                              <div>{u.email || '-'}</div>
                            </div>
                          )}
                        </td>
                        
                        {/* 編集アイコン/ボタン */}
                        <td className="py-4 px-4 w-24">
                          <div className="h-16 flex items-center justify-center">
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