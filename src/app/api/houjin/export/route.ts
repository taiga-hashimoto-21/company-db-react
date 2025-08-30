import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const API_BASE_URL = 'https://info.gbiz.go.jp/hojin/v1'
const API_KEY = 'KtLKHsYJGaNRT'

interface HoujinResponse {
  hojin: Array<{
    hojinBango?: string
    name?: string
    kana?: string
    location?: string
    postalCode?: string
    foundationDate?: string
    corporateType?: string
    capital?: string
    employeeNumber?: string
    businessContent?: string
    updateDate?: string
  }>
  errors?: Array<{
    code: string
    message: string
  }>
}

async function fetchHoujinData(date: string, limit: number): Promise<any[]> {
  const url = `${API_BASE_URL}/diff`
  const params = new URLSearchParams({
    id: API_KEY,
    type: '12',
    from: date,
    to: date,
    limit: limit.toString()
  })

  console.log(`🔍 国税庁API呼び出し: ${url}?${params}`)

  try {
    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'company-db-react/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    const data: HoujinResponse = await response.json()
    
    if (data.errors && data.errors.length > 0) {
      console.warn('⚠️  API警告:', data.errors)
    }

    return data.hojin || []
  } catch (error) {
    console.error('❌ 国税庁API呼び出しエラー:', error)
    throw error
  }
}

function formatToCSV(data: any[]): string {
  if (data.length === 0) {
    return '\uFEFF法人番号,法人名,法人名カナ,本店所在地,郵便番号,設立年月日,法人種別,資本金,従業員数,事業内容,更新年月日\n'
  }

  const headers = [
    '法人番号', '法人名', '法人名カナ', '本店所在地', '郵便番号', 
    '設立年月日', '法人種別', '資本金', '従業員数', '事業内容', '更新年月日'
  ]

  const csvRows = [
    '\uFEFF' + headers.join(','), // BOM付きヘッダー
    ...data.map(row => [
      row.hojinBango || '',
      row.name || '',
      row.kana || '',
      row.location || '',
      row.postalCode || '',
      row.foundationDate || '',
      row.corporateType || '',
      row.capital || '',
      row.employeeNumber || '',
      row.businessContent || '',
      row.updateDate || ''
    ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
  ]

  return csvRows.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const { date, count, createdBy } = await request.json()
    
    if (!date) {
      return NextResponse.json(
        { error: '日付が指定されていません' },
        { status: 400 }
      )
    }

    if (!count || count < 1 || count > 50000) {
      return NextResponse.json(
        { error: '件数は1〜50,000件の範囲で指定してください' },
        { status: 400 }
      )
    }

    console.log(`📊 国税庁APIデータ取得開始: ${date}, ${count}件`)

    // データ取得
    const houjinData = await fetchHoujinData(date, count)
    console.log(`✅ データ取得完了: ${houjinData.length}件`)

    // CSVフォーマット
    const csvContent = formatToCSV(houjinData)
    
    // ファイル名生成
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `houjin_data_${date}_${houjinData.length}件_${timestamp}.csv`
    
    // exports ディレクトリ作成
    const exportDir = path.join(process.cwd(), 'exports')
    if (!existsSync(exportDir)) {
      await mkdir(exportDir, { recursive: true })
    }
    
    // CSVファイル保存
    const filePath = path.join(exportDir, filename)
    await writeFile(filePath, csvContent, 'utf-8')
    
    console.log(`💾 CSVファイル保存: ${filePath}`)
    
    return NextResponse.json({
      success: true,
      message: `国税庁APIから${houjinData.length}件のデータを取得しました`,
      taskId: `export_${Date.now()}`,
      filename,
      count: houjinData.length,
      preview: houjinData.slice(0, 5) // プレビュー用に最初の5件
    })

  } catch (error) {
    console.error('❌ エクスポートエラー:', error)
    return NextResponse.json(
      { 
        error: 'エクスポート処理中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}