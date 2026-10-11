import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get("url");

    if (!imageUrl || !imageUrl.startsWith("http")) {
      return new NextResponse("Invalid image URL", { status: 400 });
    }

    // Determine appropriate Referer based on domain
    let referer = "https://www.postype.com/";
    if (imageUrl.includes("naver.net") || imageUrl.includes("phinf.pstatic.net")) {
      referer = "https://m.blog.naver.com/";
    } else if (imageUrl.includes("daumcdn.net") || imageUrl.includes("tistory.com")) {
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
