import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// デバウンス関数（1200万社対応の高パフォーマンス検索用）
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    
    timeout = setTimeout(() => {
      func(...args)
      timeout = null
    }, wait)
  }
}

// スロットリング関数（連続クリック防止）
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, wait)
    }
  }
}

// キャッシュ用のハッシュ関数
export function hashObject(obj: any): string {
  return btoa(JSON.stringify(obj)).replace(/[+/=]/g, '')
}

// レスポンス時間の表示フォーマット
export function formatResponseTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  } else {
    return `${(ms / 1000).toFixed(2)}s`
  }
}

// 数値のフォーマット（1,234,567 形式）
export function formatNumber(num: number): string {
  return num.toLocaleString('ja-JP')
}

// パフォーマンス監視用のログ
export function logPerformance(operation: string, startTime: number, additionalData?: any) {
  const duration = Date.now() - startTime
  console.log(`[Performance] ${operation}: ${formatResponseTime(duration)}`, additionalData)
  
  // 本格運用時はここで監視システム（DataDog、New Relic等）に送信
  if (duration > 3000) {
    console.warn(`[Performance Warning] ${operation} took ${formatResponseTime(duration)}`)
  }
}

// CSVダウンロード関数
export function downloadCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    console.warn('No data to export')
    return
  }

  // CSVヘッダーを取得
  const headers = Object.keys(data[0])
  
  // CSVコンテンツを生成
  const csvContent = [
    headers.join(','), // ヘッダー行
    ...data.map(row => 
      headers.map(header => {
        const value = row[header] || ''
        // 値に改行やカンマが含まれている場合はダブルクォートで囲む
        if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      }).join(',')
    )
  ].join('\n')

  // BOMを追加してExcelで文字化けを防ぐ
  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  
  // ダウンロードリンクを作成
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}