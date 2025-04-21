const API_KEY = process.env.YOUTUBE_API_KEY;

document.getElementById('searchForm').addEventListener('submit', async function(event) {
  event.preventDefault();

  const playlistUrl = document.getElementById('playlistUrl').value.trim();
  const searchTerm = document.getElementById('searchTerm').value.trim().toLowerCase();
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = 'Loading...';

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    alert("Invalid playlist URL. Make sure it includes 'list='.");
    return;
  }

  try {
    const allItems = await fetchAllVideos(playlistId);

    let items = searchTerm
      ? allItems.filter(item => item.snippet.title.toLowerCase().includes(searchTerm))
      : allItems;

    if (items.length === 0) {
      resultsContainer.innerHTML = `<li>No videos found.</li>`;
      return;
    }

    resultsContainer.innerHTML = '';
    items.forEach(item => {
      const videoId = item.snippet.resourceId.videoId;
      const title = item.snippet.title;
      const thumbnailUrl = item.snippet.thumbnails.medium.url;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const li = document.createElement('li');
      li.className = 'video-item';
      li.innerHTML = `
        <img src="${thumbnailUrl}" alt="${title} thumbnail" />
        <div class="video-info">
          <a href="${videoUrl}" target="_blank">${title}</a>
        </div>
      `;
      resultsContainer.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    resultsContainer.innerHTML = `<li>Error: ${err.message}</li>`;
  }
});

async function fetchAllVideos(playlistId) {
  let allItems = [];
  let nextPageToken = '';
  
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50&pageToken=${nextPageToken}&key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    allItems = allItems.concat(data.items);
    nextPageToken = data.nextPageToken || '';
  } while (nextPageToken);

  return allItems;
}


function extractPlaylistId(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("list");
  } catch (e) {
    return null;
  }
}
