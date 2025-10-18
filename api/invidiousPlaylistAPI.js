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

function transformInvidiousVideos(videos = []) {
  return videos.map(video => {
    const thumbnail = video.videoThumbnails?.find(t => t.quality === 'medium') || video.videoThumbnails?.[0];

    return {
      videoId: video.videoId,
      title: video.title,
      channelTitle: video.author,
      channelId: video.authorId,
      description: '', // Description is not provided by this Invidious endpoint
      thumbnailUrl: thumbnail?.url ? `https://<INSTANCE_DOMAIN>${thumbnail.url}` : '', // Note: Invidious thumbnails are relative paths
      videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      channelHandle: null // Not provided by Invidious
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
  let invidiousInstance = searchParams.get('invidiousInstance'); // e.g., "yewtu.be"

  if (!playlistUrl) {
    return response.status(400).json({ error: "Missing 'playlistUrl' query parameter." });
  }
  if (!invidiousInstance) {
    return response.status(400).json({ error: "Missing 'invidiousInstance' query parameter." });
  }

  try {
    const url = new URL(invidiousInstance.startsWith('http') ? invidiousInstance : `https://${invidiousInstance}`);
    invidiousInstance = url.hostname;
  } catch (e) {
    return response.status(400).json({ error: "Invalid Invidious instance URL." });
  }

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return response.status(400).json({ error: "Invalid YouTube playlist URL." });
  }

  const apiUrl = `https://${invidiousInstance}/api/v1/playlists/${encodeURIComponent(playlistId)}`;

  try {
    const invidiousResponse = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' }
    });

    if (!invidiousResponse.ok) {
        throw new Error(`Invidious instance returned ${invidiousResponse.status}. It might be down or the playlist is private.`);
    }

    const data = await invidiousResponse.json();

    if (!data || !Array.isArray(data.videos)) {
      throw new Error('Invidious API returned an unexpected data format.');
    }

    let items = transformInvidiousVideos(data.videos);

    items = items.map(item => ({
        ...item,
        thumbnailUrl: item.thumbnailUrl.replace('<INSTANCE_DOMAIN>', invidiousInstance)
    }));
    
    return response.status(200).json({
      items,
      nextPageToken: null,
      totalResults: items.length
    });

  } catch (error) {
    console.error("Handler Error:", error);
    return response.status(500).json({ error: `An error occurred. ${error.message}` });
  }
}