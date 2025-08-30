export interface User {
  id: string
  username: string      // ユーザーID
  name: string         // 氏名
  companyName: string  // 会社名
  email: string        // メールアドレス
  phoneNumber: string  // 電話番号
  type: 'admin' | 'user'
  isActive: boolean
  createdAt: string
  createdBy?: string   // 管理者IDが入る
}

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
}

export interface LoginRequest {
  username: string
  password: string
}