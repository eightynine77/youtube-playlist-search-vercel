document.getElementById('searchForm').addEventListener('submit', async function(event) {
  event.preventDefault(); 

  const playlistUrl = document.getElementById('playlistUrl').value.trim();
  const searchTerm = document.getElementById('searchTerm').value.trim();
  const resultsContainer = document.getElementById('results');

  if (!playlistUrl) {
      resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
      return;
  }

  resultsContainer.innerHTML = '<li class="loading-message">Loading...</li>';

  try {
    const apiUrl = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&searchTerm=${encodeURIComponent(searchTerm)}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      let errorMsg = `Error: ${response.status} ${response.statusText}`;
      try {
          const errorData = await response.json();
          errorMsg = `Error: ${errorData.error || 'Failed to fetch data from server.'}`;
      } catch (e) {
          console.warn("Could not parse error response body as JSON.");
      }
      throw new Error(errorMsg);
    }

    const items = await response.json();

    resultsContainer.innerHTML = ''; 

    if (!items || items.length === 0) {
      resultsContainer.innerHTML = `<li>No videos found matching your criteria.</li>`;
      return;
    }

    items.forEach(item => {
      const { videoId, title = 'Untitled Video', thumbnailUrl, videoUrl } = item;

      if (!videoUrl) {
          console.warn("Skipping item due to missing videoUrl:", item);
          return;
      }

      const li = document.createElement('li');
      li.className = 'video-item';

      const imageSrc = thumbnailUrl;

      li.innerHTML = `
        <img src="${imageSrc}" alt="${title} thumbnail" />
        <div class="video-info">
          <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
        </div>
      `;
      resultsContainer.appendChild(li);
    });

  } catch (err) {
    console.error("Frontend Error:", err);
    resultsContainer.innerHTML = `<li class="error-message">${err.message}</li>`;
  }
});
