let nextPageToken = null;
let currentPlaylistUrl = '';
let currentSearchTerm = '';

document.getElementById('searchForm').addEventListener('submit', async function (event) {
  event.preventDefault();

  currentPlaylistUrl = document.getElementById('playlistUrl').value.trim();
  currentSearchTerm = document.getElementById('searchTerm').value.trim();
  nextPageToken = null; 

  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = '<li class="loading-message">Loading...</li>';

  await fetchAndRenderVideos(true); 
});

async function fetchAndRenderVideos(isFresh = false, fetchAll = false) {
  const resultsContainer = document.getElementById('results');

  if (!currentPlaylistUrl) {
    resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
    return;
  }

  try {
    const params = new URLSearchParams({
      playlistUrl: currentPlaylistUrl,
      searchTerm: currentSearchTerm
    });

    if (nextPageToken) {
      params.append('pageToken', nextPageToken);
    }

    if (fetchAll) {
      params.append('fetchAll', 'true');
    }

    const apiUrl = `/api/fetchPlaylist?${params.toString()}`;
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

    const data = await response.json();
    const items = data.items || [];

    if (isFresh) resultsContainer.innerHTML = '';

    if (items.length === 0) {
      resultsContainer.innerHTML = '<li>No videos found matching your criteria.</li>';
      return;
    }

    items.forEach(item => {
      const { videoId, title = 'Untitled Video', thumbnailUrl, videoUrl } = item;

      if (!videoUrl) return;

      const li = document.createElement('li');
      li.className = 'video-item';
      li.innerHTML = `
        <img src="${thumbnailUrl}" alt="${title} thumbnail" />
        <div class="video-info">
          <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
        </div>
      `;
      resultsContainer.appendChild(li);
    });

    nextPageToken = data.nextPageToken || null;

    managePaginationButtons(resultsContainer, fetchAll);

  } catch (err) {
    console.error("Frontend Error:", err);
    resultsContainer.innerHTML = `<li class="error-message">${err.message}</li>`;
  }
}

function managePaginationButtons(container, fetchAll) {
  document.querySelectorAll('.load-more-btn, .show-all-btn').forEach(btn => btn.remove());

  if (!fetchAll && nextPageToken) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.textContent = 'Load More';
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.addEventListener('click', () => fetchAndRenderVideos(false));
    container.appendChild(loadMoreBtn);

    const showAllBtn = document.createElement('button');
    showAllBtn.textContent = 'Show All';
    showAllBtn.className = 'show-all-btn';
    showAllBtn.addEventListener('click', () => fetchAndRenderVideos(false, true));
    container.appendChild(showAllBtn);
  }
}
