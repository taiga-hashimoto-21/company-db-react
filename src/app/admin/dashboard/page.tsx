'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { Header } from '@/components/ui/Header'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/contexts/AuthContext'
import { User } from '@/types/auth'
import { Corporate } from '@/types/corporate'

export default function AdminDashboard() {
  const { 
    user, 
    logout, 
    createUser, 
    updateUser, 
    getAllUsers
  } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [companies, setCompanies] = useState<Corporate[]>([])
  const [activeTab, setActiveTab] = useState<'users' | 'companies'>('users')
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [newUser, setNewUser] = useState({
    username: '',
    name: '',
    companyName: '',
    email: '',
    phoneNumber: '',
    isActive: true
  })
  const [newCompany, setNewCompany] = useState({
    companyName: '',
    establishedDate: '',
    postalCode: '',
    address: '',
    industry: 'IT・通信',
    website: ''
  })

  // 管理者認証チェック
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/login')
    } else {
      loadUsers()
      loadCompanies()
    }
  }, [user, router])

  const loadUsers = () => {
    setUsers(getAllUsers())
  }

  const loadCompanies = () => {
    // TODO: 企業データ取得APIを実装
    setCompanies([])
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newUser.username || !newUser.name) return
    
    const success = createUser({
      username: newUser.username,
      name: newUser.name,
      email: newUser.email,
      role: 'user'
    })
    if (success) {
      setNewUser({ username: '', name: '', companyName: '', email: '', phoneNumber: '', isActive: true })
      setShowAddUser(false)
      loadUsers()
    } else {
      alert('ユーザーの作成に失敗しました（ユーザー名が重複している可能性があります）')
    }
  }

  const handleToggleUserStatus = (userId: string, currentStatus: boolean) => {
    updateUser(userId, { isActive: !currentStatus })
    loadUsers()
  }

  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: 企業作成APIを実装
    alert('企業作成機能は準備中です')
  }

  const handleDeleteCompany = (companyId: number) => {
    // TODO: 企業削除APIを実装
    alert('企業削除機能は準備中です')
  }

  if (!user || user.role !== 'admin') {
    return <div>Loading...</div>
  }

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.role === 'user').length,
    inactiveUsers: users.filter(u => u.role === 'data_creator').length,
    totalCompanies: companies.length
  }

  // 業種選択肢
  const industryOptions = [
    'IT・通信', '製造業', '商社・流通', '金融・保険', '不動産・建設',
    'サービス業', '医療・介護', '教育', '運輸・物流', '食品・飲料',
    'エネルギー', 'その他'
  ]

  return (
    <div className="min-h-screen">
      <Header 
        title="管理者ダッシュボード"
        user={{ name: user.name, role: user.role }}
        onLogout={handleLogout}
      >
        <Button onClick={() => router.push('/search')} variant="secondary" size="sm">
          企業検索（プレビュー）
        </Button>
      </Header>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 統計情報 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardBody className="text-center">
              <div className="text-3xl font-bold text-[var(--primary)] mb-2">
                {stats.totalUsers}
              </div>
              <div className="text-[var(--text-secondary)]">総ユーザー数</div>
            </CardBody>
          </Card>
          
          <Card>
            <CardBody className="text-center">
              <div className="text-3xl font-bold text-[var(--success)] mb-2">
                {stats.activeUsers}
              </div>
              <div className="text-[var(--text-secondary)]">一般ユーザー数</div>
            </CardBody>
          </Card>
          
          <Card>
            <CardBody className="text-center">
              <div className="text-3xl font-bold text-[var(--error)] mb-2">
                {stats.inactiveUsers}
              </div>
              <div className="text-[var(--text-secondary)]">データ作成者数</div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="text-center">
              <div className="text-3xl font-bold text-orange-500 mb-2">
                {stats.totalCompanies}
              </div>
              <div className="text-[var(--text-secondary)]">登録企業数</div>
            </CardBody>
          </Card>
        </div>

        {/* タブ切り替え */}
        <div className="mb-6">
          <div className="flex border-b border-[var(--border-color)]">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'users'
                  ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              ユーザー管理
            </button>
            <button
              onClick={() => setActiveTab('companies')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'companies'
                  ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              企業管理
            </button>
          </div>
        </div>

        {/* ユーザー管理 */}
        {activeTab === 'users' && (
          <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>ユーザー管理</CardTitle>
              <Button 
                onClick={() => setShowAddUser(!showAddUser)}
                variant={showAddUser ? 'secondary' : 'primary'}
              >
                {showAddUser ? 'キャンセル' : '新規ユーザー追加'}
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            {/* ユーザー追加フォーム */}
            {showAddUser && (
              <div className="mb-6 p-4 bg-[var(--bg-light)] rounded-lg">
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="ユーザーID *"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      placeholder="login_id"
                      required
                    />
                    <Input
                      label="氏名 *"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                      placeholder="山田太郎"
                      required
                    />
                    <Input
                      label="会社名 *"
                      value={newUser.companyName}
                      onChange={(e) => setNewUser({ ...newUser, companyName: e.target.value })}
                      placeholder="株式会社〇〇"
                      required
                    />
                    <Input
                      label="メールアドレス *"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="user@company.co.jp"
                      required
                    />
                    <Input
                      label="電話番号"
                      type="tel"
                      value={newUser.phoneNumber}
                      onChange={(e) => setNewUser({ ...newUser, phoneNumber: e.target.value })}
                      placeholder="03-1234-5678"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button type="submit">ユーザー作成</Button>
                    <Button 
                      type="button" 
                      variant="secondary" 
                      onClick={() => setShowAddUser(false)}
                    >
                      キャンセル
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    ※ユーザーはパスワード不要でログイン可能です
                  </p>
                </form>
              </div>
            )}

            {/* ユーザー一覧 */}
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
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                      <td className="py-4 px-4">
                        <div className="font-medium">{u.username}</div>
                        <div className={`text-xs px-2 py-1 rounded mt-1 inline-block ${
                          u.role === 'admin' 
                            ? 'bg-blue-100 text-blue-800' 
                            : u.role === 'data_creator'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {u.role === 'admin' ? '管理者' : u.role === 'data_creator' ? 'データ作成者' : 'ユーザー'}
                        </div>
                      </td>
                      <td className="py-4 px-4">{u.name}</td>
                      <td className="py-4 px-4">{u.email || '-'}</td>
                      <td className="py-4 px-4">{u.role}</td>
                      <td className="py-4 px-4">
                        {u.lastLogin 
                          ? new Date(u.lastLogin).toLocaleDateString('ja-JP')
                          : '-'
                        }
                      </td>
                      <td className="py-4 px-4">
                        <Button size="sm" variant="secondary">
                          編集
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
        )}

        {/* 企業管理 */}
        {activeTab === 'companies' && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>企業管理</CardTitle>
                <Button 
                  onClick={() => setShowAddCompany(!showAddCompany)}
                  variant={showAddCompany ? 'secondary' : 'primary'}
                >
                  {showAddCompany ? 'キャンセル' : '新規企業登録'}
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              {/* 企業追加フォーム */}
              {showAddCompany && (
                <div className="mb-6 p-4 bg-[var(--bg-light)] rounded-lg">
                  <form onSubmit={handleCreateCompany} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="企業名 *"
                        value={newCompany.companyName}
                        onChange={(e) => setNewCompany({ ...newCompany, companyName: e.target.value })}
                        placeholder="株式会社〇〇"
                        required
                      />
                      <Input
                        label="設立年月日 *"
                        type="date"
                        value={newCompany.establishedDate}
                        onChange={(e) => setNewCompany({ ...newCompany, establishedDate: e.target.value })}
                        required
                      />
                      <Input
                        label="郵便番号"
                        value={newCompany.postalCode}
                        onChange={(e) => setNewCompany({ ...newCompany, postalCode: e.target.value })}
                        placeholder="000-0000"
                      />
                      <Input
                        label="所在地 *"
                        value={newCompany.address}
                        onChange={(e) => setNewCompany({ ...newCompany, address: e.target.value })}
                        placeholder="都道府県市区町村番地"
                        required
                      />
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                          業種 *
                        </label>
                        <select
                          value={newCompany.industry}
                          onChange={(e) => setNewCompany({ ...newCompany, industry: e.target.value })}
                          className="w-full px-3 py-2 border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                          required
                        >
                          {industryOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <Input
                        label="ホームページURL"
                        type="url"
                        value={newCompany.website}
                        onChange={(e) => setNewCompany({ ...newCompany, website: e.target.value })}
                        placeholder="https://www.company.co.jp"
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button type="submit">企業登録</Button>
                      <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={() => setShowAddCompany(false)}
                      >
                        キャンセル
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {/* 企業一覧 */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border-color)]">
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">企業名</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">業種</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">設立年月日</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">所在地</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">ホームページ</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">アクション</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 px-4 text-center text-[var(--text-secondary)]">
                          登録されている企業がありません
                        </td>
                      </tr>
                    ) : (
                      companies.map((company) => (
                        <tr key={company.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                          <td className="py-4 px-4">
                            <div className="font-semibold text-[var(--text-primary)]">
                              {company.companyName}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] mt-1">
                              ID: {company.id}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-block bg-[var(--bg-light)] text-[var(--text-primary)] px-2 py-1 rounded-md text-sm">
                              {company.industry}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-[var(--text-primary)]">
                            {new Date(company.establishedDate).toLocaleDateString('ja-JP')}
                          </td>
                          <td className="py-4 px-4 text-[var(--text-primary)]">
                            <div>{company.address}</div>
                            {company.postalCode && (
                              <div className="text-xs text-[var(--text-secondary)]">
                                〒{company.postalCode}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            {company.website ? (
                              <a 
                                href={company.website} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[var(--primary)] hover:underline text-sm break-all"
                              >
                                {company.website}
                              </a>
                            ) : (
                              <span className="text-[var(--text-light)] text-sm">-</span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDeleteCompany(company.id)}
                            >
                              削除
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}
      </main>
    </div>
  )
}