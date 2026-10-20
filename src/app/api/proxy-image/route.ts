import { NextRequest, NextResponse } from "next/server";

const ALLOWED_DOMAINS = [
  'cloudfront.net',
  'postype.com',
  'naver.net',
  'pstatic.net',
  'daumcdn.net',
  'tistory.com',
  'kakaocdn.net',
  'brunch.co.kr',
];

function isAllowedImageUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);

    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block private/internal IP ranges and local hosts
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '169.254.169.254' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    // Check against allowed domains
    return ALLOWED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get("url");

    if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
      return new NextResponse("Invalid or untrusted image URL", { status: 400 });
    }

    // Determine appropriate Referer based on domain
    let referer = "https://www.postype.com/";
    if (imageUrl.includes("naver.net") || imageUrl.includes("pstatic.net")) {
      referer = "https://m.blog.naver.com/";
    } else if (imageUrl.includes("daumcdn.net") || imageUrl.includes("tistory.com") || imageUrl.includes("kakaocdn.net")) {
      referer = "https://tistory.com/";
    }

    const imageRes = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": referer,
      },
    });

    if (!imageRes.ok) {
      return new NextResponse(`Failed to fetch image: ${imageRes.statusText}`, { status: imageRes.status });
    }

    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await imageRes.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (error: any) {
    console.error("Proxy Image Error:", error);
    return new NextResponse(error.message || "Image proxy error", { status: 500 });
  }
}
