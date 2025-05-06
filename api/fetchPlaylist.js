const API_KEY = process.env.YOUTUBE_API_KEY;

function extractPlaylistId(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    // Updated regex to be more flexible with YouTube playlist URLs
    const patterns = [
        /list=([\w-]+)/, // Standard playlist URL
        /playlist\?list=([\w-]+)/ // Another common format
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            // Basic check for playlist ID format (alphanumeric, hyphen, underscore)
            if (/^[a-zA-Z0-9_-]+$/.test(match[1])) {
                 return match[1];
            }
        }
    }
    // Try parsing as URL as a fallback, though regex is usually more robust for various URL formats
    const parsedUrl = new URL(url);
     // Ensure it's a youtube.com domain for this specific check
    if (parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be')) {
        const listId = parsedUrl.searchParams.get("list");
        if (listId && /^[a-zA-Z0-9_-]+$/.test(listId)) {
            return listId;
        }
    }
    return null;
  } catch (e) {
    console.error("Error extracting playlist ID from URL:", e.message, "URL:", url);
    return null;
  }
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*'); // For Vercel, this might be configured elsewhere or not needed if same-origin
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
  const pageToken = searchParams.get('pageToken') || '';

  if (!playlistUrl) {
    return response.status(400).json({ error: "Missing 'playlistUrl' query parameter." });
  }

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return response.status(400).json({ error: "Invalid or unrecognized YouTube playlist URL. Ensure it contains a valid 'list=' parameter (e.g., PL... or UU...). Example: https://www.youtube.com/playlist?list=YOUR_PLAYLIST_ID" });
  }

  if (!API_KEY) {
    console.error("YOUTUBE_API_KEY is not defined in environment variables.");
    return response.status(500).json({ error: "Server configuration error: YouTube API key is not configured." });
  }

  const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50&pageToken=${encodeURIComponent(pageToken)}&key=${API_KEY}`;

  try {
    const ytResponse = await fetch(apiUrl);
    const data = await ytResponse.json();

    if (!ytResponse.ok) {
        // Check for specific YouTube API error structure
        if (data.error && data.error.message) {
            console.error(`YouTube API Error (Status: ${ytResponse.status}): ${data.error.message}`, data.error.errors);
            // Provide a more user-friendly message for common errors
            if (data.error.errors && data.error.errors.some(e => e.reason === 'playlistNotFound')) {
                 return response.status(404).json({ error: `Playlist not found. Please check the URL or playlist ID.` });
            }
            return response.status(ytResponse.status).json({ error: `YouTube API Error: ${data.error.message}` });
        }
        // Fallback for other non-ok responses
        return response.status(ytResponse.status).json({ error: `Failed to fetch data from YouTube API. Status: ${ytResponse.status}` });
    }
    
    if (data.error) { // Should be caught by !ytResponse.ok, but as a safeguard
      throw new Error(`YouTube API Error: ${data.error.message} (Code: ${data.error.code})`);
    }

    const items = (data.items || [])
      .filter(item => item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId && item.snippet.title) // Ensure essential data exists
      .map(item => ({
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        description: item.snippet.description || "", // Add description, default to empty string if missing
        thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url, // Fallback to default thumbnail
        videoUrl: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}` // Correct YouTube video URL
      }));

    return response.status(200).json({
      items,
      nextPageToken: data.nextPageToken || null
    });

  } catch (error) {
    console.error("Handler Error:", error.message, error.stack);
    // Avoid exposing too much detail from generic errors
    let errorMessage = "An error occurred while fetching playlist videos.";
    if (error.message.includes("YouTube API Error")) {
        errorMessage = error.message; // Keep specific API error messages
    }
    return response.status(500).json({ error: errorMessage });
  }
}