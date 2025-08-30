import { createClient } from '@supabase/supabase-js'

// 本格運用時は環境変数で管理
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseKey)

// 企業データベーステーブル名
export const COMPANIES_TABLE = 'companies'
export const USERS_TABLE = 'users'

// データベース型定義
export interface DatabaseCompany {
  id: number
  company_name: string
  established_date: string
  postal_code?: string
  address: string
  industry: string
  website?: string
  created_at?: string
  updated_at?: string
}

export interface DatabaseUser {
  id: string
  username: string
  name: string
  company_name: string
  email: string
  phone_number?: string
  type: 'admin' | 'user'
  is_active: boolean
  created_at?: string
  created_by?: string
}