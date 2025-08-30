import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: boolean
  style?: React.CSSProperties
}

export function Card({ children, className, padding = true, style }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-sm border border-[var(--border-color)]',
        padding && 'p-6',
        className
      )}
      style={style}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

export function CardHeader({ children, className, style }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'border-b border-[var(--border-color)] pb-4 mb-4',
        className
      )}
      style={style}
    >
      {children}
    </div>
  )
}

interface CardTitleProps {
  children: ReactNode
  className?: string
}

export function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h2
      className={cn(
        'text-xl font-semibold text-[var(--text-primary)]',
        className
      )}
    >
      {children}
    </h2>
  )
}

interface CardBodyProps {
  children: ReactNode
  className?: string
}

export function CardBody({ children, className }: CardBodyProps) {
  return (
    <div className={cn('', className)}>
      {children}
    </div>
  )
}