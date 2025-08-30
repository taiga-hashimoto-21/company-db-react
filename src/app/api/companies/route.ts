import { NextRequest, NextResponse } from 'next/server'
import { createCompany, deleteCompany } from '@/lib/database'

// 企業作成API（管理者用）
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const companyData = await request.json()
    
    // バリデーション
    if (!companyData.companyName || !companyData.establishedDate || !companyData.address || !companyData.industry) {
      return NextResponse.json(
        { error: '必須フィールドが不足しています' },
        { status: 400 }
      )
    }
    
    const newCompany = await createCompany(companyData)
    
    return NextResponse.json({
      company: newCompany,
      _responseTime: Date.now() - startTime,
      _operation: 'create'
    })

  } catch (error) {
    console.error('Create Company API Error:', error)
    return NextResponse.json(
      { 
        error: '企業の作成に失敗しました',
        _responseTime: Date.now() - startTime
      },
      { status: 500 }
    )
  }
}

// 企業削除API（管理者用）
export async function DELETE(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('id')
    
    if (!companyId) {
      return NextResponse.json(
        { error: '企業IDが必要です' },
        { status: 400 }
      )
    }
    
    const success = await deleteCompany(parseInt(companyId))
    
    if (success) {
      return NextResponse.json({
        message: '企業を削除しました',
        _responseTime: Date.now() - startTime,
        _operation: 'delete'
      })
    } else {
      return NextResponse.json(
        { error: '企業が見つかりません' },
        { status: 404 }
      )
    }

  } catch (error) {
    console.error('Delete Company API Error:', error)
    return NextResponse.json(
      { 
        error: '企業の削除に失敗しました',
        _responseTime: Date.now() - startTime
      },
      { status: 500 }
    )
  }
}