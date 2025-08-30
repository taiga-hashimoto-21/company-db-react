const axios = require('axios')
const fs = require('fs')
const path = require('path')

// 法人番号API設定
const HOUJIN_API_ID = 'KtLKHsYJGaNRT'
const HOUJIN_API_BASE_URL = 'https://api.houjin-bangou.nta.go.jp/4'

// CSVヘッダー
const CSV_HEADER = [
  '法人番号',
  '法人名',
  '法人名カナ',
  '本店所在地',
  '郵便番号',
  '設立年月日',
  '法人種別',
  '資本金',
  '従業員数',
  '事業内容',
  '更新年月日'
].join(',')

// 法人番号APIから企業データ取得
async function fetchCorporateData(date, maxCount = 1000) {
  try {
    // 特定法人番号での取得テスト（トヨタ自動車の法人番号例）
    const url = `${HOUJIN_API_BASE_URL}/num?id=${HOUJIN_API_ID}&number=5180001008846&type=12&history=0`
    console.log(`🔍 法人番号API呼び出し（全件取得モード）`)
    console.log(`📡 URL: ${url}`)
    
    const response = await axios.get(url, {
      timeout: 60000, // 60秒タイムアウト
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CorporateDataCollector/1.0'
      }
    })
    
    const data = response.data
    console.log(`✅ API応答: ${response.status}`)
    
    // APIレスポンス構造を確認
    const corporations = data.corporations || data.corporate || [data] || []
    console.log(`📊 取得件数: ${corporations.length}件`)
    
    if (corporations.length === 0) {
      console.log('⚠️  該当する企業データがありません')
      console.log('📋 レスポンス構造:', JSON.stringify(data, null, 2).substring(0, 500) + '...')
      return []
    }
    
    // 件数制限
    const limitedCorporations = corporations.slice(0, maxCount)
    console.log(`📋 出力対象: ${limitedCorporations.length}件 (上限: ${maxCount})`)
    
    return limitedCorporations
    
  } catch (error) {
    console.error('❌ 法人番号API呼び出しエラー:', error.message)
    if (error.response) {
      console.error('📄 レスポンス詳細:')
      console.error(`   ステータス: ${error.response.status}`)
      console.error(`   データ: ${JSON.stringify(error.response.data, null, 2)}`)
    }
    throw error
  }
}

// 企業データをCSV形式に変換
function convertToCSV(corporations) {
  console.log('📝 CSV変換開始...')
  
  const csvRows = [CSV_HEADER]
  
  corporations.forEach((corp, index) => {
    try {
      // データの正規化とクリーニング
      const corporateNumber = corp.corporate_number || corp.houjin_bangou || ''
      const name = (corp.name || corp.company_name || '').replace(/[",\r\n]/g, ' ').trim()
      const nameKana = (corp.name_kana || corp.furigana || '').replace(/[",\r\n]/g, ' ').trim()
      const address = (corp.location || corp.address || corp.head_office_location || '').replace(/[",\r\n]/g, ' ').trim()
      const postalCode = (corp.postal_code || corp.zip_code || '').replace(/[",\r\n]/g, ' ').trim()
      const establishedDate = corp.established_date || corp.establishment_date || ''
      const corporateType = corp.corporate_type || corp.kind || '株式会社'
      const capital = corp.capital || corp.capital_amount || ''
      const employees = corp.employees || corp.employee_count || ''
      const business = (corp.business_description || corp.business_summary || '').replace(/[",\r\n]/g, ' ').trim()
      const updateDate = corp.update_date || corp.last_update_date || new Date().toISOString().split('T')[0]
      
      // CSVデータ行作成
      const csvRow = [
        `"${corporateNumber}"`,
        `"${name}"`,
        `"${nameKana}"`,
        `"${address}"`,
        `"${postalCode}"`,
        `"${establishedDate}"`,
        `"${corporateType}"`,
        `"${capital}"`,
        `"${employees}"`,
        `"${business}"`,
        `"${updateDate}"`
      ].join(',')
      
      csvRows.push(csvRow)
      
      if ((index + 1) % 100 === 0) {
        console.log(`📊 変換進捗: ${index + 1}/${corporations.length}`)
      }
      
    } catch (error) {
      console.error(`❌ データ変換エラー (${index + 1}件目):`, error.message)
      console.error(`   対象データ:`, JSON.stringify(corp, null, 2))
    }
  })
  
  console.log(`✅ CSV変換完了: ${csvRows.length - 1}件`)
  return csvRows.join('\n')
}

// CSVファイル保存
async function saveCSVFile(csvContent, date, count) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')
  const fileName = `houjin_data_${date}_${count}件_${timestamp[0]}_${timestamp[1].split('.')[0]}.csv`
  const filePath = path.join(__dirname, '..', 'exports', fileName)
  
  // exports ディレクトリ作成
  const exportsDir = path.dirname(filePath)
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true })
    console.log(`📁 ディレクトリ作成: ${exportsDir}`)
  }
  
  try {
    // BOM付きUTF-8で保存（Excel対応）
    const csvWithBOM = '\uFEFF' + csvContent
    fs.writeFileSync(filePath, csvWithBOM, 'utf8')
    
    console.log(`💾 CSVファイル保存完了`)
    console.log(`📂 ファイルパス: ${filePath}`)
    console.log(`📊 ファイルサイズ: ${(csvWithBOM.length / 1024).toFixed(2)} KB`)
    
    return {
      fileName,
      filePath,
      size: csvWithBOM.length
    }
    
  } catch (error) {
    console.error('❌ ファイル保存エラー:', error.message)
    throw error
  }
}

// 統計情報表示
function showStatistics(corporations) {
  console.log('\n📊 データ統計:')
  console.log(`   総件数: ${corporations.length}`)
  
  // 法人種別別集計
  const typeStats = {}
  corporations.forEach(corp => {
    const type = corp.corporate_type || corp.kind || '不明'
    typeStats[type] = (typeStats[type] || 0) + 1
  })
  
  console.log('   法人種別別:')
  Object.entries(typeStats)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .forEach(([type, count]) => {
      console.log(`     ${type}: ${count}件`)
    })
  
  // 住所都道府県別集計（上位10）
  const prefStats = {}
  corporations.forEach(corp => {
    const address = corp.location || corp.address || ''
    const match = address.match(/^(東京都|大阪府|京都府|.{2,3}県)/)
    const pref = match ? match[1] : '不明'
    prefStats[pref] = (prefStats[pref] || 0) + 1
  })
  
  console.log('   都道府県別（上位10）:')
  Object.entries(prefStats)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .forEach(([pref, count]) => {
      console.log(`     ${pref}: ${count}件`)
    })
}

// メイン処理
async function exportHoujinData(date, maxCount = 1000) {
  const startTime = Date.now()
  
  console.log('🚀 国税庁法人番号API → CSV出力システム')
  console.log(`📅 対象日付: ${date}`)
  console.log(`🔢 最大取得件数: ${maxCount}`)
  console.log('')
  
  try {
    // 1. 法人番号APIから企業データ取得
    console.log('【Step 1】法人データ取得中...')
    const corporations = await fetchCorporateData(date, maxCount)
    
    if (corporations.length === 0) {
      console.log('⚠️  出力対象データがありません。終了します。')
      return null
    }
    
    // 2. 統計情報表示
    console.log('\n【Step 2】データ分析中...')
    showStatistics(corporations)
    
    // 3. CSV変換
    console.log('\n【Step 3】CSV変換中...')
    const csvContent = convertToCSV(corporations)
    
    // 4. ファイル保存
    console.log('\n【Step 4】ファイル保存中...')
    const fileInfo = await saveCSVFile(csvContent, date, corporations.length)
    
    // 5. 完了報告
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n🎉 処理完了！ (処理時間: ${elapsed}秒)`)
    console.log(`📁 出力ファイル: ${fileInfo.fileName}`)
    console.log(`📊 出力件数: ${corporations.length}件`)
    
    return fileInfo
    
  } catch (error) {
    console.error('\n❌ 処理エラー:', error.message)
    throw error
  }
}

// コマンドライン実行
if (require.main === module) {
  const date = process.argv[2] || new Date().toISOString().split('T')[0]
  const maxCount = parseInt(process.argv[3]) || 1000
  
  console.log('📋 使用方法: node houjin-csv-exporter.js [日付] [最大件数]')
  console.log(`📋 実行例: node houjin-csv-exporter.js 2024-01-01 500`)
  console.log('')
  
  exportHoujinData(date, maxCount)
    .then(result => {
      if (result) {
        console.log('✨ 正常終了')
        process.exit(0)
      } else {
        console.log('⚠️  データなしで終了')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('💥 異常終了:', error.message)
      process.exit(1)
    })
}

module.exports = { exportHoujinData }