// Load all your API keys from environment variables into an array.
// The .filter(Boolean) will remove any keys that are not set.
const apiKeys = [
  process.env.YOUTUBE_API_KEY,
  process.env.YOUTUBE_API_KEY2,
  process.env.YOUTUBE_API_KEY3,
  process.env.YOUTUBE_API_KEY4,
  process.env.YOUTUBE_API_KEY5,
].filter(Boolean);

// This index will track which key to use next. It's kept outside the handler
// to persist between function invocations on the same Vercel instance.
let keyIndex = 0;

function extractPlaylistId(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes('youtube.com')) return null;
    return parsedUrl.searchParams.get("list");
  } catch (e) {
    console.error("Error parsing URL:", e);
    return null;
  }
}

async function fetchChannelHandlesForIds(channelIds = [], apiKey) {
  const map = {}; 
  if (!channelIds || channelIds.length === 0) return map;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < channelIds.length; i += CHUNK_SIZE) {
    const chunk = channelIds.slice(i, i + CHUNK_SIZE);
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(chunk.join(','))}&key=${apiKey}`;

    try {
      const resp = await fetch(url);
      const data = await resp.json();
      if (data && Array.isArray(data.items)) {
        data.items.forEach(ch => {
          const id = ch.id;
          const custom = ch.snippet?.customUrl || null;
          if (custom) {
            map[id] = custom.startsWith('@') ? custom : `@${custom}`;
          } else {
            map[id] = null;
          }
        });
      }
    } catch (e) {
      console.error("Error fetching channel info:", e);
    }
  }

  return map;
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method Not Allowed' });

  // Check if any API keys are configured.
  if (apiKeys.length === 0) {
    return response.status(500).json({ error: "No YouTube API keys are configured on the server." });
  }

  // --- Key Rotation Logic ---
  // Select the next key in the array.
  const API_KEY = apiKeys[keyIndex];
  // Move the index to the next key for the subsequent request.
  // The modulo operator (%) ensures the index wraps around to 0 when it reaches the end.
  keyIndex = (keyIndex + 1) % apiKeys.length;
  // --- End of Key Rotation Logic ---
  
  const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
  const playlistUrl = searchParams.get('playlistUrl');
  const pageToken = searchParams.get('pageToken') || '';

  if (!playlistUrl) {
    return response.status(400).json({ error: "Missing 'playlistUrl' query parameter." });
  }

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return response.status(400).json({ error: "Invalid YouTube playlist URL. Make sure it's a valid YouTube URL with a 'list=' parameter." });
  }

  const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50&pageToken=${pageToken}&key=${API_KEY}`;

  try {
    const ytResponse = await fetch(apiUrl);
    const data = await ytResponse.json();

    if (data.error) {
      throw new Error(`YouTube API Error: ${data.error.message} (Code: ${data.error.code})`);
    }

    const itemsRaw = (data.items || []).map(item => ({
      videoId: item.snippet?.resourceId?.videoId,
      title: item.snippet?.title,
      channelTitle: item.snippet?.videoOwnerChannelTitle,
      channelId: item.snippet?.videoOwnerChannelId,
      description: item.snippet?.description || '',
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
      videoUrl: item.snippet?.resourceId?.videoId
        ? `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
        : null
    })).filter(item => item.videoId && item.title);

    const channelIds = [...new Set(itemsRaw.map(i => i.channelId).filter(Boolean))];

    // Pass the selected API_KEY to the channel fetcher as well.
    const channelHandleMap = await fetchChannelHandlesForIds(channelIds, API_KEY);

    const items = itemsRaw.map(it => ({
      ...it,
      channelHandle: it.channelId ? (channelHandleMap[it.channelId] || null) : null
    }));

    return response.status(200).json({
      items,
      nextPageToken: data.nextPageToken || null
    });

  } catch (error) {
    console.error("Handler Error:", error);
    return response.status(500).json({ error: `An error occurred while fetching playlist videos. ${error.message}` });
  }
}