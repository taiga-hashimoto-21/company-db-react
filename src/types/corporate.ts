export interface Corporate {
  id: number
  companyName: string      // 企業名
  establishedDate: string  // 設立年月日 (YYYY-MM-DD)
  postalCode: string      // 郵便番号
  address: string         // 所在地
  industry: string        // 業種
  website?: string        // ホームページURL（オプション）
  capitalAmount?: number   // 資本金（円）
  employeeCount?: number   // 従業員数
  prefecture?: string     // 都道府県
  createdAt?: string      // 作成日時
  updatedAt?: string      // 更新日時
}

export interface CorporateSearchParams {
  industries?: string[]     // 業種（複数選択）
  prefectures?: string[]    // 都道府県（複数選択）
  capitalMin?: number       // 資本金下限（万円）
  capitalMax?: number       // 資本金上限（万円）
  employeesMin?: number     // 従業員数下限
  employeesMax?: number     // 従業員数上限
  establishedYearMin?: number  // 設立年下限
  establishedYearMax?: number  // 設立年上限
  page?: number            // ページ番号
  limit?: number           // 1ページあたりの件数
}

export interface PaginationInfo {
  currentPage: number
  totalPages: number
  totalCount: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface CorporateSearchResponse {
  companies: Corporate[]
  pagination: PaginationInfo
}