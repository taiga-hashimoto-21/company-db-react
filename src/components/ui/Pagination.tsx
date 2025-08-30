import { Button } from './Button'
import { PaginationInfo } from '@/types/corporate'

interface PaginationProps {
  pagination: PaginationInfo
  onPageChange: (page: number) => void
  loading?: boolean
}

export function Pagination({ pagination, onPageChange, loading = false }: PaginationProps) {
  const { currentPage, totalPages, totalCount, hasNextPage, hasPrevPage } = pagination

  // ページ番号のリストを生成（現在のページを中心に最大7ページ表示）
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 7
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      pages.push(1)
      
      if (currentPage > 4) {
        pages.push('...')
      }
      
      const start = Math.max(2, currentPage - 2)
      const end = Math.min(totalPages - 1, currentPage + 2)
      
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
      
      if (currentPage < totalPages - 3) {
        pages.push('...')
      }
      
      pages.push(totalPages)
    }
    
    return pages
  }

  if (totalPages <= 1) return null

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
      {/* 件数表示 */}
      <div className="text-sm text-[var(--text-secondary)]">
        全{totalCount.toLocaleString()}件中 {((currentPage - 1) * 100 + 1).toLocaleString()}～{Math.min(currentPage * 100, totalCount).toLocaleString()}件を表示
      </div>
      
      {/* ページネーション */}
      <div className="flex items-center gap-2">
        {/* 前のページ */}
        <Button
          variant="secondary"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrevPage || loading}
          className="px-3 py-2"
        >
          ‹ 前
        </Button>
        
        {/* ページ番号 */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => (
            <div key={index}>
              {page === '...' ? (
                <span className="px-3 py-2 text-[var(--text-secondary)]">…</span>
              ) : (
                <Button
                  variant={page === currentPage ? 'primary' : 'secondary'}
                  onClick={() => onPageChange(page as number)}
                  disabled={loading}
                  className="px-3 py-2 min-w-[40px]"
                >
                  {page}
                </Button>
              )}
            </div>
          ))}
        </div>
        
        {/* 次のページ */}
        <Button
          variant="secondary"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNextPage || loading}
          className="px-3 py-2"
        >
          次 ›
        </Button>
      </div>
    </div>
  )
}