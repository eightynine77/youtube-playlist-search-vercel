// /api/search.js

// Import fetch if using an older Node.js version that doesn't have it built-in
// For modern Node.js/Vercel environments, fetch is usually available globally.
// If needed: const fetch = require('node-fetch');

// Retrieve the API key from environment variables for security
const API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * Extracts the YouTube playlist ID from a given URL.
 * @param {string} url - The YouTube playlist URL.
 * @returns {string|null} The playlist ID or null if not found.
 */
function extractPlaylistId(url) {
  try {
    // Check if the input is a valid URL string
    if (!url || typeof url !== 'string') {
      return null;
    }
    const parsedUrl = new URL(url);
    // Check if the hostname is a valid YouTube domain
    if (!parsedUrl.hostname.includes('youtube.com')) {
      return null;
    }
    return parsedUrl.searchParams.get("list");
  } catch (e) {
    console.error("Error parsing URL:", e);
    return null; // Return null if URL parsing fails
  }
}

/**
 * Fetches all video items from a YouTube playlist using pagination.
 * @param {string} playlistId - The ID of the YouTube playlist.
 * @returns {Promise<Array>} A promise that resolves with an array of playlist items.
 * @throws {Error} If the YouTube API returns an error.
 */
async function fetchAllVideos(playlistId) {
  let allItems = [];
  let nextPageToken = '';

  if (!API_KEY) {
    throw new Error("YouTube API key is not configured.");
  }

  do {
    // Construct the YouTube API URL
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50&pageToken=${nextPageToken}&key=${API_KEY}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      // Handle API errors returned by Google
      if (data.error) {
        console.error("YouTube API Error:", data.error);
        // Provide a more specific error message if possible
        throw new Error(`YouTube API Error: ${data.error.message} (Code: ${data.error.code})`);
      }

      // Check if items exist before concatenating
      if (data.items && Array.isArray(data.items)) {
          allItems = allItems.concat(data.items);
      }

      // Update the next page token
      nextPageToken = data.nextPageToken || '';

    } catch (fetchError) {
        // Handle network errors or issues with the fetch call itself
        console.error("Error fetching playlist items:", fetchError);
        throw new Error(`Failed to fetch data from YouTube API. ${fetchError.message}`);
    }

  } while (nextPageToken); // Continue if there's a next page token

  return allItems;
}

/**
 * Vercel Serverless Function handler.
 * Handles GET requests to /api/search.
 * Expects 'playlistUrl' and optional 'searchTerm' query parameters.
 */
export default async function handler(request, response) {
  // Allow requests from any origin (adjust in production if needed)
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight request for CORS
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Only allow GET requests
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // Get query parameters from the request URL
  const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
  const playlistUrl = searchParams.get('playlistUrl');
  const searchTerm = searchParams.get('searchTerm')?.toLowerCase() || ''; // Default to empty string if not provided

  // Validate playlistUrl
  if (!playlistUrl) {
    return response.status(400).json({ error: "Missing 'playlistUrl' query parameter." });
  }

  // Extract playlist ID
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return response.status(400).json({ error: "Invalid playlist URL. Make sure it's a valid YouTube URL with a 'list=' parameter." });
  }

  try {
    // Fetch all videos from the playlist
    const allItems = await fetchAllVideos(playlistId);

    // Filter items based on the search term (if provided)
    let filteredItems = searchTerm
      ? allItems.filter(item =>
          item.snippet?.title?.toLowerCase().includes(searchTerm)
        )
      : allItems;

    // Format the results to send back to the client
    const results = filteredItems.map(item => ({
        videoId: item.snippet?.resourceId?.videoId,
        title: item.snippet?.title,
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url,
        // Ensure videoId exists before creating the URL
        videoUrl: item.snippet?.resourceId?.videoId
          ? `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
          : null // Or provide a placeholder/error indicator
    })).filter(item => item.videoId && item.title); // Filter out items missing essential data

    // Send the formatted results as JSON
    response.status(200).json(results);

  } catch (error) {
    // Handle errors during API fetching or processing
    console.error("Handler Error:", error);
    // Send a generic server error message back, hiding specific details
    response.status(500).json({ error: `An error occurred while fetching playlist videos. ${error.message}` });
  }
}
