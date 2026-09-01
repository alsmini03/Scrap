import { NextRequest, NextResponse } from 'next/server';
import { fetchNaverReportContent } from '@/lib/naver-report';

export async function POST(req: NextRequest) {
  try {
    const { num, category = 'company' } = await req.json();

    if (!num) {
      return NextResponse.json({ error: 'Report number is required' }, { status: 400 });
    }

    const html = await fetchNaverReportContent(num, category);

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error: any) {
    console.error('Report content fetch error:', error);
    return new Response(`<p>내용을 불러올 수 없습니다. (${error.message})</p>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}
