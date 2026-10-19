import * as cheerio from 'cheerio';
import he from 'he';

export async function getBlogPosts(idOrUrl: string, limit = 0, page = 1) {
    let blogId = idOrUrl;
    let categoryNo = "";
    let isTistory = idOrUrl.includes("tistory.com");
    let isBrunch = idOrUrl.includes("brunch.co.kr");
    let isPostype = idOrUrl.includes("postype.com");

    if (idOrUrl.startsWith('http')) {
        try {
            const parsedUrl = new URL(idOrUrl);
            if (isTistory) {
                blogId = parsedUrl.hostname.split('.')[0];
            } else if (isBrunch) {
                blogId = parsedUrl.pathname.split('/')[1]; // @socandy
            } else if (isPostype) {
                const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
                blogId = pathParts[0] || idOrUrl; // e.g., @juiknam
            } else {
                blogId = parsedUrl.searchParams.get('blogId') || parsedUrl.pathname.split('/')[1] || idOrUrl;
                categoryNo = parsedUrl.searchParams.get('categoryNo') || "";
            }
        } catch {
            blogId = idOrUrl;
        }
    }

    let allPosts: any[] = [];

    // Naver Blog pagination via PostTitleListAsync
    if (!isTistory && !isBrunch && !isPostype) {
        try {
            const asyncUrl = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${blogId}&currentPage=${page}&countPerPage=20${categoryNo ? `&categoryNo=${categoryNo}` : ''}`;
            const asyncRes = await fetch(asyncUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
            if (asyncRes.ok) {
                const text = await asyncRes.text();
                const cleanJson = text.replace(/\\'/g, "'");
                const data = JSON.parse(cleanJson);
                const postList = data.postList || [];
                if (postList.length > 0) {
                    const blogTitle = data.blog?.blogId || blogId;
                    postList.forEach((item: any) => {
                        let decodedTitle = item.titleWithOutEmoji || item.title || "";
                        try {
                            decodedTitle = decodeURIComponent(decodedTitle.replace(/\+/g, ' '));
                        } catch(e) {}
                        allPosts.push({
                            title: he.decode(decodedTitle),
                            author: blogTitle,
                            url: `https://m.blog.naver.com/${item.blogId || blogId}/${item.logNo}`,
                            thumbnail: item.thumbnailUrl || null,
                            published_at: item.addDate,
                            blogId: item.blogId || blogId
                        });
                    });
                    return allPosts;
                }
            }
        } catch (e) {
            console.error(`PostTitleListAsync failed for ${blogId}`, e);
        }
    }

    // RSS approach (for Page 1 or fallback)
    if (page === 1) {
        if ((isTistory && idOrUrl.includes('/category/')) || isPostype) {
            // Skip to scraping for Postype or Tistory Category
        } else {
            let rssUrl = isTistory ? `https://${blogId}.tistory.com/rss` : `https://rss.blog.naver.com/${blogId}.xml`;
            if (!isTistory && categoryNo) {
                rssUrl += `?categoryNo=${categoryNo}`;
            }

            try {
                const response = await fetch(rssUrl, { next: { revalidate: 3600 } });
                if (response.ok) {
                    const xml = await response.text();
                    const $ = cheerio.load(xml, { xmlMode: true });
                    const channelTitle = $("channel > title").first().text().trim();

                    const items = $("item").toArray();
                    const itemsToProcess = limit > 0 ? items.slice(0, limit) : items;

                    itemsToProcess.forEach((el) => {
                        const title = he.decode($(el).find("title").text().trim());
                        let link = $(el).find("link").text().trim();
                        const description = $(el).find("description").text();
                        const pubDate = $(el).find("pubDate").text();

                        const imgMatch = description.match(/<img[^>]+src="([^">]+)"/);
                        const thumbnail = imgMatch ? imgMatch[1] : null;

                        if (!isTistory && link.includes("blog.naver.com/")) {
                            const parts = link.split('/');
                            const lastPart = parts[parts.length - 1];
                            const logNo = lastPart.split('?')[0];
                            if (!isNaN(Number(logNo))) {
                                link = `https://m.blog.naver.com/${blogId}/${logNo}`;
                            }
                        } else if (isTistory && !link.includes('/m/')) {
                            const url = new URL(link);
                            link = `${url.origin}/m${url.pathname}`;
                        }

                        if (title && link) {
                            allPosts.push({
                                title,
                                author: channelTitle,
                                url: link,
                                thumbnail,
                                published_at: pubDate,
                                blogId
                            });
                        }
                    });

                    if (allPosts.length > 0) return allPosts;
                }
            } catch (e) {
                console.error(`RSS failed for ${blogId}`, e);
            }
        }
    }

    // Fallback to scraping
    let fetchUrl = idOrUrl;
    if (isTistory && fetchUrl.includes('/m/category/')) {
        fetchUrl = fetchUrl.replace('/m/category/', '/category/');
    }

    if (!idOrUrl.startsWith('http')) {
        if (isPostype || idOrUrl.startsWith('@')) {
            const cleanId = idOrUrl.startsWith('@') ? idOrUrl : `@${idOrUrl}`;
            fetchUrl = `https://www.postype.com/${cleanId}?page=${page}`;
        } else if (isTistory) {
            fetchUrl = `https://${blogId}.tistory.com/?page=${page}`;
        } else {
            fetchUrl = `https://m.blog.naver.com/PostList.naver?blogId=${idOrUrl}`;
        }
    } else if (isPostype && !fetchUrl.includes('page=')) {
        fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `page=${page}`;
    } else if (isTistory && !fetchUrl.includes('page=')) {
        fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `page=${page}`;
    }
    try {
        const response = await fetch(fetchUrl, {
            headers: {
                "User-Agent": isBrunch ? "facebookexternalhit/1.1" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        });

        if (response.ok) {
            const html = await response.text();
            const $ = cheerio.load(html);

            if (isPostype) {
                const channelTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
                let channelTitle = channelTitleMatch ? channelTitleMatch[1].replace(/:\s*포스타입.*$/, "").replace(/\s*:\s*.*$/, "").trim() : blogId;

                // Extract post relative paths from standard HTML links or Next.js state
                let relativePaths = Array.from(new Set(html.match(/\/@[a-zA-Z0-9_\-]+\/post\/\d+/g) || []));

                // Fallback: match postId pattern from __next_f script state if standard links are missing
                if (relativePaths.length === 0) {
                    const cleanHandle = blogId.startsWith('@') ? blogId : `@${blogId}`;
                    const nextFMatches = Array.from(new Set(html.match(/\\"postId\\":\s*(\d+)/g) || html.match(/"postId":\s*(\d+)/g) || []));
                    relativePaths = nextFMatches.map(m => {
                        const num = m.match(/\d+/)?.[0];
                        return num ? `/${cleanHandle.replace('@', '')}/post/${num}` : null;
                    }).filter(Boolean) as string[];
                    relativePaths = Array.from(new Set(relativePaths));
                }

                // If page > 1 returns the same initial posts or no new posts, return empty list to end infinite scroll cleanly
                if (page > 1) {
                    // Fetch page 1 posts to compare
                    const cleanHandle = blogId.startsWith('@') ? blogId : `@${blogId}`;
                    const page1Url = `https://www.postype.com/${cleanHandle}`;
                    try {
                        const p1Res = await fetch(page1Url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
                        if (p1Res.ok) {
                            const p1Html = await p1Res.text();
                            const p1Paths = new Set(p1Html.match(/\/@[a-zA-Z0-9_\-]+\/post\/\d+/g) || []);
                            relativePaths = relativePaths.filter(p => !p1Paths.has(p));
                        }
                    } catch (e) {}

                    if (relativePaths.length === 0) {
                        return [];
                    }
                }

                const itemsToProcess = limit > 0 ? relativePaths.slice(0, limit) : relativePaths;

                const postPromises = itemsToProcess.map(async (pPath) => {
                    const fullUrl = `https://www.postype.com${pPath}`;
                    try {
                        const pRes = await fetch(fullUrl, {
                            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
                        });
                        if (!pRes.ok) return null;
                        const pHtml = await pRes.text();

                        let title = pHtml.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || "";
                        title = title.replace(/:\s*포스타입.*$/, "").replace(/\s*:\s*.*$/, "").trim();

                        const author = pHtml.match(/<meta property="og:site_name" content="([^"]+)"/)?.[1] || channelTitle;
                        const date = pHtml.match(/"datePublished":"([^"]+)"/)?.[1] || pHtml.match(/<meta property="article:published_time" content="([^"]+)"/)?.[1] || "";
                        let thumbnail = pHtml.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || null;
                        if (thumbnail && thumbnail.includes("empty_thumbnail_seo.png")) thumbnail = null;

                        return {
                            title: he.decode(title || "Untitled Post"),
                            author: channelTitle || author,
                            url: fullUrl,
                            thumbnail,
                            published_at: date,
                            blogId
                        };
                    } catch (e) {
                        return null;
                    }
                });

                const fetchedPosts = await Promise.all(postPromises);
                allPosts = fetchedPosts.filter(Boolean);
                if (allPosts.length > 0) return allPosts;
            }

            if (isBrunch) {
                const rssUrl = $("link[type='application/rss+xml']").attr("href");
                if (rssUrl) {
                    const rssRes = await fetch(rssUrl, { next: { revalidate: 3600 } });
                    if (rssRes.ok) {
                        const xml = await rssRes.text();
                        const $rss = cheerio.load(xml, { xmlMode: true });
                        const channelTitle = $rss("channel > title").first().text().trim();
                        const items = $rss("item").toArray();
                        const itemsToProcess = limit > 0 ? items.slice(0, limit) : items;

                        itemsToProcess.forEach((el) => {
                            const title = he.decode($rss(el).find("title").text().trim());
                            const link = $rss(el).find("link").text().trim();
                            const pubDate = $rss(el).find("pubDate").text();
                            const description = $rss(el).find("description").text();
                            const imgMatch = description.match(/<img[^>]+src="([^">]+)"/);

                            allPosts.push({
                                title,
                                author: channelTitle,
                                url: link,
                                thumbnail: imgMatch ? imgMatch[1] : null,
                                published_at: pubDate,
                                blogId
                            });
                        });
                        if (allPosts.length > 0) return allPosts;
                    }
                }
            }

            if (isTistory) {
                // Scraping Tistory List Pages (Home, Category, Page 2, 3...)
                const blogTitle = $("meta[property='og:title']").attr("content") || $("title").text() || blogId;
                const seenUrls = new Set<string>();

                // Remove widgets, sidebars, headers, notices to avoid duplicate featured post links
                $(".col_aside, .box_aside, .another_category, .popular-posts, #sidebar, .sidebar, #header, header, #footer, footer, .notice-list").remove();

                const links = $("a").toArray();
                const itemsToProcess = limit > 0 ? links.slice(0, limit) : links;

                itemsToProcess.forEach((el) => {
                    const $el = $(el);
                    const href = $el.attr('href');
                    if (!href || href.includes('/notice/') || href.includes('/manage/') || href.includes('/category/')) return;

                    const lastPart = href.split('?')[0].split('#')[0].split('/').pop() || '';
                    const isNumericEntry = !isNaN(Number(lastPart)) && Number(lastPart) > 0;
                    const isEntryLink = href.includes('/entry/') || href.includes('/m/entry/') || isNumericEntry;

                    if (isEntryLink) {
                        let fullUrl = href;
                        if (!href.startsWith('http')) {
                            const cleanPath = href.startsWith('/') ? href : `/${href}`;
                            fullUrl = `https://${blogId}.tistory.com${cleanPath.includes('/m/') ? cleanPath : '/m' + cleanPath}`;
                        } else if (!href.includes('/m/')) {
                            try {
                                const urlObj = new URL(href);
                                fullUrl = `${urlObj.origin}/m${urlObj.pathname}`;
                            } catch(e) {}
                        }

                        if (!seenUrls.has(fullUrl)) {
                            seenUrls.add(fullUrl);
                            const title = $el.find(".tit_blog2, .tit_post, .title, strong, h3, h2, .title-post, .tit_katok").first().text().trim() ||
                                          $el.text().trim() ||
                                          $el.parent().find(".tit_blog2, .tit_post, .title, strong, h3, h2, .title-post, .tit_katok").first().text().trim();

                            const date = $el.find(".txt_date, .date, .time").first().text().trim() ||
                                         $el.parent().find(".txt_date, .date, .time").first().text().trim() ||
                                         new Date().toISOString();

                            let thumbnail = $el.find(".img_thumb, img").first().attr("src") || $el.parent().find(".img_thumb, img").first().attr("src");
                            if (!thumbnail) {
                                const style = $el.find(".img_thumb").attr("style") || $el.parent().find(".img_thumb").attr("style") || "";
                                const urlMatch = style.match(/url\(['"]?(.*?)['"]?\)/);
                                if (urlMatch) thumbnail = urlMatch[1];
                            }

                            if (title && title.length > 1 && !title.includes('목록부자회사원')) {
                                allPosts.push({
                                    title: he.decode(title),
                                    author: blogTitle,
                                    url: fullUrl,
                                    thumbnail: thumbnail ? (thumbnail.startsWith('//') ? 'https:' + thumbnail : thumbnail) : null,
                                    published_at: date,
                                    blogId: blogId
                                });
                            }
                        }
                    }
                });

                if (allPosts.length > 0) return allPosts;
            } else if (isBrunch) {
                if (page > 1) {
                    return [];
                }

                // Extract userId or profileId from Brunch page
                let userId = "";
                $("script").each((_, el) => {
                    const content = $(el).html() || "";
                    const match = content.match(/"userId":"([^"]+)"/) || content.match(/"userId":\[[01],"([^"]+)"\]/);
                    if (match) userId = match[1];
                });

                if (userId) {
                    const rssUrl = `https://brunch.co.kr/rss/@@${userId}`;
                    const rssRes = await fetch(rssUrl, { headers: { "User-Agent": "facebookexternalhit/1.1" } });
                    if (rssRes.ok) {
                        const xml = await rssRes.text();
                        const $rss = cheerio.load(xml, { xmlMode: true });
                        const channelTitle = $rss("channel > title").first().text().trim();
                        const items = $rss("item").toArray();
                        const itemsToProcess = limit > 0 ? items.slice(0, limit) : items;

                        itemsToProcess.forEach((el) => {
                            const title = he.decode($rss(el).find("title").text().trim());
                            const link = $rss(el).find("link").text().trim();
                            const pubDate = $rss(el).find("pubDate").text();
                            const description = $rss(el).find("description").text();
                            const imgMatch = description.match(/<img[^>]+src="([^">]+)"/);

                            allPosts.push({
                                title,
                                author: channelTitle,
                                url: link,
                                thumbnail: imgMatch ? imgMatch[1] : null,
                                published_at: pubDate,
                                blogId
                            });
                        });
                        if (allPosts.length > 0) return allPosts;
                    }
                }
            } else {
                const scripts = $("script").toArray();
                for (const script of scripts) {
                    const content = $(script).html() || "";
                    if (content.includes("__PRELOADED_STATE__")) {
                        const jsonStr = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1);
                        const state = JSON.parse(jsonStr);
                        let items = state.postList?.postList?.items || state.categoryPostList?.postList?.items || state.postList?.items || [];
                        if (limit > 0) items = items.slice(0, limit);

                        items.forEach((item: any) => {
                            allPosts.push({
                                title: he.decode(item.titleWithOutEmoji || item.title),
                                url: `https://m.blog.naver.com/${item.blogId || blogId}/${item.logNo}`,
                                thumbnail: item.thumbnailUrl,
                                published_at: item.addDate,
                                blogId: item.blogId || blogId
                            });
                        });
                        break;
                    }
                }
            }
        }
    } catch (e) {
        console.error(`Scraping failed for ${blogId}`, e);
    }

    return allPosts;
}
