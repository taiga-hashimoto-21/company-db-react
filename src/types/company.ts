export interface Company {
  id: string
  companyName: string
  companyWebsite?: string
  representative?: string
  address?: string
  prefecture?: string
  industry?: string
  employees?: number
  capital?: number
  establishedYear?: number
  createdAt?: string
  updatedAt?: string
}

export interface CompanySearchFilters {
  companyName?: string
  prefecture?: string[]
  industry?: string[]
  employeesMin?: number
  employeesMax?: number
  capitalMin?: number
  capitalMax?: number
  establishedYearMin?: number
  establishedYearMax?: number
  page?: number
  limit?: number
  exportAll?: boolean
  tableOnly?: boolean
  countOnly?: boolean
}

export interface CompanySearchResponse {
  companies: Company[]
  pagination: {
    currentPage: number
    totalPages: number
    totalCount: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}