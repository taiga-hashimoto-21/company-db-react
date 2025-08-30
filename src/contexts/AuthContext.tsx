'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface User {
  id: number
  username: string
  name: string
  email?: string
  type: 'admin' | 'user'
  lastLogin?: string
}

interface AuthState {
  isAuthenticated: boolean
  user: User | null
}

interface LoginRequest {
  username: string
  password: string
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginRequest) => Promise<boolean>
  logout: () => void
  createUser: (userData: Omit<User, 'id'>, password: string) => boolean
  updateUser: (userId: number, updates: Partial<User>) => boolean
  updatePassword: (userId: number, newPassword: string) => boolean
  deleteUser: (userId: number) => boolean
  getAllUsers: () => User[]
  getUserPassword: (username: string) => string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// デフォルトユーザー（実際の運用では削除）
const defaultUsers: User[] = [
  {
    id: 1,
    username: 'admin',
    name: 'システム管理者',
    email: 'admin@company-db.local',
    type: 'admin'
  },
  {
    id: 2,
    username: 'user1',
    name: '一般ユーザー',
    email: 'user1@company-db.local',
    type: 'user'
  }
]

// デフォルトパスワード（実際の運用では削除）
const defaultPasswords: Record<string, string> = {
  'admin': 'admin123',
  'user1': 'user123'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null
  })

  // 初期化
  useEffect(() => {
    const existingUsers = localStorage.getItem('users')
    console.log('Existing users in localStorage:', existingUsers)
    if (!existingUsers) {
      console.log('Setting default users and passwords')
      localStorage.setItem('users', JSON.stringify(defaultUsers))
      localStorage.setItem('passwords', JSON.stringify(defaultPasswords))
    }

    // 認証状態の復元
    const storedAuth = localStorage.getItem('authState')
    if (storedAuth) {
      const parsed = JSON.parse(storedAuth)
      setAuthState(parsed)
    }
  }, [])

  const login = async (credentials: LoginRequest): Promise<boolean> => {
    const users: User[] = JSON.parse(localStorage.getItem('users') || '[]')
    const passwords: Record<string, string> = JSON.parse(localStorage.getItem('passwords') || '{}')
    
    console.log('Login attempt:', credentials)
    console.log('Available users:', users)
    console.log('Available passwords:', passwords)
    
    const user = users.find(u => u.username === credentials.username)
    console.log('Found user:', user)
    
    if (user && passwords[credentials.username] === credentials.password) {
      // 最終ログイン時刻更新
      user.lastLogin = new Date().toISOString()
      
      const newAuthState = {
        isAuthenticated: true,
        user
      }
      setAuthState(newAuthState)
      localStorage.setItem('authState', JSON.stringify(newAuthState))
      
      // ユーザー情報更新
      const updatedUsers = users.map(u => u.id === user.id ? user : u)
      localStorage.setItem('users', JSON.stringify(updatedUsers))
      
      return true
    }
    
    return false
  }

  const logout = () => {
    setAuthState({
      isAuthenticated: false,
      user: null
    })
    localStorage.removeItem('authState')
  }

  const createUser = (userData: Omit<User, 'id'>, password: string): boolean => {
    if (authState.user?.type !== 'admin') return false

    const users: User[] = JSON.parse(localStorage.getItem('users') || '[]')
    const passwords: Record<string, string> = JSON.parse(localStorage.getItem('passwords') || '{}')
    
    // ユーザー名重複チェック
    if (users.some(u => u.username === userData.username)) {
      return false
    }

    const newUser: User = {
      ...userData,
      id: Math.max(...users.map(u => u.id)) + 1
    }

    const updatedUsers = [...users, newUser]
    passwords[userData.username] = password
    
    localStorage.setItem('users', JSON.stringify(updatedUsers))
    localStorage.setItem('passwords', JSON.stringify(passwords))
    
    return true
  }

  const updatePassword = (userId: number, newPassword: string): boolean => {
    if (authState.user?.type !== 'admin') return false

    const users: User[] = JSON.parse(localStorage.getItem('users') || '[]')
    const passwords: Record<string, string> = JSON.parse(localStorage.getItem('passwords') || '{}')
    
    const user = users.find(u => u.id === userId)
    if (!user) return false

    passwords[user.username] = newPassword
    localStorage.setItem('passwords', JSON.stringify(passwords))
    
    return true
  }

  const updateUser = (userId: number, updates: Partial<User>): boolean => {
    if (authState.user?.type !== 'admin') return false

    const users: User[] = JSON.parse(localStorage.getItem('users') || '[]')
    const userIndex = users.findIndex(u => u.id === userId)
    
    if (userIndex === -1) return false

    users[userIndex] = { ...users[userIndex], ...updates }
    localStorage.setItem('users', JSON.stringify(users))
    return true
  }

  const deleteUser = (userId: number): boolean => {
    if (authState.user?.type !== 'admin') return false

    const users: User[] = JSON.parse(localStorage.getItem('users') || '[]')
    const updatedUsers = users.filter(u => u.id !== userId)
    localStorage.setItem('users', JSON.stringify(updatedUsers))
    return true
  }

  const getAllUsers = (): User[] => {
    if (authState.user?.type !== 'admin') return []
    return JSON.parse(localStorage.getItem('users') || '[]')
  }

  const getUserPassword = (username: string): string | null => {
    if (authState.user?.type !== 'admin') return null
    const passwords: Record<string, string> = JSON.parse(localStorage.getItem('passwords') || '{}')
    return passwords[username] || null
  }

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    createUser,
    updateUser,
    updatePassword,
    deleteUser,
    getAllUsers,
    getUserPassword
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}