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

function transformInvidiousVideos(videos = [], instanceDomain) {
  return videos.map(video => {
    const thumbnail = video.videoThumbnails?.find(t => t.quality === 'medium') || video.videoThumbnails?.[0];

    return {
      videoId: video.videoId,
      title: video.title,
      channelTitle: video.author,
      channelId: video.authorId,
      description: '', 
      thumbnailUrl: thumbnail?.url ? `https://${instanceDomain}${thumbnail.url}` : '',
      videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      channelHandle: null 
    };
  });
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method Not Allowed' });

  const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
  const playlistUrl = searchParams.get('playlistUrl');
  let invidiousInstance = searchParams.get('invidiousInstance');

  if (!playlistUrl) {
    return response.status(400).json({ error: "Missing 'playlistUrl' query parameter." });
  }
  if (!invidiousInstance) {
    return response.status(400).json({ error: "Missing 'invidiousInstance' query parameter." });
  }

  try {
    const url = new URL(invidiousInstance.startsWith('http') ? invidiousInstance : `https://invidiousInstance`);
    invidiousInstance = url.hostname;
  } catch (e) {
    return response.status(400).json({ error: "Invalid Invidious instance URL." });
  }

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return response.status(400).json({ error: "Invalid YouTube playlist URL." });
  }

  let allItems = [];
  let currentPage = 1;
  let continueFetching = true;

  try {
    while (continueFetching) {
      const apiUrl = `https://${invidiousInstance}/api/v1/playlists/${encodeURIComponent(playlistId)}?page=${currentPage}`;

      const invidiousResponse = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (!invidiousResponse.ok) {
        if (currentPage === 1) {
            throw new Error(`Invidious instance returned ${invidiousResponse.status}. It might be down or the playlist is private.`);
        } else {
            continueFetching = false;
            break;
        }
      }

      const data = await invidiousResponse.json();
      
      if (data && Array.isArray(data.videos) && data.videos.length > 0) {
        const transformedVideos = transformInvidiousVideos(data.videos, invidiousInstance);
        allItems.push(...transformedVideos);
        currentPage++;
      } else {
        continueFetching = false;
      }
    }

    return response.status(200).json({
      items: allItems,
      nextPageToken: null, 
      totalResults: allItems.length
    });

  } catch (error) {
    console.error("Handler Error:", error);
    return response.status(500).json({ error: `An error occurred. ${error.message}` });
  }
}