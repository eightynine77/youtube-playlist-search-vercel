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

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method Not Allowed' });

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

  if (!API_KEY) {
    return response.status(500).json({ error: "YouTube API key is not configured." });
  }

  const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50&pageToken=${pageToken}&key=${API_KEY}`;

  try {
    const ytResponse = await fetch(apiUrl);
    const data = await ytResponse.json();

    if (data.error) {
      throw new Error(`YouTube API Error: ${data.error.message} (Code: ${data.error.code})`);
    }

    const items = (data.items || []).map(item => ({
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

    return response.status(200).json({
      items,
      nextPageToken: data.nextPageToken || null
    });

  } catch (error) {
    console.error("Handler Error:", error);
    return response.status(500).json({ error: `An error occurred while fetching playlist videos. ${error.message}` });
  }
}