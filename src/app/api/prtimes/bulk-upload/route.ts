import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function POST(request: NextRequest) {
  let tmpFilePath: string | null = null

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      )
    }

    // ファイルサイズチェック（100MB上限）
    const maxSize = 100 * 1024 * 1024 // 100MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 100MB' },
        { status: 400 }
      )
    }

    // 一時ファイル作成
    const timestamp = Date.now()
    const tmpFileName = `prtimes_upload_${timestamp}.csv`
    tmpFilePath = join(tmpdir(), tmpFileName)

    const arrayBuffer = await file.arrayBuffer()
    await writeFile(tmpFilePath, Buffer.from(arrayBuffer))

    const client = await pool.connect()

    try {
      // バッチIDを生成してアップロード履歴を記録
      const batchId = 'bulk_' + timestamp

      // CSVの行数を事前に取得
      const csvContent = Buffer.from(arrayBuffer).toString()
      const lines = csvContent.split('\n').filter(line => line.trim() !== '')
      const totalRows = Math.max(0, lines.length - 1) // ヘッダーを除く

      const batchResult = await client.query(`
        INSERT INTO prtimes_uploads (filename, total_records, file_size_kb, uploaded_by, batch_id, status)
        VALUES ($1, $2, $3, $4, $5, 'processing')
        RETURNING id, batch_id
      `, [
        file.name,
        totalRows,
        Math.round(file.size / 1024),
        'admin', // TODO: 実際のユーザー名を使用
        batchId
      ])

      const uploadId = batchResult.rows[0].id

      // 非同期で高速処理を開始
      processBulkCSVAsync(tmpFilePath, uploadId, batchId, file.name)

      return NextResponse.json({
        message: 'Bulk CSV upload started (using COPY command)',
        batchId,
        estimatedTime: '2-5分',
        method: 'COPY'
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Bulk upload error:', error)

    // エラー時は一時ファイルを削除
    if (tmpFilePath) {
      try {
        await unlink(tmpFilePath)
      } catch (unlinkError) {
        console.error('Failed to delete temp file:', unlinkError)
      }
    }

    return NextResponse.json(
      { error: 'Failed to process bulk upload' },
      { status: 500 }
    )
  }
}

async function processBulkCSVAsync(tmpFilePath: string, uploadId: number, batchId: string, originalFilename: string) {
  const client = await pool.connect()
  let successCount = 0
  let errorCount = 0

  try {
    console.log('🚀 Starting bulk COPY process...')
    const startTime = Date.now()

    // インデックス無効化で高速化
    console.log('⏸️ Disabling indexes for faster import...')
    try {
      await client.query('DROP INDEX IF EXISTS idx_prtimes_company_name_temp')
      await client.query('DROP INDEX IF EXISTS idx_prtimes_website_temp')
    } catch (indexError) {
      console.log('Index drop skipped (may not exist)')
    }

    // 一時テーブル作成
    await client.query(`
      CREATE TEMPORARY TABLE temp_prtimes_upload (
        delivery_date text,
        press_release_url text,
        press_release_title text,
        press_release_type text,
        press_release_category1 text,
        press_release_category2 text,
        company_name text,
        company_website text,
        business_category text,
        address text,
        phone_number text,
        representative text,
        listing_status text,
        capital_amount_text text,
        established_date_text text,
        capital_amount_numeric text,
        established_year text,
        established_month text
      )
    `)

    // COPY コマンドで超高速インポート
    console.log('⚡ Executing COPY command...')
    const copyResult = await client.query(`
      COPY temp_prtimes_upload
      FROM '${tmpFilePath}'
      WITH (FORMAT csv, HEADER true, DELIMITER ',', NULL '')
    `)

    console.log(`📥 COPY completed: ${copyResult.rowCount} rows imported`)

    // データ変換・検証して本テーブルに挿入
    console.log('🔄 Converting and validating data...')
    const insertResult = await client.query(`
      INSERT INTO prtimes_companies (
        delivery_date, press_release_url, press_release_title, press_release_category1,
        press_release_category2, company_name, company_website, business_category,
        listing_status, press_release_type, address, phone_number, representative,
        capital_amount_text, established_date_text, capital_amount_numeric,
        established_year, established_month, batch_id
      )
      SELECT
        CASE
          WHEN delivery_date IS NULL OR delivery_date = '' THEN NOW()
          ELSE COALESCE(delivery_date::timestamp, NOW())
        END,
        COALESCE(SUBSTRING(press_release_url, 1, 1000), ''),
        COALESCE(press_release_title, ''),
        COALESCE(SUBSTRING(press_release_category1, 1, 100), ''),
        COALESCE(SUBSTRING(press_release_category2, 1, 100), ''),
        COALESCE(SUBSTRING(company_name, 1, 255), ''),
        CASE
          WHEN company_website IS NULL OR company_website = '' THEN NULL
          ELSE SUBSTRING(company_website, 1, 1000)
        END,
        COALESCE(SUBSTRING(business_category, 1, 100), ''),
        COALESCE(SUBSTRING(listing_status, 1, 200), ''),
        COALESCE(SUBSTRING(press_release_type, 1, 100), ''),
        COALESCE(SUBSTRING(address, 1, 500), ''),
        COALESCE(SUBSTRING(phone_number, 1, 100), ''),
        COALESCE(SUBSTRING(representative, 1, 200), ''),
        COALESCE(SUBSTRING(capital_amount_text, 1, 200), ''),
        COALESCE(SUBSTRING(established_date_text, 1, 100), ''),
        CASE
          WHEN capital_amount_numeric IS NULL OR capital_amount_numeric = '' THEN NULL
          ELSE capital_amount_numeric::integer
        END,
        CASE
          WHEN established_year IS NULL OR established_year = '' THEN NULL
          ELSE established_year::integer
        END,
        CASE
          WHEN established_month IS NULL OR established_month = '' THEN NULL
          ELSE established_month::integer
        END,
        $1
      FROM temp_prtimes_upload
      WHERE company_name IS NOT NULL AND company_name != ''
    `, [batchId])

    successCount = insertResult.rowCount || 0
    const totalProcessed = copyResult.rowCount || 0
    errorCount = totalProcessed - successCount

    // インデックス再構築
    console.log('🔨 Rebuilding indexes...')
    await client.query('CREATE INDEX IF NOT EXISTS idx_prtimes_company_name ON prtimes_companies(company_name)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_prtimes_website ON prtimes_companies(company_website)')

    const endTime = Date.now()
    const processingTime = Math.round((endTime - startTime) / 1000)

    console.log(`✅ Bulk processing completed in ${processingTime}s: ${successCount} success, ${errorCount} errors`)

    // アップロード履歴を更新
    const status = errorCount === 0 ? 'completed' : (successCount > 0 ? 'partial' : 'failed')
    await client.query(`
      UPDATE prtimes_uploads
      SET success_records = $1, error_records = $2, status = $3, progress_count = $4
      WHERE id = $5
    `, [successCount, errorCount, status, successCount + errorCount, uploadId])

    // キャッシュ更新
    if (successCount > 0) {
      try {
        console.log('🔄 Updating search cache...')
        const searchModule = await import('../search/route')
        const { refreshCacheInBackground } = searchModule
        refreshCacheInBackground()
        console.log('✅ Cache update initiated')
      } catch (cacheError) {
        console.error('⚠️ Cache update failed:', cacheError)
      }
    }

  } catch (error) {
    console.error('❌ Bulk processing error:', error)
    errorCount = 1
    await client.query(`
      UPDATE prtimes_uploads
      SET status = 'failed', error_records = 1
      WHERE id = $1
    `, [uploadId])
  } finally {
    client.release()

    // 一時ファイル削除
    try {
      await unlink(tmpFilePath)
      console.log('🗑️ Temporary file deleted')
    } catch (unlinkError) {
      console.error('Failed to delete temp file:', unlinkError)
    }
  }
}