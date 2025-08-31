'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface User {
  id: string
  username: string
  name: string
  companyName?: string
  phoneNumber?: string
  email?: string
  type: 'admin' | 'user' | 'disabled'
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

interface CreateUserRequest {
  username: string
  name: string
  companyName?: string
  phoneNumber?: string
  email?: string
  type: 'admin' | 'user' | 'disabled'
  password: string
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginRequest) => Promise<boolean>
  logout: () => void
  createUser: (userData: CreateUserRequest) => Promise<boolean>
  updateUser: (userId: string, updates: Partial<User>) => Promise<boolean>
  updatePassword: (userId: string, newPassword: string) => Promise<boolean>
  deleteUser: (userId: string) => Promise<boolean>
  getAllUsers: () => Promise<User[]>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null
  })

  // 初期化時にlocalStorageから認証状態を復元
  useEffect(() => {
    const storedAuth = localStorage.getItem('authState')
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth)
        setAuthState(parsed)
      } catch (error) {
        console.error('Error parsing stored auth state:', error)
        localStorage.removeItem('authState')
      }
    }
  }, [])

  const login = async (credentials: LoginRequest): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Login failed:', errorData.error)
        return false
      }

      const data = await response.json()
      
      if (data.success && data.user) {
        const newAuthState = {
          isAuthenticated: true,
          user: {
            ...data.user,
            lastLogin: new Date().toISOString()
          }
        }
        
        setAuthState(newAuthState)
        localStorage.setItem('authState', JSON.stringify(newAuthState))
        return true
      }

      return false
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  const logout = () => {
    setAuthState({
      isAuthenticated: false,
      user: null
    })
    localStorage.removeItem('authState')
  }

  const createUser = async (userData: CreateUserRequest): Promise<boolean> => {
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Create user failed:', errorData.error)
        return false
      }

      const data = await response.json()
      return data.success === true
    } catch (error) {
      console.error('Create user error:', error)
      return false
    }
  }

  const updateUser = async (userId: string, updates: Partial<User>): Promise<boolean> => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Update user failed:', errorData.error)
        return false
      }

      const data = await response.json()
      
      // 現在ログイン中のユーザーが無効化された場合はログアウト
      if (authState.user?.id === userId && updates.type === 'disabled') {
        logout()
      }
      
      return data.success === true
    } catch (error) {
      console.error('Update user error:', error)
      return false
    }
  }

  const updatePassword = async (userId: string, newPassword: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Update password failed:', errorData.error)
        return false
      }

      const data = await response.json()
      return data.success === true
    } catch (error) {
      console.error('Update password error:', error)
      return false
    }
  }

  const deleteUser = async (userId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Delete user failed:', errorData.error)
        return false
      }

      const data = await response.json()
      
      // 削除されたユーザーがログイン中の場合はログアウト
      if (authState.user?.id === userId) {
        logout()
      }
      
      return data.success === true
    } catch (error) {
      console.error('Delete user error:', error)
      return false
    }
  }

  const getAllUsers = async (): Promise<User[]> => {
    try {
      const response = await fetch('/api/users')

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Get users failed:', errorData.error)
        return []
      }

      const data = await response.json()
      return data.users || []
    } catch (error) {
      console.error('Get users error:', error)
      return []
    }
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