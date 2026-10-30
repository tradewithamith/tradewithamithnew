// Cloudflare Pages Function: /api/youtube/channel-stats
// Automatically active when deployed to Cloudflare Pages from GitHub.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const rawChannel = (url.searchParams.get('channelId') || '').trim();
  const handleParam = (url.searchParams.get('handle') || '').trim();

  const channelMatch = rawChannel.match(/(UC[a-zA-Z0-9_-]{15,})/);
  const channelId = channelMatch ? channelMatch[1] : '';
  const handleMatch =
    handleParam.match(/@([a-zA-Z0-9_.-]+)/) || rawChannel.match(/@([a-zA-Z0-9_.-]+)/);
  const cleanHandle = handleMatch ? handleMatch[1] : 'tradewithamithYT';

  const jsonHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=120, s-maxage=120',
  };

  const apiKey = (env && env.YOUTUBE_API_KEY) || '';

  try {
    if (apiKey && channelId) {
      const apiRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(
          channelId
        )}&key=${encodeURIComponent(apiKey)}`
      );
      if (apiRes.ok) {
        const data = await apiRes.json();
        const rawCount =
          data &&
          data.items &&
          data.items[0] &&
          data.items[0].statistics &&
          data.items[0].statistics.subscriberCount;
        if (rawCount) {
          return new Response(
            JSON.stringify({
              subscriberCount: Number(rawCount).toLocaleString('en-US'),
              source: 'youtube_api',
            }),
            { status: 200, headers: jsonHeaders }
          );
        }
      }
    }

    const targets = [];
    if (channelId) {
      targets.push(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}`);
    }
    if (cleanHandle) {
      targets.push(`https://www.youtube.com/@${encodeURIComponent(cleanHandle)}`);
    }

    for (const targetUrl of targets) {
      const pubRes = await fetch(targetUrl, {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+999',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });

      if (pubRes.ok) {
        const html = await pubRes.text();
        const subMatch = html.match(/([0-9][0-9.,]*\s*[KMB]?)\s+subscribers/i);
        if (subMatch && subMatch[1]) {
          return new Response(
            JSON.stringify({
              subscriberCount: subMatch[1].replace(/\s+/g, ''),
              source: 'youtube_public',
            }),
            { status: 200, headers: jsonHeaders }
          );
        }
      }
    }

    return new Response(JSON.stringify({ subscriberCount: null, source: 'unavailable' }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch {
    return new Response(JSON.stringify({ subscriberCount: null, source: 'error' }), {
      status: 200,
      headers: jsonHeaders,
    });
  }
}
