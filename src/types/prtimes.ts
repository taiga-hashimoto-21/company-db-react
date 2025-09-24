export interface PRTimesCompany {
  id: number
  deliveryDate: string
  pressReleaseUrl: string
  pressReleaseTitle: string
  pressReleaseType?: string
  pressReleaseCategory1?: string
  pressReleaseCategory2?: string
  companyName: string
  companyWebsite?: string
  industry?: string
  address?: string
  phoneNumber?: string
  representative?: string
  listingStatus?: string
  capitalAmountText?: string
  establishedDateText?: string
  capitalAmountNumeric?: number
  establishedYear?: number
  establishedMonth?: number
  businessCategory?: string
  industryCategory?: string
  createdAt: string
  updatedAt: string
}

export interface PRTimesSearchFilters {
  companyName?: string
  industry?: string[]
  pressReleaseType?: string[]
  listingStatus?: string[]
  capitalMin?: number
  capitalMax?: number
  establishedYearMin?: number
  establishedYearMax?: number
  deliveryDateFrom?: string
  deliveryDateTo?: string
  page?: number
  limit?: number
  exportAll?: boolean
  tableOnly?: boolean
  countOnly?: boolean
  forceRefresh?: boolean
}

export interface PRTimesSearchResponse {
  companies: PRTimesCompany[]
  pagination: {
    currentPage: number
    totalPages: number
    totalCount: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export interface PRTimesCategory {
  id: number
  categoryType: 'category1' | 'category2' | 'industry' | 'listing_status'
  categoryName: string
  usageCount: number
  isActive: boolean
  createdAt: string
}

export interface PRTimesCSVRow {
  deliveryDate: string
  pressReleaseUrl: string
  pressReleaseTitle: string
  pressReleaseCategory1: string
  pressReleaseCategory2: string
  companyName: string
  companyWebsite: string
  industry: string
  address: string
  phoneNumber: string
  representative: string
  listingStatus: string
  capitalAmountText: string
  establishedDateText: string
  capitalAmountNumeric: string
  establishedYear: string
  establishedMonth: string
}

export interface PRTimesExportData {
  companyName: string
  companyWebsite: string
}