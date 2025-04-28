document.getElementById('searchForm').addEventListener('submit', async function(event) {
  event.preventDefault(); 

  const playlistUrl = document.getElementById('playlistUrl').value.trim();
  const searchTerm = document.getElementById('searchTerm').value.trim(); 
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = 'Loading...';
  const loadingIndicator = document.getElementById('loadingIndicator'); 

  if (!playlistUrl) {
      resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
      return;
  }

  resultsContainer.innerHTML = ''; 
  if (loadingIndicator) loadingIndicator.style.display = 'block'; 

  try {
    const apiUrl = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&searchTerm=${encodeURIComponent(searchTerm)}`;

    const response = await fetch(apiUrl);

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (!response.ok) {
      let errorMsg = `Error: ${response.status} ${response.statusText}`;
      try {
          const errorData = await response.json();
          errorMsg = `Error: ${errorData.error || 'Failed to fetch data from server.'}`;
      } catch (e) {
          
      }
      throw new Error(errorMsg);
    }

    const items = await response.json();

    if (!items || items.length === 0) {
      resultsContainer.innerHTML = `<li>No videos found matching your criteria.</li>`;
      return;
    }

    resultsContainer.innerHTML = '';

    items.forEach(item => {
      const { videoId, title = 'Untitled Video', thumbnailUrl, videoUrl } = item;

      if (!videoUrl) return;

      const li = document.createElement('li');
      li.className = 'video-item'; 

      const imageSrc = thumbnailUrl || `https://placehold.co/120x90/eee/aaa?text=No+Thumb`;

      li.innerHTML = `
        <img
          src="${imageSrc}"
          alt="${title} thumbnail"
          onerror="this.onerror=null; this.src='https://placehold.co/120x90/eee/aaa?text=Error';" 
        />
        <div class="video-info">
          <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
          <p class="video-id">Video ID: ${videoId}</p>
        </div>
      `;
      resultsContainer.appendChild(li);
    });

  } catch (err) {
    console.error("Frontend Error:", err);
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    resultsContainer.innerHTML = `<li class="error-message">${err.message}</li>`;
  }
});
