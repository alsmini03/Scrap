const cheerio = require("cheerio");

async function testImageFix() {
  const postUrl = "https://www.postype.com/@juiknam/post/10924972";
  const res = await fetch(postUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
  });
  const html = await res.text();

  let content = "";
  let startIdx = html.indexOf('id="post-content"');
  if (startIdx !== -1) {
    let endIdx = html.indexOf('<section class="pay pay-support"', startIdx);
    if (endIdx === -1) endIdx = html.indexOf('</article>', startIdx);
    if (endIdx !== -1) {
      const rawContent = html.slice(startIdx + 'id="post-content">'.length, endIdx);
      const $postContent = cheerio.load(rawContent, null, false);
      $postContent("script, style, iframe").remove();
      content = $postContent.html() || "";
    }
  }

  const $clean = cheerio.load(content, null, false);

  // Remove profile/support images
  $clean(".profile-img, .avatar, .pay-support").remove();

  // Clean elements
  $clean("*").removeAttr("id").removeAttr("class");

  // Fix all images
  $clean("img").each((_, el) => {
    const $img = $clean(el);
    let src = $img.attr("src") || $img.attr("data-src") || $img.attr("data-lazy-src");
    if (src) {
      if (src.startsWith("//")) src = "https:" + src;
      $img.attr("src", src);
      $img.attr("referrerpolicy", "no-referrer");
      $img.attr("style", "max-width:100%; height:auto; border-radius:12px; margin: 12px 0; display:block;");
    }
  });

  console.log("Formatted Img count:", $clean("img").length);
  $clean("img").slice(0, 3).each((i, img) => {
    console.log(`Formatted Img ${i}:`, $clean(img).prop("outerHTML"));
  });
}
testImageFix();
