export interface User {
  id: string
  username: string      // ユーザーID
  name: string         // 氏名
  companyName: string  // 会社名
  email: string        // メールアドレス
  phoneNumber: string  // 電話番号
  type: 'admin' | 'user'
  role?: 'admin' | 'user' | 'data-creator' | 'data-admin'  // 役割（後方互換性のためoptional）
  isActive: boolean
  createdAt: string
  createdBy?: string   // 管理者IDが入る
  lastLogin?: string   // 最終ログイン日時
}

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
}

export interface LoginRequest {
  username: string
  password: string
}