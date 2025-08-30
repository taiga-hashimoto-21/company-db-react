'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/Button'

interface AdvancedSearchProps {
  onSearch: (filters: SearchFilters) => void
  loading?: boolean
}

export interface SearchFilters {
  industries?: string[]
  prefecture?: string
  capitalMin?: number
  capitalMax?: number
  capitalEnabled: boolean
  employeesMin?: number
  employeesMax?: number
  employeesEnabled: boolean
  establishedYearMin?: number
  establishedYearMax?: number
  establishedYearEnabled: boolean
}

const INDUSTRIES = [
  // 製造業（8分類）
  '食品・飲料・たばこ製造業',
  '繊維・アパレル製造業',
  '化学・石油・ゴム製造業',
  '医薬品・化粧品製造業',
  '鉄鋼・非鉄金属製造業',
  '機械・設備製造業',
  '電子・電気機器製造業',
  '輸送用機器製造業',
  
  // 情報通信業（4分類）
  'ソフトウェア・IT開発業',
  '情報処理・データセンター業',
  'インターネット・Web関連業',
  '通信・放送業',
  
  // 商業（4分類）
  '総合商社',
  '専門商社',
  '小売業',
  '電子商取引業',
  
  // 金融・不動産（3分類）
  '銀行・証券・保険業',
  '不動産業',
  '建設・土木業',
  
  // サービス業（8分類）
  '運輸・物流業',
  '旅行・宿泊・娯楽業',
  '飲食・フードサービス業',
  '教育・研修業',
  '医療・介護・福祉業',
  '法律・会計・コンサルティング業',
  '人材・派遣業',
  '広告・マーケティング業',
  
  // インフラ・その他（3分類）
  '電力・ガス・水道業',
  '官公庁・団体',
  'その他・複合業種'
]

const PREFECTURES = [
  '東京都', '大阪府', '神奈川県', '愛知県', '埼玉県', '千葉県', '兵庫県',
  '北海道', '福岡県', '静岡県', '茨城県', '広島県', '京都府', '新潟県',
  '宮城県', '長野県', '岐阜県', '栃木県', '群馬県', '岡山県', '熊本県',
  '鹿児島県', '沖縄県', '青森県', '岩手県', '山形県', '福島県'
]

export function AdvancedSearch({ onSearch, loading = false }: AdvancedSearchProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    industries: [],
    prefecture: '指定なし',
    capitalMin: 0,
    capitalMax: 0,
    capitalEnabled: true,
    employeesMin: 0,
    employeesMax: 0,
    employeesEnabled: true,
    establishedYearMin: 0,
    establishedYearMax: 0,
    establishedYearEnabled: true,
  })

  const handleFilterChange = useCallback((key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleIndustryChange = useCallback((industry: string, checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      industries: checked 
        ? [...(prev.industries || []), industry]
        : (prev.industries || []).filter(i => i !== industry)
    }))
  }, [])

  const handleSearch = useCallback(() => {
    onSearch(filters)
  }, [filters, onSearch])

  return (
    <div className="bg-white rounded-lg border border-[var(--border-color)] p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 業界 */}
        <div className="space-y-3 md:col-span-2">
          <label className="block text-sm font-medium text-[var(--text-primary)]">
            業界（複数選択可）
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {INDUSTRIES.map(industry => (
              <label key={industry} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.industries?.includes(industry) || false}
                  onChange={(e) => handleIndustryChange(industry, e.target.checked)}
                  className="rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <span className="text-sm text-[var(--text-primary)]">{industry}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 所在地 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[var(--text-primary)]">
            所在地
          </label>
          <div className="relative">
            <select
              value={filters.prefecture || '指定なし'}
              onChange={(e) => handleFilterChange('prefecture', e.target.value === '指定なし' ? undefined : e.target.value)}
              className="w-full px-4 py-3 border border-[var(--border-color)] rounded-md 
                         bg-white text-[var(--text-primary)] appearance-none
                         focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            >
              <option value="指定なし">指定なし</option>
              {PREFECTURES.map(prefecture => (
                <option key={prefecture} value={prefecture}>{prefecture}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* 資本金 */}
        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              資本金
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={filters.capitalEnabled}
                onChange={(e) => handleFilterChange('capitalEnabled', e.target.checked)}
                className="rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">指定なし</span>
            </label>
          </div>
          <div className="flex items-center space-x-4">
            <input
              type="number"
              value={filters.capitalMin || 0}
              onChange={(e) => handleFilterChange('capitalMin', parseInt(e.target.value) || 0)}
              disabled={filters.capitalEnabled}
              className="flex-1 px-4 py-3 border border-[var(--border-color)] rounded-md
                         text-[var(--text-primary)] disabled:bg-gray-100 disabled:text-gray-400
                         focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              placeholder="0"
            />
            <span className="text-[var(--text-secondary)] font-medium">〜</span>
            <input
              type="number"
              value={filters.capitalMax || 0}
              onChange={(e) => handleFilterChange('capitalMax', parseInt(e.target.value) || 0)}
              disabled={filters.capitalEnabled}
              className="flex-1 px-4 py-3 border border-[var(--border-color)] rounded-md
                         text-[var(--text-primary)] disabled:bg-gray-100 disabled:text-gray-400
                         focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              placeholder="0"
            />
            <span className="text-[var(--text-secondary)]">万円</span>
          </div>
        </div>

        {/* 従業員数 */}
        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              従業員数
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={filters.employeesEnabled}
                onChange={(e) => handleFilterChange('employeesEnabled', e.target.checked)}
                className="rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">指定なし</span>
            </label>
          </div>
          <div className="flex items-center space-x-4">
            <input
              type="number"
              value={filters.employeesMin || 0}
              onChange={(e) => handleFilterChange('employeesMin', parseInt(e.target.value) || 0)}
              disabled={filters.employeesEnabled}
              className="flex-1 px-4 py-3 border border-[var(--border-color)] rounded-md
                         text-[var(--text-primary)] disabled:bg-gray-100 disabled:text-gray-400
                         focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              placeholder="0"
            />
            <span className="text-[var(--text-secondary)] font-medium">〜</span>
            <input
              type="number"
              value={filters.employeesMax || 0}
              onChange={(e) => handleFilterChange('employeesMax', parseInt(e.target.value) || 0)}
              disabled={filters.employeesEnabled}
              className="flex-1 px-4 py-3 border border-[var(--border-color)] rounded-md
                         text-[var(--text-primary)] disabled:bg-gray-100 disabled:text-gray-400
                         focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              placeholder="0"
            />
            <span className="text-[var(--text-secondary)]">名</span>
          </div>
        </div>

        {/* 設立年 */}
        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              設立年
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={filters.establishedYearEnabled}
                onChange={(e) => handleFilterChange('establishedYearEnabled', e.target.checked)}
                className="rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">指定なし</span>
            </label>
          </div>
          <div className="flex items-center space-x-4">
            <input
              type="number"
              value={filters.establishedYearMin || 0}
              onChange={(e) => handleFilterChange('establishedYearMin', parseInt(e.target.value) || 0)}
              disabled={filters.establishedYearEnabled}
              className="flex-1 px-4 py-3 border border-[var(--border-color)] rounded-md
                         text-[var(--text-primary)] disabled:bg-gray-100 disabled:text-gray-400
                         focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              placeholder="0"
            />
            <span className="text-[var(--text-secondary)] font-medium">〜</span>
            <input
              type="number"
              value={filters.establishedYearMax || 0}
              onChange={(e) => handleFilterChange('establishedYearMax', parseInt(e.target.value) || 0)}
              disabled={filters.establishedYearEnabled}
              className="flex-1 px-4 py-3 border border-[var(--border-color)] rounded-md
                         text-[var(--text-primary)] disabled:bg-gray-100 disabled:text-gray-400
                         focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              placeholder="0"
            />
            <span className="text-[var(--text-secondary)]">年</span>
          </div>
        </div>
      </div>

      {/* 検索ボタン */}
      <div className="mt-8 flex justify-center">
        <Button
          onClick={handleSearch}
          loading={loading}
          className="px-8 py-3 text-lg font-medium bg-[var(--primary)] hover:bg-blue-700 
                     text-white rounded-lg shadow-sm transition-colors duration-200"
        >
          検索
        </Button>
      </div>
    </div>
  )
}