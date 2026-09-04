export async function fetchNaverReportContent(num: string | number, category: string = 'company'): Promise<string> {
  if (!num) {
    throw new Error('Report number (researchId) is required');
  }

  const validCategory = ['company', 'industry', 'market', 'invest', 'economy', 'debenture'].includes(category)
    ? category
    : 'company';

  const apiUrl = `https://m.stock.naver.com/api/research/${validCategory}/${num}`;

  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    },
  });

  if (!response.ok) {
    throw new Error(`Naver Research Content API error: ${response.status}`);
  }

  const data = await response.json();
  const contentObj = data?.researchContent || {};

  const formatPrice = (val?: string | number) => {
    if (!val || val === '0' || val === 0) return '';
    const parsed = typeof val === 'number' ? val : parseInt(String(val).replace(/[^0-9]/g, ''), 10);
    return isNaN(parsed) ? String(val) : parsed.toLocaleString('ko-KR') + '원';
  };

  const opinion = contentObj.opinion || '';
  const goalPrice = formatPrice(contentObj.goalPrice);
  const priceAtWriteDate = formatPrice(contentObj.priceAtWriteDate);

  let priceHeader = '';
  if (opinion || goalPrice || priceAtWriteDate) {
    priceHeader = `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; line-height: 1.6; color: #334155;">
        ${opinion ? `<div><b>투자의견:</b> <span style="color:#1978e5; font-weight:bold;">${opinion}</span></div>` : ''}
        ${goalPrice ? `<div><b>목표주가:</b> <span style="font-weight:bold;">${goalPrice}</span></div>` : ''}
        ${priceAtWriteDate ? `<div><b>현재주가:</b> <span style="font-weight:bold;">${priceAtWriteDate}</span></div>` : ''}
      </div>
    `;
  }

  let html = (priceHeader + (contentObj.content || '')).trim();
  if (contentObj.attachUrl) {
    html = `<div style="margin-bottom:12px;"><a href="${contentObj.attachUrl}" target="_blank" rel="noopener noreferrer" style="color:#1978e5; font-weight:bold; font-size:13px; text-decoration:underline;">PDF 원본 다운로드</a></div>` + html;
  }

  return html;
}
