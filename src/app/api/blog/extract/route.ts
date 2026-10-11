import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { getBlogPosts } from "@/lib/blog";
import he from "he";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let url = body.url;

    let isNaver = url.includes("blog.naver.com");
    const isTistory = url.includes("tistory.com");
    const isBrunch = url.includes("brunch.co.kr");
    const isPostype = url.includes("postype.com");

    if (isNaver && !url.includes("m.blog.naver.com")) {
        url = url.replace("blog.naver.com", "m.blog.naver.com");
    }

    if (!url || (!isNaver && !isTistory && !isBrunch && !isPostype)) {
      return NextResponse.json({ error: "Invalid Blog URL (Supports Naver, Tistory, Brunch, and Postype)" }, { status: 400 });
    }

    // Handle List URL: if user provides a list URL, get the latest post first
    if (isNaver && (url.includes("PostList.naver") || (url.split('/').length <= 4 && !url.includes('logNo')))) {
        const posts = await getBlogPosts(url);
        if (posts && posts.length > 0) {
            url = posts[0].url;
        }
    } else if (isTistory && (url.endsWith('/m') || url.endsWith('/m/'))) {
        const posts = await getBlogPosts(url);
        if (posts && posts.length > 0) {
            url = posts[0].url;
        }
    } else if (isBrunch && url.split('/').length <= 5 && url.includes('@') && !url.includes('/', url.indexOf('@') + 1)) {
        const posts = await getBlogPosts(url);
        if (posts && posts.length > 0) {
            url = posts[0].url;
        }
    } else if (isPostype && !url.includes('/post/')) {
        const posts = await getBlogPosts(url);
        if (posts && posts.length > 0) {
            url = posts[0].url;
        }
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": isBrunch ? "facebookexternalhit/1.1" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch blog post");
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let title = "";
    let content = "";
    let date = "";
    let author = "";
    let thumbnail = $("meta[property='og:image']").attr("content");

    if (isNaver) {
        title = he.decode($(".se-title-text, h2.title, .htitle, .tit_h3").first().text().trim() || $("meta[property='og:title']").attr("content") || "");
        title = title.replace(/\s*:\s*네이버\s*블로그$/, "");

        // Mobile Naver blog often has a different title structure
        if (!title) {
            title = he.decode($(".se_title h3, .tit_h3").text().trim());
        }

        const contentArea = $(".se-main-container, .post_ct, #post-view, .se_component_wrap, #postViewArea, .se_content");
        if (contentArea.length > 0) {
            // Priority 1: Smart Editor One (Newer)
            const seComponents = contentArea.find(".se-component, .se_component");
            if (seComponents.length > 0) {
                seComponents.each((_, el) => {
                    const $comp = $(el);
                    if ($comp.hasClass("se-text") || $comp.hasClass("se_textarea") || $comp.find('.se-text').length > 0) {
                        $comp.find(".se-text-paragraph, .se_textarea, .se-main-container .se-text p").each((_, p) => {
                            const $p = $(p);
                            const html = $p.html() || "";
                            const text = html.trim();

                            if (text) {
                                content += text + "<br><br>";
                            }
                        });
                        if (!content.endsWith("<br><br>")) content += "<br>";
                    } else if ($comp.hasClass("se-quotation") || $comp.hasClass("se_quotation") || $comp.find('.se-quotation-container').length > 0) {
                        const quoteHtml = $comp.find(".se-quotation-text, .se_quotation_text, .se-quotation-container").html();
                        if (quoteHtml) {
                            content += `<blockquote>${quoteHtml.trim()}</blockquote><br>`;
                        }
                    } else if ($comp.hasClass("se-image") || $comp.hasClass("se_image")) {
                    let imgSrc = $comp.find("img").attr("data-lazy-src") || $comp.find("img").attr("data-src") || $comp.find("img").attr("src");
                    const caption = $comp.find(".se-caption, .se_image_caption").text().trim();
                    if (imgSrc) {
                        // Naver Blog specific: Try to get original image instead of thumbnail
                        if (imgSrc.includes("mblogthumb-phinf.pstatic.net")) {
                            // Transformation to postfiles often fails or is restricted.
                            // Using type=w800 is safer and high enough quality.
                            const baseUrl = imgSrc.split('?')[0];
                            imgSrc = `${baseUrl}?type=w800`;
                        }
                        // Handle relative protocol
                        if (imgSrc.startsWith("//")) imgSrc = "https:" + imgSrc;
                        content += `<img src="${imgSrc}" style="max-width:100%; border-radius:12px; margin: 10px 0;"><br>`;
                        if (caption) content += `<p style="font-size: 0.8em; color: #666; text-align: center;">${caption}</p>`;
                        content += "<br>";
                    }
                } else if ($comp.hasClass("se-video") || $comp.hasClass("se_video")) {
                    const videoTitle = $comp.find(".se-video-title, .se_video_title").text().trim();
                    if (videoTitle) content += `<p><b>[Video: ${videoTitle}]</b></p><br>`;
                } else if ($comp.hasClass("se-oglink") || $comp.hasClass("se_oglink")) {
                    const linkTitle = $comp.find(".se-oglink-title, .se_oglink_title").text().trim();
                    const linkUrl = $comp.find("a").attr("href");
                    if (linkUrl) content += `<a href="${linkUrl}" target="_blank" style="color: #1978e5;">${linkTitle || 'Link'}</a><br><br>`;
                }
            });
        }
        }

        // Priority 2: Older Editors / Fallback
        if (!content.trim()) {
            const fallbackArea = $("#postViewArea, .post_ct, #post-view, .se_content");

            // Handle images in older posts
            fallbackArea.find('img').each((_, img) => {
                const src = $(img).attr('src');
                if (src && !src.includes('clear.gif')) {
                    $(img).replaceWith(`\n![image](${src})\n`);
                }
            });

            content = fallbackArea.html() || "";
            content = content.trim().replace(/\n{3,}/g, "\n\n");
        }

        date = $(".se_publishDate, .date, .se-publish-date, .publishDate").first().text().trim();
        author = $(".nick, .writer, .nick_area").first().text().trim();
    } else if (isTistory) {
        title = he.decode($(".tit_blogview, .title_post, .tit_section, .h-title, .post-title, h1, h2, .tit_h3").first().text().trim() || $("meta[property='og:title']").attr("content") || $("meta[name='title']").attr("content") || "");
        author = $(".txt_author, .writer, .nick, .nickname, .name, .user-info .name, .info_author .link_author").first().text().trim() || $("meta[name='by']").attr("content") || $("meta[property='og.article.author']").attr("content") || "";

        // Tistory content selectors
        const contentArea = $(".blogview_content, .article_view, .view_section, .post-content, .tt_article_useless_p_margin, .entry-content, #article-view").first();
        if (contentArea.length > 0) {
            // Clean up Tistory-specific metadata/ad containers before extraction
            contentArea.find(".another_category, .container_postbtn, .revenue_unit_wrap, .related_posts, .list_related, .tt_adsense_bottom, script, ins, .og-link, .link_rel").remove();

            let stopExtraction = false;
            // Expanded selectors to include lists, figures (OG cards), and horizontal rules
            contentArea.find("p, div, img, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol, figure, hr").each((_, el) => {
                if (stopExtraction) return;

                const tag = el.tagName.toLowerCase();
                const $el = $(el);
                const text = $el.text().trim();

                // Check for recommendation list headers to stop extraction early
                if (tag.startsWith('h') || tag === 'p' || tag === 'div') {
                    if (text === '추천 글' || text === '함께 보면 좋은 글' || text.startsWith('카테고리의 다른 글') || text === '관련글') {
                        stopExtraction = true;
                        return;
                    }
                }

                if (tag === 'img') {
                    const src = $el.attr('src');
                    if (src) content += `<img src="${src}" style="max-width:100%; border-radius:12px; margin: 10px 0;"><br><br>`;
                } else if (tag === 'table' || tag === 'ul' || tag === 'ol' || tag === 'figure' || tag === 'hr') {
                    // Keep structured elements but clean them
                    $el.removeAttr('id').removeAttr('class').removeAttr('style');
                    if (tag === 'figure' && $el.attr('data-ke-type') === 'opengraph') {
                        // OG Cards handling
                        const link = $el.find('a').attr('href');
                        const ogTitle = $el.attr('data-og-title');
                        if (link) {
                            content += `<div style="padding: 15px; border: 1px solid #eee; border-radius: 12px; margin: 10px 0;"><a href="${link}" target="_blank" style="color: #1978e5; font-weight: bold; text-decoration: none;">${ogTitle || link}</a></div><br>`;
                            return;
                        }
                    }
                    content += $el.prop('outerHTML') + "<br><br>";
                } else {
                    // Only get text from leaf nodes or specific block elements to avoid duplication
                    const style = $el.attr('style') || '';
                    if (tag === 'div' && style.includes('background-image')) {
                        const bgMatch = style.match(/url\(['"]?([^'")]*)['"]?\)/);
                        if (bgMatch && bgMatch[1]) {
                            content += `<img src="${bgMatch[1]}" style="max-width:100%; border-radius:12px; margin: 10px 0;"><br><br>`;
                        }
                    }

                    // Tistory specific: editor containers sometimes have text.
                    // Using .children().length check can be brittle, checking for data-ke-size attribute
                    const isKeSize = $el.attr('data-ke-size') || $el.attr('data-ke-style');

                    if ($el.children().length === 0 || tag === 'p' || tag.startsWith('h') || tag === 'blockquote' || isKeSize) {
                        // Avoid adding text if we already added it via a parent list/table
                        if ($el.closest('table, ul, ol, figure').length > 0 && tag !== 'li') return;

                        const html = $el.html() || "";
                        if (html.trim()) {
                            if (tag.startsWith('h')) {
                                content += `<${tag}>${html.trim()}</${tag}><br>`;
                            } else if (tag === 'blockquote') {
                                content += `<blockquote>${html.trim()}</blockquote><br>`;
                            } else {
                                content += html.trim() + "<br><br>";
                            }
                        }
                    }
                }
            });
        }
        if (!content.trim()) content = $(".blogview_content, .article_view, .tt_article_useless_p_margin, .entry-content").first().html() || "";
        date = $("meta[property='article:published_time']").attr("content") || $(".txt_date, .date, .time").first().text().trim();
    } else if (isBrunch) {
        title = he.decode($(".tit_view").first().text().trim() || $("meta[property='og:title']").attr("content") || "");
        author = $(".txt_byline .link_author").first().text().trim() || $("meta[name='author']").attr("content") || "";

        const contentArea = $(".wrap_body");
        contentArea.find('*').removeAttr('id').removeAttr('class');
        if (contentArea.length > 0) {
            contentArea.find("p, img, h1, h2, h3, h4, h5, h6, blockquote").each((_, el) => {
                const tag = el.tagName.toLowerCase();
                if (tag === 'img') {
                    let src = $(el).attr("src");
                    if (src) {
                        if (src.startsWith("//")) src = "https:" + src;
                        content += `<img src="${src}" style="max-width:100%; border-radius:12px; margin: 10px 0;"><br><br>`;
                    }
                } else {
                    const html = $(el).html() || "";
                    if (html.trim()) {
                        if (tag.startsWith('h')) {
                            content += `<${tag}>${html.trim()}</${tag}><br>`;
                        } else if (tag === 'blockquote') {
                            content += `<blockquote>${html.trim()}</blockquote><br>`;
                        } else {
                            content += html.trim() + "<br><br>";
                        }
                    }
                }
            });
        }
        if (!content.trim()) content = $(".wrap_body").html() || "";
        date = $(".publish_date").text().trim() || $("meta[property='article:published_time']").attr("content") || "";
    } else if (isPostype) {
        let rawTitle = $("meta[property='og:title']").attr("content") || $("title").text() || "";
        title = he.decode(rawTitle.replace(/:\s*포스타입.*$/, "").replace(/\s*:\s*.*$/, "").trim());

        author = he.decode($("meta[property='og:site_name']").attr("content") || $("meta[name='author']").attr("content") || "").trim();

        // Extract published date from LD+JSON or meta tag
        const jsonLdText = $("script[type='application/ld+json']").html();
        if (jsonLdText) {
            try {
                const ldData = JSON.parse(jsonLdText);
                if (ldData.datePublished) date = ldData.datePublished;
            } catch (e) {}
        }
        if (!date) {
            date = $("meta[property='article:published_time']").attr("content") || "";
        }

        // Thumbnail extraction (ignore default placeholder)
        const ogImage = $("meta[property='og:image']").attr("content");
        if (ogImage && !ogImage.includes("empty_thumbnail_seo.png")) {
            thumbnail = ogImage;
        } else {
            thumbnail = undefined;
        }

        // Content extraction: Postype uses #post-content
        let startIdx = html.indexOf('id="post-content"');
        if (startIdx !== -1) {
            let endIdx = html.indexOf('<section class="pay pay-support"', startIdx);
            if (endIdx === -1) {
                endIdx = html.indexOf('</article>', startIdx);
            }
            if (endIdx !== -1) {
                const rawContent = html.slice(startIdx + 'id="post-content">'.length, endIdx);
                const $postContent = cheerio.load(rawContent, null, false);
                $postContent('script, style, iframe, .profile-img, .avatar, .pay-support').remove();

                // Clean and unwrap images for Postype to avoid layout-breaking wrappers
                $postContent('img').each((_, imgEl) => {
                    const $img = $postContent(imgEl);
                    let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
                    if (src) {
                        if (src.startsWith('//')) src = 'https:' + src;
                        const newImgHtml = `<img src="${src}" style="max-width:100%; height:auto; border-radius:12px; margin: 12px 0; display:block;" referrerpolicy="no-referrer" />`;
                        const $parentFigure = $img.closest('figure');
                        const $parentA = $img.closest('a');
                        if ($parentFigure.length > 0) {
                            $parentFigure.replaceWith(newImgHtml);
                        } else if ($parentA.length > 0) {
                            $parentA.replaceWith(newImgHtml);
                        } else {
                            $img.replaceWith(newImgHtml);
                        }
                    } else {
                        $img.remove();
                    }
                });

                content = $postContent.html() || "";
            } else {
                const $postContent = cheerio.load($("#post-content").html() || "", null, false);
                $postContent('.profile-img, .avatar, .pay-support').remove();
                content = $postContent.html() || "";
            }
        } else {
            const $postContent = cheerio.load($("#post-content, .post-content").html() || "", null, false);
            $postContent('.profile-img, .avatar, .pay-support').remove();
            content = $postContent.html() || "";
        }
    }

    // Requirement: Format date for title (YYYY-MM-DD)
    let formattedDateForTitle = date;
    if (date) {
      try {
        let cleanDate = date.trim();
        // Handle "2025. 3. 31. 23:25" format
        if (/^\d{4}\.\s?\d{1,2}\.\s?\d{1,2}/.test(cleanDate)) {
           cleanDate = cleanDate.replace(/\.\s?/g, '-').replace(/-$/, '');
        }

        const d = new Date(cleanDate);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = (d.getMonth() + 1).toString().padStart(2, '0');
          const day = d.getDate().toString().padStart(2, '0');
          formattedDateForTitle = `${year}-${month}-${day}`;

          // Requirement: Prepend original date (with time) to content
          const timeStr = d.toLocaleTimeString('ko-KR', { hour12: false });
          const fullDateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${timeStr}`;
          content = `<p style="font-size: 0.85em; color: #888; margin-bottom: 20px;">작성일: ${fullDateStr}</p>` + content;
        }
      } catch (e) {
        console.warn("Date formatting failed:", e);
      }
    }


    // Requirement: Remove id and class attributes from extracted content
    const cleanContent = (html: string) => {
        if (!html) return "";
        const $clean = cheerio.load(html, null, false);

        // Remove specific Tistory artifacts that might have leaked
        $clean('script, ins, .another_category, .container_postbtn, .revenue_unit_wrap, .related_posts, .list_related, .tt_adsense_bottom').remove();

        $clean('*').removeAttr('id').removeAttr('class');

        // Remove layout-breaking inline styles
        $clean('*').each((_, el) => {
            const style = $(el).attr('style');
            if (style) {
                // Keep safe styles like color and text-align, remove potentially breaking ones
                const safeStyles = style.split(';')
                    .map(s => s.trim())
                    .filter(s => {
                        const property = s.split(':')[0].toLowerCase().trim();
                        const forbidden = ['position', 'z-index', 'float', 'width', 'margin', 'left', 'right', 'top', 'bottom', 'display'];
                        return s && !forbidden.includes(property);
                    })
                    .join('; ');

                if (safeStyles) {
                    $(el).attr('style', safeStyles);
                } else {
                    $(el).removeAttr('style');
                }
            }
        });

        // Format and standardize images for display
        $clean('img').each((_, imgEl) => {
            const $img = $clean(imgEl);
            let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
            if (src) {
                if (src.startsWith('//')) src = 'https:' + src;
                $img.attr('src', src);
                $img.attr('referrerpolicy', 'no-referrer');
                $img.attr('style', 'max-width:100%; height:auto; border-radius:12px; margin: 12px 0; display:block;');
            }
        });

        return $clean.html() || "";
    };

    return NextResponse.json({
      title,
      author,
      content: cleanContent(content),
      thumbnail,
      published_at: formattedDateForTitle, // Title date (YYYY년 M월 D일)
      original_published_at: date, // Keep original for body if needed
      url
    });
  } catch (error: any) {
    console.error("Blog Extract Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
