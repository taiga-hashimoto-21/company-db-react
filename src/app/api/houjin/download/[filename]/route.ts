import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params
    
    if (!filename || !filename.endsWith('.csv')) {
      return NextResponse.json(
        { error: '無効なファイル名です' },
        { status: 400 }
      )
    }

    // ファイルパス検証（パストラバーサル攻撃を防ぐ）
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json(
        { error: '無効なファイル名です' },
        { status: 400 }
      )
    }

    const filePath = path.join(process.cwd(), 'exports', filename)
    
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'ファイルが見つかりません' },
        { status: 404 }
      )
    }

    const fileContent = await readFile(filePath)
    
    return new NextResponse(fileContent as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })

  } catch (error) {
    console.error('❌ ファイルダウンロードエラー:', error)
    return NextResponse.json(
      { error: 'ファイルダウンロード中にエラーが発生しました' },
      { status: 500 }
    )
  }
}