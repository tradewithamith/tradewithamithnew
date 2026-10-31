// Cloudflare Pages Function: /api/youtube/channel-stats
// Automatically active when deployed to Cloudflare Pages from GitHub.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const rawChannel = (url.searchParams.get('channelId') || '').trim();
  const handleParam = (url.searchParams.get('handle') || '').trim();

  const channelMatch = rawChannel.match(/(UC[a-zA-Z0-9_-]{15,})/);
  const channelId = channelMatch ? channelMatch[1] : 'UCKwo4dtX8sFrJcW5I5tZ0cw';
  const handleMatch =
    handleParam.match(/@([a-zA-Z0-9_.-]+)/) || rawChannel.match(/@([a-zA-Z0-9_.-]+)/);
  const cleanHandle = handleMatch ? handleMatch[1] : 'tradewithamithYT';

  const jsonHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=90, s-maxage=90',
  };

  const apiKey = (env && env.YOUTUBE_API_KEY) || '';

  try {
    // 1. Official YouTube Data API v3 (if YOUTUBE_API_KEY configured in Cloudflare Pages)
    if (apiKey && channelId) {
      try {
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
          if (rawCount !== undefined && rawCount !== null && /^\d+$/.test(String(rawCount))) {
            return new Response(
              JSON.stringify({
                subscriberCount: Number(rawCount).toLocaleString('en-US'),
                source: 'youtube_api',
              }),
              { status: 200, headers: jsonHeaders }
            );
          }
        }
      } catch {
        // Continue to next live source
      }
    }

    // 2. SocialCounts Live YouTube Subscriber API (exact integer count)
    if (channelId) {
      try {
        const scRes = await fetch(
          `https://api.socialcounts.org/youtube-live-subscriber-count/${encodeURIComponent(
            channelId
          )}`,
          { headers: { Accept: 'application/json' } }
        );
        if (scRes.ok) {
          const scJson = await scRes.json();
          const exact =
            (scJson &&
              scJson.counters &&
              scJson.counters.api &&
              scJson.counters.api.subscriberCount) ??
            (scJson &&
              scJson.counters &&
              scJson.counters.estimation &&
              scJson.counters.estimation.subscriberCount);
          if (typeof exact === 'number' && Number.isFinite(exact) && exact >= 0) {
            return new Response(
              JSON.stringify({
                subscriberCount: exact.toLocaleString('en-US'),
                source: 'socialcounts_live',
              }),
              { status: 200, headers: jsonHeaders }
            );
          }
        }
      } catch {
        // Continue to next live source
      }
    }

    // 3. Direct YouTube Channel HTML with consent cookie
    const targets = [];
    if (channelId) {
      targets.push(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}`);
    }
    if (cleanHandle) {
      targets.push(`https://www.youtube.com/@${encodeURIComponent(cleanHandle)}`);
    }

    for (const targetUrl of targets) {
      try {
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
      } catch {
        // Continue
      }
    }

    // 4. Jina Reader fallback
    if (cleanHandle) {
      try {
        const jinaRes = await fetch(
          `https://r.jina.ai/https://www.youtube.com/@${encodeURIComponent(cleanHandle)}`,
          { headers: { Accept: 'text/plain' } }
        );
        if (jinaRes.ok) {
          const text = await jinaRes.text();
          const subMatch = text.match(/([0-9][0-9.,]*\s*[KMB]?)\s+subscribers/i);
          if (subMatch && subMatch[1]) {
            return new Response(
              JSON.stringify({
                subscriberCount: subMatch[1].replace(/\s+/g, ''),
                source: 'jina_reader',
              }),
              { status: 200, headers: jsonHeaders }
            );
          }
        }
      } catch {
        // Ignore
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
