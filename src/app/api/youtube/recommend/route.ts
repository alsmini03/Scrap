import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

function parseYouTubeRelativeTime(timeStr: string): number {
  if (!timeStr) return 0;

  const now = Date.now();
  const match = timeStr.match(/(\d+)\s*(초|분|시간|일|주|개월|년)\s*전/);

  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = match[2];

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  switch (unit) {
    case '초': return now - (value * 1000);
    case '분': return now - (value * minute);
    case '시간': return now - (value * hour);
    case '일': return now - (value * day);
    case '주': return now - (value * week);
    case '개월': return now - (value * month);
    case '년': return now - (value * year);
    default: return now;
  }
}

function extractVideosFromObject(obj: any): any[] {
  const videos: any[] = [];
  const seenIds = new Set<string>();

  const findInObj = (target: any) => {
    if (!target || typeof target !== 'object') return;

    const video = target.richItemRenderer?.content?.videoRenderer || target.gridVideoRenderer || target.videoRenderer;
    if (video) {
      const videoId = video.videoId;
      const title = video.title?.runs?.[0]?.text || video.title?.simpleText || video.title?.accessibility?.accessibilityData?.label;
      const thumbnail = video.thumbnail?.thumbnails?.sort((a: any, b: any) => b.width - a.width)[0]?.url;
      const publishedTime = video.publishedTimeText?.simpleText;
      const viewCount = video.viewCountText?.simpleText;
      const duration = video.lengthText?.simpleText;
      if (videoId && title && !seenIds.has(videoId)) {
        seenIds.add(videoId);
        videos.push({ videoId, title, thumbnail, url: `https://www.youtube.com/watch?v=${videoId}`, publishedTime, viewCount, duration });
      }
    }

    const lockup = target.richItemRenderer?.content?.lockupViewModel || target.lockupViewModel;
    if (lockup) {
      const videoId = lockup.contentId;
      const metadata = lockup.metadata?.lockupMetadataViewModel;
      const title = metadata?.title?.content;
      const thumbnail = lockup.contentImage?.thumbnailViewModel?.image?.sources?.sort((a: any, b: any) => b.width - a.width)[0]?.url;

      let viewCount = "";
      let publishedTime = "";
      const renderer = metadata?.metadata?.contentMetadataViewModel;
      if (renderer?.metadata) {
        viewCount = renderer.metadata[0]?.content || "";
        publishedTime = renderer.metadata[1]?.content || "";
      } else if (renderer?.metadataRows) {
        const row = renderer.metadataRows[0];
        const parts = row?.metadataParts || [];
        viewCount = parts[0]?.text?.content || "";
        publishedTime = parts[1]?.text?.content || "";
      }

      const overlays = lockup.contentImage?.thumbnailViewModel?.overlays || [];
      const durationOverlay = overlays.find((o: any) => o.thumbnailOverlayTimeStatusRenderer);
      const badgeOverlay = overlays.find((o: any) => o.thumbnailBottomOverlayViewModel);
      const duration = durationOverlay?.thumbnailOverlayTimeStatusRenderer?.text?.content ||
                       badgeOverlay?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text || "";

      if (videoId && title && !seenIds.has(videoId)) {
        seenIds.add(videoId);
        videos.push({ videoId, title, thumbnail, url: `https://www.youtube.com/watch?v=${videoId}`, publishedTime, viewCount, duration });
      }
    }

    for (const k of Object.keys(target)) {
      findInObj(target[k]);
    }
  };

  findInObj(obj);
  return videos;
}

function findContinuationToken(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.continuationCommand) return obj.continuationCommand.token;
  for (const k of Object.keys(obj)) {
    const token = findContinuationToken(obj[k]);
    if (token) return token;
  }
  return null;
}

async function fetchChannelVideos(channelUrl: string, continuationStr?: string | null) {
  const isPlaylist = channelUrl.includes("playlist?list=");

  if (continuationStr) {
    try {
      const contData = JSON.parse(Buffer.from(continuationStr, 'base64').toString('utf-8'));
      const browseRes = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${contData.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: contData.clientVersion || '2.20240101.00.00',
              hl: 'ko',
              gl: 'KR'
            }
          },
          continuation: contData.token
        })
      });

      if (browseRes.ok) {
        const browseData = await browseRes.json();
        const videos = extractVideosFromObject(browseData);
        const nextToken = findContinuationToken(browseData);
        const nextContinuation = nextToken && contData.apiKey ? Buffer.from(JSON.stringify({
          token: nextToken,
          apiKey: contData.apiKey,
          clientVersion: contData.clientVersion
        })).toString('base64') : null;

        return { videos, nextContinuation };
      }
    } catch (e) {
      console.error("Continuation fetch error:", e);
    }
  }

  const response = await fetch(channelUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    next: { revalidate: 3600 }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch YouTube page: ${channelUrl}`);
  }

  const html = await response.text();
  const apiKey = html.match(/\"INNERTUBE_API_KEY\":\"([^\"]+)\"/)?.[1] || html.match(/\"innertubeApiKey\":\"([^\"]+)\"/)?.[1];
  const clientVersion = html.match(/\"INNERTUBE_CLIENT_VERSION\":\"([^\"]+)\"/)?.[1] || html.match(/\"innertubeClientVersion\":\"([^\"]+)\"/)?.[1];

  const jsonStrMatch = html.match(/var ytInitialData\s*=\s*({.+?});</) || html.match(/ytInitialData\s*=\s*({.+?});/);

  if (!jsonStrMatch) return { videos: [], nextContinuation: null };

  const ytData = JSON.parse(jsonStrMatch[1]);

  if (isPlaylist) {
    const findPlaylistVideos = (obj: any, results: any[] = []): any[] => {
      if (!obj || typeof obj !== 'object') return results;
      if (obj.playlistVideoRenderer) {
        const v = obj.playlistVideoRenderer;
        results.push({
          videoId: v.videoId,
          title: v.title?.runs?.[0]?.text || v.title?.simpleText,
          thumbnail: v.thumbnail?.thumbnails?.sort((a: any, b: any) => b.width - a.width)[0]?.url,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          publishedTime: "",
          viewCount: "",
          duration: v.lengthText?.simpleText || ""
        });
      }
      for (const key in obj) {
        findPlaylistVideos(obj[key], results);
      }
      return results;
    };

    const videos = findPlaylistVideos(ytData);
    return { videos, nextContinuation: null };
  }

  const token = findContinuationToken(ytData);
  const nextContinuation = token && apiKey ? Buffer.from(JSON.stringify({ token, apiKey, clientVersion })).toString('base64') : null;
  const videos = extractVideosFromObject(ytData);

  return { videos, nextContinuation };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const urlParam = searchParams.get("url");
    const continuation = searchParams.get("continuation");

    if (!urlParam) {
      return NextResponse.json({ videos: [], all: [], nextContinuation: null });
    }

    const urls = urlParam.split(',').filter(Boolean);

    if (urls.length === 1) {
      const { videos, nextContinuation } = await fetchChannelVideos(urls[0], continuation);
      return NextResponse.json({ videos, nextContinuation });
    }

    // Limit to 10 videos per channel when fetching all
    const results = await Promise.allSettled(urls.map(url => fetchChannelVideos(url)));

    const videoGroups = results.map((res) => {
      return res.status === 'fulfilled' ? res.value.videos.slice(0, 10) : [];
    });

    const allVideos = videoGroups.flat();

    allVideos.sort((a, b) => {
        const timeA = parseYouTubeRelativeTime(a.publishedTime);
        const timeB = parseYouTubeRelativeTime(b.publishedTime);
        return timeB - timeA;
    });

    return NextResponse.json({
      all: allVideos,
      videos: allVideos,
      nextContinuation: null
    });
  } catch (error: any) {
    console.error("YouTube Recommend Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
