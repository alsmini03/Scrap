import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cheerio from "cheerio";
import he from "he";

async function callGeminiInteractionsAPI(apiKey: string, model: string, inputs: any[]) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const payload = {
    model: model,
    input: inputs,
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini Interactions API error:", JSON.stringify(data, null, 2));
    const details = data.error?.details ? ` - ${JSON.stringify(data.error.details)}` : '';
    throw new Error(`${data.error?.message || "Failed to call Gemini Interactions API"}${details} (Used model: ${model}, Payload: ${JSON.stringify(payload)})`);
  }

  // According to docs, we can access output_text if using SDK,
  // but for raw REST we might need to find the final text in steps.
  // "While the Interactions API returns a structured timeline... you don't need to manually traverse... The SDKs provide convenience properties"
  // If we're using raw fetch, we should check what the payload actually is.
  // In the user's example, they just want the result.

  if (data.output_text) return data.output_text;

  // Fallback: search for text in steps
  if (data.steps) {
      const lastTextStep = data.steps
          .slice()
          .reverse()
          .find((s: any) => s.content?.some((c: any) => c.type === 'text'));

      if (lastTextStep) {
          return lastTextStep.content.find((c: any) => c.type === 'text').text;
      }
  }

  return JSON.stringify(data);
}

async function uploadToGeminiFiles(apiKey: string, buffer: Buffer, mimeType: string) {
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;

    // Boundary for multipart request
    const boundary = '-------' + Math.random().toString(16).substring(2);

    const metadata = JSON.stringify({
        file: { display_name: `upload-${Date.now()}` }
    });

    const header = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--`;

    const body = Buffer.concat([
        Buffer.from(header),
        buffer,
        Buffer.from(footer)
    ]);

    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'multipart',
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: body
    });

    const data = await response.json();
    if (!response.ok) {
        console.error("Gemini File Upload error:", JSON.stringify(data, null, 2));
        throw new Error(data.error?.message || "Failed to upload file to Gemini");
    }

    console.log("Gemini File Upload success:", JSON.stringify(data.file, null, 2));
    return data.file; // contains uri, mimeType etc.
}

export async function extractReport(url: string, apiKey: string, modelName?: string, promptText?: string, skipAi: boolean = false) {
    const genAI = new GoogleGenerativeAI(apiKey || "");
    // 1. Fetch the PDF
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch PDF from ${url}`);
    }
    const pdfBuffer = await response.arrayBuffer();

    // Check for PDF signature (%PDF-)
    const buffer = Buffer.from(pdfBuffer);
    const signature = buffer.slice(0, 5).toString('ascii');
    if (signature !== '%PDF-') {
        const contentSample = buffer.slice(0, 500).toString('utf8');
        if (contentSample.includes('<html') || contentSample.includes('<HTML')) {
            throw new Error("유효한 PDF 파일이 아닙니다. (Bondweb 세션 만료 또는 접근 권한 오류)");
        }
        throw new Error("올바른 PDF 형식이 아닙니다.");
    }

    if (skipAi) return "";

    // Special handling for gemini-3.5-flash using Interactions API
    if (modelName === "gemini-3.5-flash") {
        const geminiFile = await uploadToGeminiFiles(apiKey, buffer, "application/pdf");

        return await callGeminiInteractionsAPI(apiKey, modelName, [
            {
                type: "document",
                uri: geminiFile.uri,
                mime_type: geminiFile.mimeType || geminiFile.mime_type
            },
            {
                type: "text",
                text: promptText || "이 리포트를 요약하고 핵심 내용을 분석해 주세요."
            }
        ]);
    }

    const base64Pdf = buffer.toString("base64");

    // 2. Initialize Gemini model
    const geminiModel = genAI.getGenerativeModel({ model: modelName || "gemini-1.5-flash" });

    // 3. Generate content with PDF data
    const result = await geminiModel.generateContent([
      promptText || "이 리포트를 요약하고 핵심 내용을 분석해 주세요.",
      {
        inlineData: {
          data: base64Pdf,
          mimeType: "application/pdf",
        },
      },
    ]);

    return result.response.text();
}

export async function extractYoutube(url: string, apiKey: string, requestedModel?: string, requestedPrompt?: string, skipAi: boolean = false) {
    const genAI = new GoogleGenerativeAI(apiKey || "");
    // First attempt with a browser user agent
    let response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
      },
    });

    let html = await response.text();
    let $ = cheerio.load(html);

    let title = $('meta[property="og:title"]').attr("content") ||
                $('meta[name="twitter:title"]').attr("content") ||
                $("title").text();

    if (!title || title.trim() === "YouTube" || title.trim() === "- YouTube") {
      response = await fetch(url, {
        headers: {
          "User-Agent": "facebookexternalhit/1.1",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });
      html = await response.text();
      $ = cheerio.load(html);
    }

    if (!response.ok) {
      throw new Error("Failed to fetch YouTube page");
    }

    title = $('meta[property="og:title"]').attr("content") ||
            $('meta[name="twitter:title"]').attr("content") ||
            $("title").text() || "";

    const ogDescription = $('meta[property="og:description"]').attr("content") ||
                      $('meta[name="twitter:description"]').attr("content") || "";

    let thumbnail = $('meta[property="og:image"]').attr("content") ||
                    $('meta[name="twitter:image"]').attr("content") || "";

    title = title.replace(" - YouTube", "").trim();

    const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=))([\w\-]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    if (!thumbnail && videoId) {
      thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    }

    let transcript = "";
    let summary = "";
    let playerResponse = null;

    try {
      const playerResponseRegex = /(?:var\s+|window\[['"]|window\.)ytInitialPlayerResponse\s*=\s*({.+?});/s;
      const playerMatch = html.match(playerResponseRegex);

      if (playerMatch) {
        playerResponse = JSON.parse(playerMatch[1]);
      } else {
          const altRegex = /"playerResponse":\s*({.+?})\s*,\s*"playbackTracking"/s;
          const altMatch = html.match(altRegex);
          if (altMatch) {
              playerResponse = JSON.parse(altMatch[1]);
          }
      }

      if (playerResponse) {
        if (playerResponse.videoDetails?.title) {
          title = playerResponse.videoDetails.title;
        }

        const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (captionTracks && captionTracks.length > 0) {
          const track = captionTracks.find((t: any) => t.languageCode === 'ko') ||
                        captionTracks.find((t: any) => t.languageCode?.startsWith('ko')) ||
                        captionTracks.find((t: any) => t.languageCode === 'en') ||
                        captionTracks[0];

          if (track?.baseUrl) {
            const transcriptHeaders = {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Referer": url,
              "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            };

            const jsonRes = await fetch(track.baseUrl + "&fmt=json3", { headers: transcriptHeaders });
            if (jsonRes.ok) {
              const capData = await jsonRes.json();
              if (capData.events) {
                  transcript = capData.events
                      .filter((ev: any) => ev.segs)
                      .map((ev: any) => ev.segs.map((s: any) => s.utf8).join(''))
                      .join(' ')
                      .replace(/\s+/g, ' ')
                      .trim();
              }
            }

            if (!transcript) {
              const xmlRes = await fetch(track.baseUrl, { headers: transcriptHeaders });
              if (xmlRes.ok) {
                const xmlText = await xmlRes.text();
                const $xml = cheerio.load(xmlText, { xmlMode: true });
                transcript = $xml('text').map((i, el) => $xml(el).text()).get().join(' ')
                              .replace(/\s+/g, ' ')
                              .trim();
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Manual transcript scraping failed:", e);
    }

    if (apiKey && !skipAi) {
        const geminiModel = requestedModel || "gemini-1.5-flash";
        const promptText = requestedPrompt || "이 영상을 분석해 주세요.";
        const fullPrompt = `${promptText}\n\n[영상 제목]\n${title}\n\n[영상 설명]\n${ogDescription}`;

        if (geminiModel === "gemini-3.5-flash") {
            // Normalize URL to standard watch?v= format for Gemini API
            let videoUri = url;
            const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=))([\w\-]{11})/);
            if (videoIdMatch) {
                videoUri = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;
            }

            summary = await callGeminiInteractionsAPI(apiKey, geminiModel, [
                {
                    type: "text",
                    text: promptText || "이 영상을 분석해 주세요."
                },
                {
                    type: "video",
                    uri: videoUri
                }
            ]);
        } else {
            const model = genAI.getGenerativeModel({ model: geminiModel });
            const parts = [
                { text: fullPrompt }
            ];
            const result = await model.generateContent(parts);
            summary = result.response.text();
        }
    } else {
      summary = "### 설정 오류\n\nGEMINI_API_KEY가 설정되지 않았습니다. AI 요약을 사용하려면 API 키를 등록해 주세요.";
    }

    let duration = "";
    const lengthSeconds = playerResponse?.videoDetails?.lengthSeconds ||
                          html.match(/"lengthSeconds":"(\d+)"/)?.[1];

    if (lengthSeconds) {
        const seconds = parseInt(lengthSeconds);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        duration = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    let publishDate = playerResponse?.microformat?.playerMicroformatRenderer?.publishDate ||
                      playerResponse?.microformat?.playerMicroformatRenderer?.uploadDate ||
                      html.match(/itemprop="datePublished" content="(.*?)"/)?.[1] ||
                      html.match(/itemprop="uploadDate" content="(.*?)"/)?.[1] || "";

    if (publishDate) {
        publishDate = publishDate.split('T')[0];
    }

    return {
      title: he.decode(title),
      summary: he.decode(summary || transcript || ""),
      description: he.decode(playerResponse?.videoDetails?.shortDescription || ogDescription || ""),
      thumbnail,
      duration,
      publishDate,
      transcript,
    };
}

export async function extractBlogSummary(blogContent: string, apiKey: string, modelName?: string, promptText?: string) {
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = modelName || "gemini-1.5-flash";
    const userPrompt = promptText || "이 블로그 내용을 핵심 위주로 요약하고 분석해 주세요.";

    // Clean HTML tags to plain text for prompt processing
    const $ = cheerio.load(blogContent || "");
    const cleanText = $.text().trim() || blogContent;

    const fullPrompt = `${userPrompt}\n\n[블로그 글 내용]\n${cleanText.slice(0, 30000)}`;

    const model = genAI.getGenerativeModel({ model: geminiModel });
    const result = await model.generateContent([{ text: fullPrompt }]);
    return result.response.text();
}
