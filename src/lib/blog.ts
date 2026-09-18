import * as cheerio from 'cheerio';
import he from 'he';

export async function getBlogPosts(idOrUrl: string, limit = 0) {
    let blogId = idOrUrl;
    let categoryNo = "";
    let isTistory = idOrUrl.includes("tistory.com");
    let isBrunch = idOrUrl.includes("brunch.co.kr");

    if (idOrUrl.startsWith('http')) {
        try {
            const parsedUrl = new URL(idOrUrl);
            if (isTistory) {
                blogId = parsedUrl.hostname.split('.')[0];
            } else if (isBrunch) {
                blogId = parsedUrl.pathname.split('/')[1]; // @socandy
            } else {
                blogId = parsedUrl.searchParams.get('blogId') || parsedUrl.pathname.split('/')[1] || idOrUrl;
                categoryNo = parsedUrl.searchParams.get('categoryNo') || "";
            }
        } catch {
            blogId = idOrUrl;
        }
    }

    let allPosts: any[] = [];

    // RSS approach
    if (isTistory && idOrUrl.includes('/category/')) {
        // Tistory Category: skip to scraping
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
                    // Convert to mobile link
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

    // Fallback to scraping
    const fetchUrl = idOrUrl.startsWith('http') ? idOrUrl : `https://m.blog.naver.com/PostList.naver?blogId=${idOrUrl}`;
    try {
        const response = await fetch(fetchUrl, {
            headers: {
                "User-Agent": "facebookexternalhit/1.1", // Works better for most
            },
        });

        if (response.ok) {
            const html = await response.text();
            const $ = cheerio.load(html);

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

            if (isTistory && (fetchUrl.includes('/m/category/') || fetchUrl.includes('/category/'))) {
                // Scraping Tistory Category List
                const blogTitle = $("meta[property='og:title']").attr("content") || blogId;

                // Priority 1: application/ld+json (BreadcrumbList)
                const scripts = $("script[type='application/ld+json']").toArray();
                for (const script of scripts) {
                    const content = $(script).html() || "";
                    if (content.includes("BreadcrumbList")) {
                        try {
                            const data = JSON.parse(content);
                            const items = data.itemListElement || [];
                            const extracted = await Promise.all(items.map(async (item: any) => {
                                if (item.item && item.item["@id"] && (item.item["@id"].includes("/entry/") || item.item["@id"].includes("/m/entry/"))) {
                                    let fullUrl = item.item["@id"];
                                    if (!fullUrl.includes("/m/")) {
                                        const urlObj = new URL(fullUrl);
                                        fullUrl = `${urlObj.origin}/m${urlObj.pathname}`;
                                    }

                                    // Optimization: Real date fetch for list view
                                    let actualDate = new Date().toISOString();
                                    try {
                                        const res = await fetch(fullUrl, { headers: { "User-Agent": "facebookexternalhit/1.1" } });
                                        if (res.ok) {
                                            const postHtml = await res.text();
                                            const $post = cheerio.load(postHtml);
                                            actualDate = $post("meta[property='article:published_time']").attr("content") ||
                                                         $post(".txt_date, .date").first().text().trim() || actualDate;
                                        }
                                    } catch(e) {}

                                    return {
                                        title: he.decode(item.item.name),
                                        author: blogTitle,
                                        url: fullUrl,
                                        thumbnail: null,
                                        published_at: actualDate,
                                        blogId: blogId
                                    };
                                }
                                return null;
                            }));

                            const filtered = extracted.filter((i: any) => i !== null);
                            if (filtered.length > 0) return filtered;
                        } catch(e) {}
                    }
                }

                // Priority 2: CSS Selectors
                let listItems = $("ul.list_blog2 li, ul.list_post li, .list_content li, .article_content").toArray();
                if (limit > 0) listItems = listItems.slice(0, limit);

                listItems.forEach((el) => {
                    const $el = $(el);
                    const $link = $el.find("a").first();
                    const href = $link.attr('href');
                    if (!href) return;

                    const title = $el.find(".tit_blog2, .tit_post, .title, strong").first().text().trim();
                    const date = $el.find(".txt_date, .date, .time").first().text().trim() || new Date().toISOString();

                    // Thumbnail extraction
                    let thumbnail = $el.find(".img_thumb").attr("src") || $el.find("img").attr("src");
                    if (!thumbnail) {
                        const style = $el.find(".img_thumb").attr("style") || "";
                        const urlMatch = style.match(/url\(['"]?(.*?)['"]?\)/);
                        if (urlMatch) thumbnail = urlMatch[1];
                    }

                    if (href.includes('/entry/') || href.includes('/m/entry/') || !isNaN(Number(href.split('/').pop()))) {
                        let fullUrl = href;
                        if (!href.startsWith('http')) {
                            const cleanPath = href.startsWith('/') ? href : `/${href}`;
                            fullUrl = `https://${blogId}.tistory.com${cleanPath.includes('/m/') ? cleanPath : '/m' + cleanPath}`;
                        } else if (!href.includes('/m/')) {
                            const urlObj = new URL(href);
                            fullUrl = `${urlObj.origin}/m${urlObj.pathname}`;
                        }

                        allPosts.push({
                            title: he.decode(title || "Untitled Post"),
                            author: blogTitle,
                            url: fullUrl,
                            thumbnail: thumbnail ? (thumbnail.startsWith('//') ? 'https:' + thumbnail : thumbnail) : null,
                            published_at: date,
                            blogId: blogId
                        });
                    }
                });

                if (allPosts.length > 0) return allPosts;

                // Last ditch effort: any entry link
                const links = $("a").toArray();
                for (const el of links) {
                    const href = $(el).attr('href');
                    if (href && (href.includes('/entry/') || href.includes('/m/entry/'))) {
                        const title = $(el).text().trim();
                        if (title && title.length > 5) {
                            let fullUrl = href;
                            if (!href.startsWith('http')) {
                                fullUrl = `https://${blogId}.tistory.com${href.startsWith('/') ? '' : '/'}${href}`;
                            }
                            if (!fullUrl.includes('/m/')) {
                                const urlObj = new URL(fullUrl);
                                fullUrl = `${urlObj.origin}/m${urlObj.pathname}`;
                            }

                            // Avoid duplicates
                            if (!allPosts.find(p => p.url === fullUrl)) {
                                // Last resort: Fetch actual date for the post
                                let actualDate = new Date().toISOString();
                                try {
                                    const res = await fetch(fullUrl, { headers: { "User-Agent": "facebookexternalhit/1.1" } });
                                    if (res.ok) {
                                        const postHtml = await res.text();
                                        const $post = cheerio.load(postHtml);
                                        actualDate = $post("meta[property='article:published_time']").attr("content") ||
                                                     $post(".txt_date, .date").first().text().trim() || actualDate;
                                    }
                                } catch(e) {}

                                allPosts.push({
                                    title: he.decode(title),
                                    author: blogTitle,
                                    url: fullUrl,
                                    thumbnail: null,
                                    published_at: actualDate,
                                    blogId: blogId
                                });
                            }
                        }
                    }
                }
            } else if (isBrunch) {
                // Fallback for Brunch if RSS not found in meta
                let userId = "";
                $("script").each((_, el) => {
                    const content = $(el).html() || "";
                    const match = content.match(/"userId":\[[01],"([^"]+)"\]/);
                    if (match) userId = match[1];
                });

                if (userId) {
                    // Try to construct RSS from userId
                    const rssUrl = `https://brunch.co.kr/rss/@@${userId}`;
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
