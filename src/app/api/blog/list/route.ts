import { NextRequest, NextResponse } from "next/server";
import { getBlogPosts } from "@/lib/blog";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const blogIdParam = searchParams.get("blogId") || "totcar";
    const blogIds = blogIdParam.split(',');

    // Limit to 10 posts per blog when fetching all to improve performance
    const limit = blogIds.length > 1 ? 10 : 0;

    const blogPromises = blogIds.map(id => getBlogPosts(id, limit));
    const results = await Promise.all(blogPromises);
    let allPosts: any[] = results.flat();

    // Sort by publication date (newest first)
    allPosts.sort((a, b) => {
        const getTime = (dateStr: string) => {
            if (!dateStr) return 0;
            // Handle various formats: "2024.03.15.", "2024-03-15T...", "RSS format"
            let normalized = dateStr;
            if (/^\d{4}\.\d{2}\.\d{2}\.$/.test(dateStr)) {
                normalized = dateStr.replace(/\./g, '-').replace(/-$/, '');
            }
            const time = new Date(normalized).getTime();
            return isNaN(time) ? 0 : time;
        };

        const timeA = getTime(a.published_at);
        const timeB = getTime(b.published_at);

        // If times are equal or invalid, maintain order or use original index
        if (timeB === timeA) return 0;
        return timeB - timeA;
    });

    return NextResponse.json({ posts: allPosts });
  } catch (error: any) {
    console.error("Blog List Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
