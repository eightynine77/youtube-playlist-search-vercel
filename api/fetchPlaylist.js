// fetchPlaylist.js
// Robust serverless handler with key rotation, concurrency limit, and non-JSON-safe parsing.
// Reads keys from explicit env slots: YT_KEY_1 .. YT_KEY_5 (add more if needed).

const API_KEYS = [
  process.env.YOUTUBE_API_KEY,
  process.env.YOUTUBE_API_KEY2,
  process.env.YOUTUBE_API_KEY3,
  process.env.YOUTUBE_API_KEY4,
  process.env.YOUTUBE_API_KEY5,
  // add more explicit slots here if you want
].filter(Boolean);

if (process.env.NODE_ENV === 'production' && API_KEYS.length === 0) {
  throw new Error('Missing YT_KEY_1..YT_KEY_5 environment variables. Set them in Vercel project settings.');
}
if (API_KEYS.length === 0) {
  console.warn('No YT_KEY_* env vars found — API calls will fail in development.');
}

/**
 * fetchWithKeyRotation(buildUrlFn, preferredIndex = 0)
 * - tries keys starting from preferredIndex, wraps around
 * - robustly reads response as text, tries JSON.parse, treats non-JSON as an error
 */
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
      const text = await resp.text().catch(() => null);
      let json = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch (parseErr) {
          // not JSON — log it and treat as API error
          const sample = text.length > 200 ? text.slice(0, 200) + '...' : text;
          const msg = `Key[${idx}] returned non-JSON body (status ${resp.status}): ${sample}`;
          lastErr = new Error(msg);
          // if HTTP indicates quota/rate-limit or the text contains quota-like words, try next key
          const textLower = (sample || '').toLowerCase();
          const isQuotaLike =
            resp.status === 403 || resp.status === 429 ||
            textLower.includes('quota') || textLower.includes('exceeded') ||
            textLower.includes('dailylimit') || textLower.includes('user ratelimit') ||
            textLower.includes('an error occurred');

          if (isQuotaLike) {
            // try next key
            continue;
          } else {
            // treat as fatal for this request
            throw lastErr;
          }
        }
      }

      // If response JSON exists and has an error object
      if (json && json.error) {
        const reasons = (json.error.errors || []).map(e => e.reason || e.message).join(', ');
        lastErr = new Error(`Key[${idx}] API error: ${json.error.message || reasons}`);
        const isQuota = reasons.includes('quotaExceeded') || reasons.includes('dailyLimitExceeded') || reasons.includes('userRateLimitExceeded') || resp.status === 403 || resp.status === 429;
        if (isQuota) {
          continue; // try other keys
        } else {
          throw lastErr;
        }
      }

      // If HTTP not ok but we have JSON without error, still treat as error but allow retry on quota-like
      if (!resp.ok) {
        lastErr = new Error(`Key[${idx}] HTTP ${resp.status} with body: ${text?.slice(0,200)}`);
        const isQuota = resp.status === 403 || resp.status === 429 || (text && text.toLowerCase().includes('quota'));
        if (isQuota) {
          continue;
        } else {
          throw lastErr;
        }
      }

      // success: return parsed JSON if available, else null (shouldn't happen for YouTube, but handle gracefully)
      return json ?? {};
    } catch (err) {
      // save and try next key
      lastErr = err;
      continue;
    }
  }

  throw lastErr || new Error('All API keys failed.');
}

/* --- Helpers --- */

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

/* lightweight token fetch (asks only for nextPageToken) */
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

/* --- Concurrency helper: chunked parallel processing --- */
async function fetchPagesWithConcurrency(playlistId, pageTokens, concurrency) {
  const results = [];
  for (let i = 0; i < pageTokens.length; i += concurrency) {
    const chunk = pageTokens.slice(i, i + concurrency);
    const promises = chunk.map((token, j) => {
      const globalIdx = i + j;
      const preferred = globalIdx % (API_KEYS.length || 1);
      return fetchFullPage(playlistId, token, preferred).catch(err => {
        console.error('Page fetch failed for token', token, err?.message || err);
        return { items: [] };
      });
    });
    const chunkResults = await Promise.all(promises);
    results.push(...chunkResults);
  }
  return results;
}

/* --- Handler --- */

export default async function handler(req, res) {
  // Always return JSON responses
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const playlistUrl = searchParams.get('playlistUrl');
    const maxPagesParam = parseInt(searchParams.get('maxPages') || '20', 10);
    const requestedMaxPages = Math.max(1, Math.min(50, isNaN(maxPagesParam) ? 20 : maxPagesParam));

    if (!playlistUrl) return res.status(400).json({ error: "Missing 'playlistUrl' param." });

    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) return res.status(400).json({ error: "Invalid playlist URL." });

    // 1) Sequential small prefetch for pageTokens (cheap)
    const pageTokens = [''];
    let current = '';
    for (let i = 1; i < requestedMaxPages; i++) {
      const preferredIndex = (i - 1) % (API_KEYS.length || 1);
      const tokenData = await fetchNextTokenOnly(playlistId, current, preferredIndex);
      if (!tokenData || !tokenData.nextPageToken) break;
      pageTokens.push(tokenData.nextPageToken);
      current = tokenData.nextPageToken;
    }

    // 2) Concurrently fetch pages with concurrency cap
    const MAX_CONCURRENCY = Math.min(20, Math.max(1, API_KEYS.length * 4)); // tuneable
    const pages = await fetchPagesWithConcurrency(playlistId, pageTokens, MAX_CONCURRENCY);

    // 3) Extract items
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

    // 4) Batch channel lookups (50 per batch)
    const uniqueChannels = [...new Set(rawItems.map(i => i.channelId).filter(Boolean))];
    const channelHandleMap = {};
    for (let i = 0; i < uniqueChannels.length; i += 50) {
      const batch = uniqueChannels.slice(i, i + 50);
      const preferred = Math.floor(i / 50) % (API_KEYS.length || 1);
      const chResp = await fetchChannelsForIds(batch, preferred).catch(err => {
        console.error('channels.list failed for batch', batch, err?.message || err);
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

    // 5) Attach handles and return
    const items = rawItems.map(it => ({
      ...it,
      channelHandle: it.channelId ? (channelHandleMap[it.channelId] || null) : null
    }));

    return res.status(200).json({
      items,
      fetchedPages: pageTokens.length,
      requestedMaxPages
    });

  } catch (err) {
    // Always return JSON (not HTML) — include safe error message
    console.error('Unhandled error in fetchPlaylist handler:', err?.message || err);
    return res.status(500).json({ error: (err && err.message) ? err.message : 'Unknown server error' });
  }
}