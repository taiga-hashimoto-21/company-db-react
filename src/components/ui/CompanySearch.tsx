'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from './Input'
import { CheckboxGroup } from './CheckboxGroup'
import { CompanySearchFilters } from '@/types/company'
import { debounce } from '@/lib/utils'

interface CompanySearchProps {
  onSearch: (filters: CompanySearchFilters) => void
  onReset?: () => void
  loading?: boolean
  realtime?: boolean
  totalCount?: number
  countLoading?: boolean
}

export function CompanySearch({ onSearch, onReset, loading, realtime = true, totalCount, countLoading }: CompanySearchProps) {
  const [filters, setFilters] = useState<CompanySearchFilters>({
    companyName: '',
    prefecture: [],
    industry: [],
    employeesMin: undefined,
    employeesMax: undefined,
    capitalMin: undefined,
    capitalMax: undefined,
    establishedYearMin: undefined,
    establishedYearMax: undefined
  })

  // 固定のカテゴリリスト
  const categories = {
    prefecture: [
      '北海道',
      '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
      '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
      '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県',
      '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
      '鳥取県', '島根県', '岡山県', '広島県', '山口県',
      '徳島県', '香川県', '愛媛県', '高知県',
      '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
    ],
    industry: [
      'サービス業',
      '不動産業',
      '倉庫・運輸関連業',
      '医療・福祉',
      '商業（卸売業、小売業）',
      '官公庁・地方自治体',
      '建設業',
      '情報通信',
      '教育・学習支援業',
      '水産・農林業',
      '製造業',
      '財団法人・社団法人・宗教法人',
      '金融・保険業',
      '鉱業',
      '電気・ガス業',
      '飲食店・宿泊業'
    ]
  }

  // デバウンスされた件数取得関数（リアルタイム用）
  const debouncedCountSearch = useCallback(
    debounce((searchFilters: CompanySearchFilters) => {
      if (realtime) {
        onSearch(searchFilters, true) // countOnlyフラグを追加
      }
    }, 500),
    [onSearch, realtime]
  )

  // フィルタ変更時にリアルタイム件数検索を実行
  useEffect(() => {
    if (realtime) {
      debouncedCountSearch(filters)
    }
  }, [filters, debouncedCountSearch, realtime])

  const handleInputChange = (field: keyof CompanySearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const handleArrayChange = (field: keyof CompanySearchFilters, values: string[]) => {
    setFilters(prev => ({ ...prev, [field]: values }))
  }

  const handleSearch = () => {
    onSearch(filters, false) // 完全な検索を実行
  }

  const handleReset = () => {
    const resetFilters: CompanySearchFilters = {
      companyName: '',
      prefecture: [],
      industry: [],
      employeesMin: undefined,
      employeesMax: undefined,
      capitalMin: undefined,
      capitalMax: undefined,
      establishedYearMin: undefined,
      establishedYearMax: undefined
    }
    setFilters(resetFilters)
    onSearch(resetFilters, false)
    if (onReset) {
      onReset()
    }
  }

  return (
    <div style={{ padding: '15px', marginBottom: '30px' }} className="bg-[#139ea8]/5 border border-[#139ea8]/20 rounded-lg">
      <div className="space-y-6">

        <div style={{ width: '50%', padding: '10px' }}>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">従業員数</label>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              placeholder="最小"
              value={filters.employeesMin || ''}
              onChange={(e) => handleInputChange('employeesMin', e.target.value ? parseInt(e.target.value) : undefined)}
              disabled={loading}
              className="smarthr-input flex-1"
              style={{ width: '120px', height: '32px', fontSize: '13px' }}
            />
            <span className="text-sm text-[var(--text-secondary)] font-medium">人〜</span>
            <input
              type="number"
              placeholder="最大"
              value={filters.employeesMax || ''}
              onChange={(e) => handleInputChange('employeesMax', e.target.value ? parseInt(e.target.value) : undefined)}
              disabled={loading}
              className="smarthr-input flex-1"
              style={{ width: '120px', height: '32px', fontSize: '13px' }}
            />
            <span className="text-sm text-[var(--text-secondary)] font-medium">人まで</span>
          </div>
        </div>

        <div style={{ width: '50%', padding: '10px' }}>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">資本金 (万円)</label>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              placeholder="最小"
              value={filters.capitalMin || ''}
              onChange={(e) => handleInputChange('capitalMin', e.target.value ? parseInt(e.target.value) : undefined)}
              disabled={loading}
              className="smarthr-input flex-1"
              style={{ width: '120px', height: '32px', fontSize: '13px' }}
            />
            <span className="text-sm text-[var(--text-secondary)] font-medium">万円〜</span>
            <input
              type="number"
              placeholder="最大"
              value={filters.capitalMax || ''}
              onChange={(e) => handleInputChange('capitalMax', e.target.value ? parseInt(e.target.value) : undefined)}
              disabled={loading}
              className="smarthr-input flex-1"
              style={{ width: '120px', height: '32px', fontSize: '13px' }}
            />
            <span className="text-sm text-[var(--text-secondary)] font-medium">万円まで</span>
          </div>
        </div>

        <div style={{ width: '50%', padding: '10px' }}>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">設立年</label>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              placeholder="開始年"
              value={filters.establishedYearMin || ''}
              onChange={(e) => handleInputChange('establishedYearMin', e.target.value ? parseInt(e.target.value) : undefined)}
              disabled={loading}
              className="smarthr-input flex-1"
              style={{ width: '120px', height: '32px', fontSize: '13px' }}
            />
            <span className="text-sm text-[var(--text-secondary)] font-medium">年〜</span>
            <input
              type="number"
              placeholder="終了年"
              value={filters.establishedYearMax || ''}
              onChange={(e) => handleInputChange('establishedYearMax', e.target.value ? parseInt(e.target.value) : undefined)}
              disabled={loading}
              className="smarthr-input flex-1"
              style={{ width: '120px', height: '32px', fontSize: '13px' }}
            />
            <span className="text-sm text-[var(--text-secondary)] font-medium">年まで</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ padding: '10px' }}>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">都道府県</label>
            <CheckboxGroup
              options={categories.prefecture}
              selectedValues={filters.prefecture || []}
              onChange={(values) => handleArrayChange('prefecture', values)}
              disabled={loading}
              maxHeight="200px"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">業界</label>
            <CheckboxGroup
              options={categories.industry}
              selectedValues={filters.industry || []}
              onChange={(values) => handleArrayChange('industry', values)}
              disabled={loading}
              maxHeight="200px"
            />
          </div>
        </div>

        {/* 該当件数表示 */}
        <div style={{ padding: '10px' }}>
          <div className="text-sm text-[var(--text-secondary)]">
            該当件数：{countLoading ? (
              <span className="text-[var(--primary)]">検索中...</span>
            ) : (
              <>
                <span className="text-lg font-bold text-[var(--primary)]">{totalCount?.toLocaleString() || 0}</span>
                <span>件</span>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-12 mt-8 border-t border-[var(--border-light)]" style={{ padding: '10px' }}>
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{ marginTop: '10px', padding: '7px 15px', height: '35px' }}
            className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)] text-sm"
          >
            {loading ? '検索中...' : '検索'}
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            style={{ marginTop: '10px', padding: '7px 15px', height: '35px' }}
            className="smarthr-button bg-gray-500 text-white border-transparent hover:bg-gray-600 text-sm"
          >
            {loading ? 'リセット中...' : 'リセット'}
          </button>
        </div>
      </div>
    </div>
  )
}