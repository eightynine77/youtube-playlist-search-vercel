const API_KEYS = [
  process.env.YOUTUBE_API_KEY,
  process.env.YOUTUBE_API_KEY2,
  process.env.YOUTUBE_API_KEY3,
  process.env.YOUTUBE_API_KEY4,
  process.env.YOUTUBE_API_KEY5,
].filter(Boolean);

if (process.env.NODE_ENV === 'production' && API_KEYS.length === 0) {
  throw new Error('Missing YT_KEY_1..YT_KEY_5 environment variables. Set them in Vercel project settings.');
}

if (API_KEYS.length === 0) {
  console.warn('No YT_KEY_* env vars found - API calls will fail in development.');
}

async function fetchWithKeyRotation(buildUrlFn, preferredIndex = 0) {
  const total = API_KEYS.length;
  if (!total) throw new Error('No API keys configured.');

  const order = [];
  for (let i = 0; i < total; i++) order.push((preferredIndex + i) % total);

  let lastErr = null;
  for (const idx of order) {
    const key = API_KEYS[idx];
    try {
      const url = buildUrlFn(key);
      if (process.env.DEBUG_KEYS) {
        console.log(`Trying key[${idx}] (masked=${key?.slice(0,6)}...) for ${url}`);
      }
      const resp = await fetch(url);
      const json = await resp.json().catch(() => null);

      if (resp.ok && !(json && json.error)) return json;

      if (json && json.error) {
        const reasons = (json.error.errors || []).map(e => e.reason || e.message).join(', ');
        lastErr = new Error(`Key[${idx}] API error: ${json.error.message || reasons}`);
        const isQuota = reasons.includes('quotaExceeded') || reasons.includes('dailyLimitExceeded') || reasons.includes('userRateLimitExceeded') || resp.status === 403 || resp.status === 429;
        if (isQuota) continue; 
        throw lastErr;
      }

      lastErr = new Error(`Key[${idx}] HTTP ${resp.status}`);
      continue;
    } catch (err) {
      lastErr = err;
      continue;
    }
  }

  throw lastErr || new Error('All API keys failed.');
}

function extractPlaylistId(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    const parsed = new URL(url);
    if (!parsed.hostname.includes('youtube.com') && !parsed.hostname.includes('youtu.be')) return null;
    return parsed.searchParams.get('list');
  } catch (e) {
    return null;
  }
}

async function fetchNextTokenOnly(playlistId, pageToken = '', preferredKeyIndex = 0) {
  return await fetchWithKeyRotation((key) => {
    const base = 'https://www.googleapis.com/youtube/v3/playlistItems';
    const u = new URL(base);
    u.searchParams.set('part', 'id'); 
    u.searchParams.set('playlistId', playlistId);
    u.searchParams.set('maxResults', '50');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    u.searchParams.set('fields', 'nextPageToken');
    u.searchParams.set('key', key);
    return u.toString();
  }, preferredKeyIndex);
}

async function fetchFullPage(playlistId, pageToken = '', preferredKeyIndex = 0) {
  return await fetchWithKeyRotation((key) => {
    const base = 'https://www.googleapis.com/youtube/v3/playlistItems';
    const u = new URL(base);
    u.searchParams.set('part', 'snippet');
    u.searchParams.set('playlistId', playlistId);
    u.searchParams.set('maxResults', '50');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    u.searchParams.set('key', key);
    return u.toString();
  }, preferredKeyIndex);
}

async function fetchChannelsForIds(channelIds = [], preferredKeyIndex = 0) {
  if (!channelIds.length) return null;
  return await fetchWithKeyRotation((key) => {
    const base = 'https://www.googleapis.com/youtube/v3/channels';
    const u = new URL(base);
    u.searchParams.set('part', 'snippet');
    u.searchParams.set('id', channelIds.join(','));
    u.searchParams.set('key', key);
    return u.toString();
  }, preferredKeyIndex);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const playlistUrl = searchParams.get('playlistUrl');
  const maxPagesParam = parseInt(searchParams.get('maxPages') || '20', 10);
  const maxPages = Math.max(1, Math.min(50, isNaN(maxPagesParam) ? 20 : maxPagesParam));

  if (!playlistUrl) return res.status(400).json({ error: "Missing 'playlistUrl' param." });

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) return res.status(400).json({ error: "Invalid playlist URL." });

  try {
    const pageTokens = [''];
    let current = '';
    for (let i = 1; i < maxPages; i++) {
      const preferredIndex = (i - 1) % (API_KEYS.length || 1);
      const data = await fetchNextTokenOnly(playlistId, current, preferredIndex);
      if (!data || !data.nextPageToken) break;
      pageTokens.push(data.nextPageToken);
      current = data.nextPageToken;
    }

    const pagePromises = pageTokens.map((token, idx) =>
      fetchFullPage(playlistId, token, idx % (API_KEYS.length || 1))
        .catch(err => {
          console.error('Page fetch failed for token', token, err);
          return { items: [] };
        })
    );
    const pages = await Promise.all(pagePromises);

    const rawItems = [];
    for (const p of pages) {
      const items = p.items || [];
      for (const it of items) {
        const vid = it.snippet?.resourceId?.videoId;
        if (!vid) continue;
        rawItems.push({
          videoId: vid,
          title: it.snippet?.title || '',
          channelTitle: it.snippet?.videoOwnerChannelTitle || it.snippet?.channelTitle || '',
          channelId: it.snippet?.videoOwnerChannelId || it.snippet?.channelId || null,
          description: it.snippet?.description || '',
          thumbnailUrl: it.snippet?.thumbnails?.medium?.url || null,
          videoUrl: `https://www.youtube.com/watch?v=${vid}`
        });
      }
    }

    const uniqueChannels = [...new Set(rawItems.map(i => i.channelId).filter(Boolean))];
    const channelHandleMap = {};
    for (let i = 0; i < uniqueChannels.length; i += 50) {
      const batch = uniqueChannels.slice(i, i + 50);
      const preferred = (i / 50) % (API_KEYS.length || 1);
      const chResp = await fetchChannelsForIds(batch, preferred).catch(err => {
        console.error('channels.list failed for batch', batch, err);
        return null;
      });
      if (chResp && Array.isArray(chResp.items)) {
        chResp.items.forEach(c => {
          const id = c.id;
          const custom = c.snippet?.customUrl || null;
          channelHandleMap[id] = custom ? (custom.startsWith('@') ? custom : `@${custom}`) : null;
        });
      }
    }

    const items = rawItems.map(it => ({
      ...it,
      channelHandle: it.channelId ? (channelHandleMap[it.channelId] || null) : null
    }));

    return res.status(200).json({
      items,
      fetchedPages: pageTokens.length,
      requestedMaxPages: maxPages
    });
  } catch (err) {
    console.error('Error fetching playlist with key rotation:', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}