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
      const response = await fetch(`/fetchPlaylist?playlistId=${encodeURIComponent(playlistId)}`);
      const { items } = await response.json();
  
      let filtered = searchTerm
        ? items.filter(item => item.snippet.title.toLowerCase().includes(searchTerm))
        : items;
  
      if (filtered.length === 0) {
        resultsContainer.innerHTML = `<li>No videos found.</li>`;
        return;
      }
  
      resultsContainer.innerHTML = '';
      filtered.forEach(item => {
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
  
  function extractPlaylistId(url) {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get("list");
    } catch (e) {
      return null;
    }
  }  
