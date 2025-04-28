const API_KEY = process.env.YOUTUBE_API_KEY;

function extractPlaylistId(url) {
  try {
    if (!url || typeof url !== 'string') {
      return null;
    }
      
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes('youtube.com')) {
      return null;
    }
      
    return parsedUrl.searchParams.get("list");
  } catch (e) {
    console.error("Error parsing URL:", e);
    return null; 
  }
}

async function fetchAllVideos(playlistId) {
  let allItems = [];
  let nextPageToken = '';

  if (!API_KEY) {
    throw new Error("YouTube API key is not configured.");
  }

  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50&pageToken=${nextPageToken}&key=${API_KEY}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        console.error("YouTube API Error:", data.error);
        throw new Error(`YouTube API Error: ${data.error.message} (Code: ${data.error.code})`);
      }

      if (data.items && Array.isArray(data.items)) {
          allItems = allItems.concat(data.items);
      }

      nextPageToken = data.nextPageToken || '';

    } catch (fetchError) {
        console.error("Error fetching playlist items:", fetchError);
        throw new Error(`Failed to fetch data from YouTube API. ${fetchError.message}`);
    }

  } while (nextPageToken); 

  return allItems;
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
  const playlistUrl = searchParams.get('playlistUrl');
  const searchTerm = searchParams.get('searchTerm')?.toLowerCase() || ''; 

  if (!playlistUrl) {
    return response.status(400).json({ error: "Missing 'playlistUrl' query parameter." });
  }

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return response.status(400).json({ error: "Invalid playlist URL. Make sure it's a valid YouTube URL with a 'list=' parameter." });
  }

  try {
    const allItems = await fetchAllVideos(playlistId);

    let filteredItems = searchTerm
      ? allItems.filter(item =>
          item.snippet?.title?.toLowerCase().includes(searchTerm)
        )
      : allItems;

    const results = filteredItems.map(item => ({
        videoId: item.snippet?.resourceId?.videoId,
        title: item.snippet?.title,
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
        videoUrl: item.snippet?.resourceId?.videoId
          ? `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
          : null 
    })).filter(item => item.videoId && item.title); 

    response.status(200).json(results);

  } catch (error) {
    console.error("Handler Error:", error);
    response.status(500).json({ error: `An error occurred while fetching playlist videos. ${error.message}` });
  }
}
