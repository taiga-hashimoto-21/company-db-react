import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  fullWidth?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, fullWidth = true, className, ...props }, ref) => {
    return (
      <div className={cn('flex flex-col gap-1', fullWidth && 'w-full')} style={{ padding: '7px' }}>
        {label && (
          <label className="text-sm font-medium text-[var(--text-primary)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full border border-[var(--border-color)] rounded-lg',
            'focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent',
            'placeholder:text-[var(--text-light)]',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50',
            error && 'border-[var(--error)] focus:ring-[var(--error)]',
            className
          )}
          style={{ padding: '8px 12px', ...props.style }}
          {...props}
        />
        {error && (
          <span className="text-sm text-[var(--error)]">{error}</span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'