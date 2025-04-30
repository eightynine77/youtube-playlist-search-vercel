const API_KEY = process.env.YOUTUBE_API_KEY;

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

async function fetchVideosWithPagination(playlistId, searchTerm = '', pageToken = '', fetchAll = false) {
  let items = [];
  let nextToken = pageToken;
  let lastReceivedToken = null;

  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50&pageToken=${nextToken}&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      console.error("YouTube API Error:", data.error);
      throw new Error(`YouTube API Error: ${data.error.message}`);
    }

    if (Array.isArray(data.items)) {
      const filtered = searchTerm
        ? data.items.filter(item =>
            item.snippet?.title?.toLowerCase().includes(searchTerm)
          )
        : data.items;

      items = items.concat(filtered);
    }

    lastReceivedToken = nextToken;
    nextToken = data.nextPageToken;

    if (!fetchAll) break;
  } while (nextToken);

  return {
    items: items
      .map(item => ({
        videoId: item.snippet?.resourceId?.videoId,
        title: item.snippet?.title,
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
        videoUrl: item.snippet?.resourceId?.videoId
          ? `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
          : null
      }))
      .filter(item => item.videoId && item.title),
    nextPageToken: fetchAll ? null : nextToken || null
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const playlistUrl = searchParams.get('playlistUrl');
  const searchTerm = searchParams.get('searchTerm')?.toLowerCase() || '';
  const pageToken = searchParams.get('pageToken') || '';
  const fetchAll = searchParams.get('fetchAll') === 'true';

  if (!playlistUrl) return res.status(400).json({ error: "Missing 'playlistUrl' query parameter." });

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return res.status(400).json({
      error: "Invalid playlist URL. Make sure it includes a valid 'list=' parameter."
    });
  }

  try {
    const result = await fetchVideosWithPagination(playlistId, searchTerm, pageToken, fetchAll);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Handler Error:", err);
    return res.status(500).json({
      error: `An error occurred while fetching playlist videos. ${err.message}`
    });
  }
}
