import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

// PostgreSQL接続
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost', 
  database: process.env.POSTGRES_DB || 'company_db',
  password: process.env.POSTGRES_PASSWORD || 'password',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
})

// CSVタスクテーブル作成
async function ensureTaskTable() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS csv_tasks (
        id SERIAL PRIMARY KEY,
        task_name VARCHAR(255) NOT NULL,
        csv_data TEXT NOT NULL,
        total_count INTEGER NOT NULL,
        processed_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        created_by VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_csv_tasks_status ON csv_tasks(status)
    `)
  } finally {
    client.release()
  }
}

// CSVデータをパース
function parseCSV(csvText: string): any[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSVデータが不正です（ヘッダー行+データ行が必要）')
  }
  
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
  const data = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim())
    if (values.length !== headers.length) {
      console.warn(`⚠️  行 ${i + 1}: 列数不一致 (期待値: ${headers.length}, 実際: ${values.length})`)
      continue
    }
    
    const rowData: any = {}
    headers.forEach((header, index) => {
      rowData[header] = values[index]
    })
    data.push(rowData)
  }
  
  return data
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('csvFile') as File
    const taskName = formData.get('taskName') as string
    const createdBy = formData.get('createdBy') as string || 'unknown'
    
    if (!file) {
      return NextResponse.json(
        { error: 'CSVファイルが選択されていません' },
        { status: 400 }
      )
    }
    
    if (!taskName) {
      return NextResponse.json(
        { error: 'タスク名が入力されていません' },
        { status: 400 }
      )
    }
    
    // ファイル形式チェック
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { error: 'CSVファイルのみアップロード可能です' },
        { status: 400 }
      )
    }
    
    // ファイルサイズチェック (10MB制限)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'ファイルサイズは10MB以下にしてください' },
        { status: 400 }
      )
    }
    
    // CSVデータ読み込み
    const csvText = await file.text()
    console.log(`📄 CSVファイル読み込み完了: ${file.name} (${file.size} bytes)`)
    
    // CSVデータ解析
    const csvData = parseCSV(csvText)
    console.log(`📊 CSV解析完了: ${csvData.length}件`)
    
    if (csvData.length === 0) {
      return NextResponse.json(
        { error: 'CSVデータが空または形式が不正です' },
        { status: 400 }
      )
    }
    
    // 必須フィールドチェック
    const requiredFields = ['法人名', '本店所在地']
    const sampleRow = csvData[0]
    const missingFields = requiredFields.filter(field => !(field in sampleRow))
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { 
          error: `必須フィールドが不足しています: ${missingFields.join(', ')}`,
          availableFields: Object.keys(sampleRow)
        },
        { status: 400 }
      )
    }
    
    // データベースに保存
    await ensureTaskTable()
    const client = await pool.connect()
    
    try {
      const result = await client.query(`
        INSERT INTO csv_tasks (task_name, csv_data, total_count, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id, task_name, total_count, created_at
      `, [taskName, JSON.stringify(csvData), csvData.length, createdBy])
      
      const task = result.rows[0]
      console.log(`✅ CSVタスク保存完了: ID ${task.id}`)
      
      return NextResponse.json({
        success: true,
        message: 'CSVファイルのアップロードが完了しました',
        task: {
          id: task.id,
          name: task.task_name,
          totalCount: task.total_count,
          createdAt: task.created_at
        },
        preview: csvData.slice(0, 5) // プレビュー用に最初の5件
      })
      
    } finally {
      client.release()
    }
    
  } catch (error) {
    console.error('❌ CSV アップロードエラー:', error)
    return NextResponse.json(
      { 
        error: 'アップロード処理中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// タスク一覧取得
export async function GET(request: NextRequest) {
  try {
    await ensureTaskTable()
    const client = await pool.connect()
    
    try {
      const result = await client.query(`
        SELECT 
          id, task_name, total_count, processed_count, 
          success_count, failed_count, status,
          created_by, created_at, updated_at
        FROM csv_tasks 
        ORDER BY created_at DESC
        LIMIT 20
      `)
      
      return NextResponse.json({
        success: true,
        tasks: result.rows.map(row => ({
          id: row.id,
          name: row.task_name,
          totalCount: row.total_count,
          processedCount: row.processed_count,
          successCount: row.success_count,
          failedCount: row.failed_count,
          status: row.status,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          progress: row.total_count > 0 ? Math.round((row.processed_count / row.total_count) * 100) : 0
        }))
      })
      
    } finally {
      client.release()
    }
    
  } catch (error) {
    console.error('❌ タスク一覧取得エラー:', error)
    return NextResponse.json(
      { error: 'タスク一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}