'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { Select } from './Select'
import { CheckboxGroup } from './CheckboxGroup'
import { PRTimesSearchFilters } from '@/types/prtimes'
import { debounce } from '@/lib/utils'

interface PRTimesSearchProps {
  onSearch: (filters: PRTimesSearchFilters) => void
  onReset?: () => void
  loading?: boolean
  realtime?: boolean
}

export function PRTimesSearch({ onSearch, onReset, loading, realtime = true }: PRTimesSearchProps) {
  const [filters, setFilters] = useState<PRTimesSearchFilters>({
    companyName: '',
    industry: [],
    pressReleaseType: [],
    listingStatus: [],
    capitalMin: undefined,
    capitalMax: undefined,
    establishedYearMin: undefined,
    establishedYearMax: undefined,
    deliveryDateFrom: '',
    deliveryDateTo: ''
  })

  // 固定のカテゴリリスト
  const categories = {
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
    ],
    pressReleaseTypes: [
      'その他',
      'イベント',
      'キャンペーン',
      '上場企業決算発表',
      '人物',
      '商品サービス',
      '経営情報',
      '調査レポート'
    ],
    listing_status: [
      'JASDAQ',
      'JASDAQグロース',
      'JASDAQスタンダード',
      'その他国内市場',
      'セントレックス',
      'マザーズ',
      '名証2部',
      '名証ネクスト',
      '名証メイン',
      '大証2部',
      '未上場',
      '札証',
      '東証1部',
      '東証2部',
      '東証グロース',
      '東証スタンダード',
      '東証プライム',
      '海外市場',
      '福証'
    ]
  }

  // デバウンスされたリアルタイム検索関数
  const debouncedSearch = useCallback(
    debounce((searchFilters: PRTimesSearchFilters) => {
      if (realtime) {
        onSearch(searchFilters)
      }
    }, 500),
    [onSearch, realtime]
  )

  // フィルタ変更時にリアルタイム検索を実行
  useEffect(() => {
    if (realtime) {
      debouncedSearch(filters)
    }
  }, [filters, debouncedSearch, realtime])

  const handleInputChange = (field: keyof PRTimesSearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const handleArrayChange = (field: keyof PRTimesSearchFilters, values: string[]) => {
    setFilters(prev => ({ ...prev, [field]: values }))
  }

  const handleSearch = () => {
    onSearch(filters)
  }

  const handleReset = () => {
    const resetFilters: PRTimesSearchFilters = {
      companyName: '',
      industry: [],
      pressReleaseType: [],
      listingStatus: [],
      capitalMin: undefined,
      capitalMax: undefined,
      establishedYearMin: undefined,
      establishedYearMax: undefined,
      deliveryDateFrom: '',
      deliveryDateTo: ''
    }
    setFilters(resetFilters)
    onSearch(resetFilters)
    if (onReset) {
      onReset()
    }
  }

  return (
    <div style={{ padding: '15px', marginBottom: '30px' }} className="bg-[#139ea8]/5 border border-[#139ea8]/20 rounded-lg">
    <div className="space-y-6">
      <div style={{ width: '50%', padding: '10px' }}>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">PR TIMES 配信日</label>
        <div className="flex gap-3 items-center">
          <input
            type="date"
            value={filters.deliveryDateFrom || ''}
            onChange={(e) => handleInputChange('deliveryDateFrom', e.target.value)}
            disabled={loading}
            className="smarthr-input flex-1"
            style={{ width: '120px', height: '32px', fontSize: '13px' }}
          />
          <span className="text-sm text-[var(--text-secondary)] font-medium">〜</span>
          <input
            type="date"
            value={filters.deliveryDateTo || ''}
            onChange={(e) => handleInputChange('deliveryDateTo', e.target.value)}
            disabled={loading}
            className="smarthr-input flex-1"
            style={{ width: '120px', height: '32px', fontSize: '13px' }}
          />
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
          <span className="text-sm text-[var(--text-secondary)] font-medium">〜</span>
          <input
            type="number"
            placeholder="最大"
            value={filters.capitalMax || ''}
            onChange={(e) => handleInputChange('capitalMax', e.target.value ? parseInt(e.target.value) : undefined)}
            disabled={loading}
            className="smarthr-input flex-1"
            style={{ width: '120px', height: '32px', fontSize: '13px' }}
          />
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
          <span className="text-sm text-[var(--text-secondary)] font-medium">〜</span>
          <input
            type="number"
            placeholder="終了年"
            value={filters.establishedYearMax || ''}
            onChange={(e) => handleInputChange('establishedYearMax', e.target.value ? parseInt(e.target.value) : undefined)}
            disabled={loading}
            className="smarthr-input flex-1"
            style={{ width: '120px', height: '32px', fontSize: '13px' }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" style={{ padding: '10px' }}>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">業種</label>
          <CheckboxGroup
            options={categories.industry}
            selectedValues={filters.industry || []}
            onChange={(values) => handleArrayChange('industry', values)}
            disabled={loading}
            maxHeight="200px"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">上場区分</label>
          <CheckboxGroup
            options={categories.listing_status}
            selectedValues={filters.listingStatus || []}
            onChange={(values) => handleArrayChange('listingStatus', values)}
            disabled={loading}
            maxHeight="200px"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">プレスリリース種類</label>
          <CheckboxGroup
            options={categories.pressReleaseTypes}
            selectedValues={filters.pressReleaseType || []}
            onChange={(values) => handleArrayChange('pressReleaseType', values)}
            disabled={loading}
            maxHeight="200px"
          />
        </div>

      </div>

      <div style={{ padding: '10px', fontSize: '12px', color: '#666666' }}>
        ※ PR TIMESでは「資本金」および「上場区分」は必須入力項目ではないため、これらの条件で絞り込みを行うと、表示件数が少なくなる場合があります。<br />
        ※ 重複する企業については、1社のみを表示しております。
      </div>

      <div className="flex gap-3 pt-12 mt-8 border-t border-[var(--border-light)]" style={{ padding: '10px' }}>
        <button
          onClick={handleReset}
          disabled={loading}
          style={{ marginTop: '10px', padding: '7px 15px', height: '35px' }}
          className="smarthr-button bg-[var(--primary)] text-white border-transparent hover:bg-[var(--primary-hover)] text-sm"
        >
          {loading ? 'リセット中...' : 'リセット'}
        </button>
      </div>
    </div>
    </div>
  )
}