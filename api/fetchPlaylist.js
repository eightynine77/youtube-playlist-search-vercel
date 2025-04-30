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

async function fetchVideosPage(playlistId, pageToken = '') {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(
    playlistId
  )}&maxResults=50&pageToken=${pageToken}&key=${API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    console.error("YouTube API Error:", data.error);
    throw new Error(`YouTube API Error: ${data.error.message}`);
  }

  return {
    items: data.items || [],
    nextPageToken: data.nextPageToken || null
  };
}

async function fetchAllVideos(playlistId) {
  let allItems = [];
  let nextPageToken = '';

  do {
    const { items, nextPageToken: newToken } = await fetchVideosPage(playlistId, nextPageToken);
    allItems = allItems.concat(items);
    nextPageToken = newToken;
  } while (nextPageToken);

  return allItems;
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
  const showAll = searchParams.get('showAll') === 'true';

  if (!playlistUrl) {
    return res.status(400).json({ error: "Missing 'playlistUrl' query parameter." });
  }

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return res.status(400).json({ error: "Invalid playlist URL. Must contain a valid 'list=' parameter." });
  }

  try {
    let items = [];

    if (showAll) {
      // Fetch all items if showAll=true
      items = await fetchAllVideos(playlistId);
    } else {
      // Otherwise fetch just one page
      const result = await fetchVideosPage(playlistId, pageToken);
      items = result.items;

      const filtered = (searchTerm
        ? items.filter(item => item.snippet?.title?.toLowerCase().includes(searchTerm))
        : items
      ).map(item => ({
        videoId: item.snippet?.resourceId?.videoId,
        title: item.snippet?.title,
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
        videoUrl: item.snippet?.resourceId?.videoId
          ? `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
          : null
      })).filter(item => item.videoId && item.title);

      return res.status(200).json({
        items: filtered,
        nextPageToken: result.nextPageToken || null
      });
    }

    // "Show All" path continues here
    const filteredAll = (searchTerm
      ? items.filter(item => item.snippet?.title?.toLowerCase().includes(searchTerm))
      : items
    ).map(item => ({
      videoId: item.snippet?.resourceId?.videoId,
      title: item.snippet?.title,
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
      videoUrl: item.snippet?.resourceId?.videoId
        ? `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
        : null
    })).filter(item => item.videoId && item.title);

    res.status(200).json({
      items: filteredAll,
      nextPageToken: null // No pagination for showAll
    });

  } catch (error) {
    console.error("Handler Error:", error);
    res.status(500).json({ error: `An error occurred while fetching playlist videos. ${error.message}` });
  }
}
