import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0
  
  while (i < line.length) {
    const char = line[i]
    
    if (char === '"' && (i === 0 || line[i - 1] === ',')) {
      inQuotes = true
    } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i + 1] === ',')) {
      inQuotes = false
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
    
    i++
  }
  
  result.push(current.trim())
  return result
}

function parseCapitalAmount(capitalText: string): number | null {
  if (!capitalText) return null
  
  const match = capitalText.match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
  if (!match) return null
  
  const numStr = match[1].replace(/,/g, '')
  const num = parseFloat(numStr)
  
  if (capitalText.includes('億')) {
    return Math.round(num * 10000)
  } else if (capitalText.includes('万')) {
    return Math.round(num)
  } else {
    return Math.round(num / 10000)
  }
}

function parseEstablishedDate(dateText: string): { year: number | null, month: number | null } {
  if (!dateText) return { year: null, month: null }
  
  const yearMatch = dateText.match(/(\d{4})/);
  const monthMatch = dateText.match(/(\d{1,2})月/);
  
  return {
    year: yearMatch ? parseInt(yearMatch[1]) : null,
    month: monthMatch ? parseInt(monthMatch[1]) : null
  }
}

async function updateCategories(client: any, categoryType: string, categoryName: string) {
  if (!categoryName || categoryName.trim() === '') return
  
  try {
    await client.query(`
      INSERT INTO prtimes_categories (category_type, category_name) 
      VALUES ($1, $2)
    `, [categoryType, categoryName.trim()])
  } catch (error) {
    // 重複エラーは無視
    if (!error.message.includes('duplicate key')) {
      console.error(`Error updating category ${categoryType}:`, error)
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      )
    }
    
    const csvText = await file.text()
    const lines = csvText.split('\n').filter(line => line.trim() !== '')
    
    if (lines.length < 3) {
      return NextResponse.json(
        { error: 'CSV file must contain at least header and one data row' },
        { status: 400 }
      )
    }
    
    const client = await pool.connect()
    
    try {
      // バッチIDを生成してアップロード履歴を記録
      const batchId = 'batch_' + Date.now()
      const batchResult = await client.query(`
        INSERT INTO prtimes_uploads (filename, total_records, file_size_kb, uploaded_by, batch_id, status)
        VALUES ($1, $2, $3, $4, $5, 'processing')
        RETURNING id, batch_id
      `, [
        file.name,
        lines.length - 2, // ヘッダー行を除く
        Math.round(file.size / 1024),
        'admin', // TODO: 実際のユーザー名を使用
        batchId
      ])
      
      const uploadId = batchResult.rows[0].id
      const returnedBatchId = batchResult.rows[0].batch_id
      
      // batchIdを即座に返してフロントエンドが進捗監視を開始できるようにする
      // 実際の処理は非同期で実行（新しい接続を使用）
      processCSVAsync(lines, uploadId, batchId)
      
      return NextResponse.json({
        message: 'CSV upload started',
        batchId: returnedBatchId
      })
    } catch (error) {
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('CSV upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload CSV file' },
      { status: 500 }
    )
  }
}

async function processCSVAsync(lines: string[], uploadId: number, batchId: string) {
  const client = await pool.connect()
  let successCount = 0
  let errorCount = 0
  const errors: string[] = []
  
  try {
      
      for (let i = 2; i < lines.length; i++) {
        let values: string[] = []
        try {
          values = parseCSVLine(lines[i])
          
          console.log(`Row ${i}: ${values.length} columns - ${values.slice(0, 3)}`)
          
          if (values.length < 10) {
            errors.push(`行 ${i}: 列数が不足しています (${values.length}/10以上)`)
            errorCount++
            continue
          }
          
          // 日時の安全な変換
          let deliveryDate = null
          if (values[0] && values[0].trim() !== '') {
            const dateStr = values[0].trim()
            const parsedDate = new Date(dateStr)
            if (!isNaN(parsedDate.getTime())) {
              deliveryDate = parsedDate.toISOString()
            } else {
              // 日付形式が不正な場合は現在時刻を使用
              deliveryDate = new Date().toISOString()
            }
          } else {
            // 日付が空の場合は現在時刻を使用
            deliveryDate = new Date().toISOString()
          }
          // 文字数制限を適用して安全に格納（CSVの正しい列順序に合わせて調整）
          const pressReleaseUrl = (values[1] || '').substring(0, 1000)
          const pressReleaseTitle = values[2] || ''
          const pressReleaseType = (values[3] || '').substring(0, 100) || null
          const pressReleaseCategory1 = (values[4] || '').substring(0, 100) || null
          const pressReleaseCategory2 = (values[5] || '').substring(0, 100) || null
          const companyName = (values[6] || '').substring(0, 255)
          const companyWebsite = (values[7] || '').substring(0, 1000) || null
          const industry = (values[8] || '').substring(0, 100) || null
          const address = (values[9] || '').substring(0, 500) || null
          const phoneNumber = (values[10] || '').substring(0, 100) || null
          const representative = (values[11] || '').substring(0, 200) || null
          const listingStatus = (values[12] || '').substring(0, 200) || null
          const capitalAmountText = (values[13] || '').substring(0, 200) || null
          const establishedDateText = (values[14] || '').substring(0, 100) || null
          const capitalAmountNumericStr = values[15] || null
          const establishedYearStr = values[16] || null
          const establishedMonthStr = values[17] || null
          
          // 数値フィールドの安全な変換
          let capitalAmountNumeric = null
          if (capitalAmountNumericStr && capitalAmountNumericStr.trim() !== '') {
            const parsed = parseInt(capitalAmountNumericStr.replace(/,/g, ''))
            capitalAmountNumeric = isNaN(parsed) ? null : parsed
          } else if (capitalAmountText) {
            const parsed = parseCapitalAmount(capitalAmountText)
            capitalAmountNumeric = parsed
          }
          
          // 設立年月の処理
          let establishedYear = null
          let establishedMonth = null
          if (establishedYearStr && establishedYearStr.trim() !== '') {
            const parsed = parseInt(establishedYearStr)
            establishedYear = isNaN(parsed) ? null : parsed
          }
          if (establishedMonthStr && establishedMonthStr.trim() !== '') {
            const parsed = parseInt(establishedMonthStr)
            establishedMonth = isNaN(parsed) ? null : parsed
          }
          
          if (!companyName || companyName.trim() === '') {
            errors.push(`行 ${i}: 会社名が必要です`)
            errorCount++
            continue
          }
          
          const insertResult = await client.query(`
            INSERT INTO prtimes_companies (
              delivery_date, press_release_url, press_release_title, press_release_category1,
              press_release_category2, company_name, company_website, business_category,
              listing_status, press_release_type, address, phone_number, representative,
              capital_amount_text, established_date_text, capital_amount_numeric,
              established_year, established_month, batch_id
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
            )
          `, [
            deliveryDate, pressReleaseUrl, pressReleaseTitle, pressReleaseCategory1,
            pressReleaseCategory2, companyName, companyWebsite, industry,
            listingStatus, pressReleaseType, address, phoneNumber, representative,
            capitalAmountText, establishedDateText, capitalAmountNumeric,
            establishedYear, establishedMonth, batchId
          ])
          
          console.log(`Inserted row ${i}: ${companyName}`)
          
          // カテゴリ更新は削除（処理を高速化）
          
          successCount++
          
          // 10行ごとに進捗を更新（パフォーマンス向上とリアルタイム更新のバランス）
          if ((successCount + errorCount) % 10 === 0 || i === lines.length - 1) {
            await client.query(`
              UPDATE prtimes_uploads 
              SET progress_count = $1
              WHERE id = $2
            `, [successCount + errorCount, uploadId])
          }
        } catch (rowError) {
          console.error(`Error processing row ${i}:`, rowError)
          console.error(`Row data:`, values || 'undefined')
          const errorMessage = rowError instanceof Error ? rowError.message : 'データ処理エラー'
          const safeValues = values || []
          errors.push(`行 ${i}: ${errorMessage} - データ: ${JSON.stringify(safeValues.slice(0, 5))}`)
          errorCount++
          
          // 10行ごとに進捗を更新（パフォーマンス向上とリアルタイム更新のバランス）
          if ((successCount + errorCount) % 10 === 0 || i === lines.length - 1) {
            await client.query(`
              UPDATE prtimes_uploads 
              SET progress_count = $1
              WHERE id = $2
            `, [successCount + errorCount, uploadId])
          }
        }
      }
      
    // アップロード履歴を更新
    const status = errorCount === 0 ? 'completed' : (successCount > 0 ? 'partial' : 'failed')
    await client.query(`
      UPDATE prtimes_uploads 
      SET success_records = $1, error_records = $2, status = $3, progress_count = $5
      WHERE id = $4
    `, [successCount, errorCount, status, uploadId, successCount + errorCount])
    
    console.log(`✅ CSV processing completed: ${successCount} success, ${errorCount} errors`)

    // キャッシュ更新処理
    if (successCount > 0) {
      try {
        console.log('🔄 Updating cache with newly uploaded data...')

        // 最新の成功したレコードを取得
        const newDataResult = await client.query(`
          SELECT * FROM prtimes_companies
          WHERE created_at >= $1
          AND company_website IS NOT NULL
          AND company_website != ''
          AND company_website != '-'
          ORDER BY created_at DESC
        `, [new Date(Date.now() - 60000)]) // 1分前から取得（余裕を持たせる）

        // キャッシュ更新関数を動的にインポート
        const searchModule = await import('../search/route')
        const { updateCacheWithNewData, refreshCacheInBackground } = searchModule

        if (newDataResult.rows.length > 0) {
          // 増分キャッシュ更新
          updateCacheWithNewData(newDataResult.rows)

          // バックグラウンドで完全なキャッシュ再構築
          refreshCacheInBackground()

          console.log(`✅ Cache updated with ${newDataResult.rows.length} new companies`)
        }
      } catch (cacheError) {
        console.error('⚠️ Cache update failed, but upload was successful:', cacheError)
        // キャッシュ更新に失敗してもアップロード自体は成功扱い
      }
    }
  } catch (error) {
    console.error('❌ Error in async CSV processing:', error)
    // エラー時は失敗ステータスに更新
    await client.query(`
      UPDATE prtimes_uploads 
      SET status = 'failed', progress_count = $2
      WHERE id = $1
    `, [uploadId, successCount + errorCount])
  } finally {
    client.release()
  }
}