import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface CheckboxOption {
  value: string
  label: string
}

interface CheckboxGroupProps {
  label?: string
  options: CheckboxOption[] | string[]
  selectedValues: string[]
  onChange: (selectedValues: string[]) => void
  className?: string
  maxHeight?: string
  disabled?: boolean
}

export function CheckboxGroup({ 
  label, 
  options, 
  selectedValues, 
  onChange,
  className,
  maxHeight = '200px',
  disabled = false
}: CheckboxGroupProps) {
  // string配列をCheckboxOption配列に変換
  const normalizedOptions: CheckboxOption[] = options.map(option => 
    typeof option === 'string' 
      ? { value: option, label: option }
      : option
  )
  const handleCheckboxChange = (value: string) => {
    const newSelectedValues = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value]
    
    onChange(newSelectedValues)
  }

  const handleSelectAll = () => {
    if (selectedValues.length === normalizedOptions.length) {
      onChange([])
    } else {
      onChange(normalizedOptions.map(option => option.value))
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <label className="text-sm font-medium text-[var(--text-primary)]">
          {label}
        </label>
      )}
      
      <div 
        className="bg-white border border-[var(--border-color)] rounded-lg overflow-y-auto"
        style={{ maxHeight, padding: '10px' }}
      >
        {/* 全選択/全解除ボタン */}
        <div className="flex items-center gap-2 pb-2 mb-2 border-b border-[var(--border-color)]">
          <input
            type="checkbox"
            id="select-all"
            checked={selectedValues.length === normalizedOptions.length && normalizedOptions.length > 0}
            onChange={handleSelectAll}
            disabled={disabled}
            className="w-4 h-4 text-[var(--primary)] border-gray-300 rounded focus:ring-[var(--primary)] disabled:opacity-50"
          />
          <label htmlFor="select-all" className="text-sm font-medium text-[var(--text-primary)]">
            {selectedValues.length === normalizedOptions.length ? '全解除' : '全選択'}
          </label>
          {selectedValues.length > 0 && (
            <span className="text-xs text-[var(--text-secondary)] ml-2">
              ({selectedValues.length}件選択中)
            </span>
          )}
        </div>

        {/* 各チェックボックス */}
        <div className="space-y-2">
          {normalizedOptions.map((option) => (
            <div key={option.value} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`checkbox-${option.value}`}
                checked={selectedValues.includes(option.value)}
                onChange={() => handleCheckboxChange(option.value)}
                disabled={disabled}
                className="w-4 h-4 text-[var(--primary)] border-gray-300 rounded focus:ring-[var(--primary)] disabled:opacity-50"
              />
              <label 
                htmlFor={`checkbox-${option.value}`} 
                className="text-sm text-[var(--text-primary)] cursor-pointer"
              >
                {option.label}
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}