import { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Button } from './Button'

interface HeaderProps {
  title: string
  user?: {
    name: string
    type: 'admin' | 'user'
  }
  onLogout?: () => void
  children?: ReactNode
}

export function Header({ title, user, onLogout, children }: HeaderProps) {
  const pathname = usePathname()

  // 管理者用の新しいヘッダーレイアウト
  if (user?.type === 'admin') {
    return (
      <header className="bg-white shadow-sm border-b border-[var(--border-color)] sticky top-0 z-50">
        <div className="w-full" style={{ padding: '0 30px' }}>
          <div className="flex justify-between items-center h-16">
            {/* 左側: ロゴ */}
            <div className="flex items-center">
              <Link href="/admin/prtimes">
                <Image
                  src="/logo.png"
                  alt="アプローチロボ"
                  width={200}
                  height={40}
                  className="h-10 w-auto cursor-pointer"
                />
              </Link>
            </div>
            
            {/* 右側: ナビゲーション */}
            <div className="flex items-center gap-6">
              <nav className="flex items-center gap-6" style={{ padding: '8px' }}>
                <Link 
                  href="/admin/users"
                  className={`text-sm font-medium text-black transition-colors relative ${
                    pathname === '/admin/users' 
                      ? 'after:content-[""] after:absolute after:bottom-[-8px] after:left-0 after:right-0 after:h-0.5 after:bg-[var(--primary)]' 
                      : 'hover:text-[var(--primary)]'
                  }`}
                >
                  ユーザー管理
                </Link>
                <Link 
                  href="/admin"
                  className={`text-sm font-medium text-black transition-colors relative ${
                    pathname === '/admin' 
                      ? 'after:content-[""] after:absolute after:bottom-[-8px] after:left-0 after:right-0 after:h-0.5 after:bg-[var(--primary)]' 
                      : 'hover:text-[var(--primary)]'
                  }`}
                >
                  DB管理
                </Link>
              </nav>
              
              {/* ログアウトボタン */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                >
                  管理者をログアウト
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
    )
  }

  // 一般ユーザー用のヘッダー（管理者と同じデザイン）
  return (
    <header className="bg-white shadow-sm border-b border-[var(--border-color)] sticky top-0 z-50">
      <div className="w-full" style={{ padding: '0 30px' }}>
        <div className="flex justify-between items-center h-16">
          {/* 左側: ロゴ */}
          <div className="flex items-center">
            <Link href="/">
              <Image
                src="/logo.png"
                alt="アプローチロボ"
                width={200}
                height={40}
                className="h-10 w-auto cursor-pointer"
              />
            </Link>
          </div>
          
          {/* 右側: ナビゲーション */}
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-6" style={{ padding: '8px' }}>
              <Link
                href="/"
                className={`text-sm font-medium text-black transition-colors relative ${
                  pathname === '/'
                    ? 'after:content-[""] after:absolute after:bottom-[-8px] after:left-0 after:right-0 after:h-0.5 after:bg-[var(--primary)]'
                    : 'hover:text-[var(--primary)]'
                }`}
              >
                全体DB
              </Link>
              <Link
                href="/prtimes"
                className={`text-sm font-medium text-black transition-colors relative ${
                  pathname === '/prtimes'
                    ? 'after:content-[""] after:absolute after:bottom-[-8px] after:left-0 after:right-0 after:h-0.5 after:bg-[var(--primary)]'
                    : 'hover:text-[var(--primary)]'
                }`}
              >
                プレスリリース
              </Link>
            </nav>

            {/* ログアウトボタン */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
              >
                ログアウト
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}