'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/contexts/AuthContext'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const { login } = useAuth()
  const router = useRouter()

  // デバッグ用：ページ読み込み時にlocalStorageの内容を確認
  useEffect(() => {
    console.log('Users in localStorage:', localStorage.getItem('users'))
    console.log('Passwords in localStorage:', localStorage.getItem('passwords'))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const success = await login({ username, password })
      
      if (success) {
        // ログイン成功後、ユーザーの種類に応じてリダイレクト
        const users = JSON.parse(localStorage.getItem('users') || '[]')
        const user = users.find((u: any) => u.username === username)
        
        console.log('Login successful, user:', user) // デバッグ用
        
        if (user?.type === 'admin') {
          router.push('/admin/users')
        } else {
          router.push('/prtimes')
        }
      } else {
        setError('ユーザーIDまたはパスワードが間違っています')
      }
    } catch (err) {
      setError('ログインに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)] px-4">
      <div className="w-full max-w-md">
        <Card padding={false} style={{ padding: '40px 20px' }}>
          <CardHeader className="text-center" style={{ marginBottom: '15px' }}>
            <CardTitle className="text-2xl text-[var(--primary)]">
              企業データベース
            </CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              ログイン
            </p>
          </CardHeader>
          <CardBody>
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" style={{ padding: '10px 5px' }}>
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="ユーザーID"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="管理者から発行されたユーザーID"
                required
                disabled={loading}
              />
              
              <Input
                label="パスワード"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワードを入力"
                required
                disabled={loading}
              />
              
              <Button
                type="submit"
                className=""
                loading={loading}
                disabled={!username || !password}
                style={{ padding: '10px', width: '150px', margin: '15px auto 0', display: 'block' }}
              >
                ログイン
              </Button>
            </form>

            
          </CardBody>
        </Card>
      </div>
    </div>
  )
}