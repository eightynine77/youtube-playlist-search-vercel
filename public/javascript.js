let nextPageToken = null;
let lastPlaylistUrl = '';
let lastSearchTerm = '';
let isLoading = false;

const resultsContainer = document.getElementById('results');
const searchForm = document.getElementById('searchForm');

const loadMoreButton = document.createElement('button');
loadMoreButton.textContent = 'Load More';
loadMoreButton.className = 'load-more-btn';
loadMoreButton.style.display = 'none';
loadMoreButton.addEventListener('click', async () => {
    loadMoreButton.textContent = 'Loading...';
  if (isLoading || !nextPageToken) return;
  await fetchAndDisplayVideos(lastPlaylistUrl, lastSearchTerm, nextPageToken);
  loadMoreButton.textContent = 'Load More';
});

const showAllButton = document.createElement('button');
showAllButton.textContent = 'Show All';
showAllButton.className = 'load-more-btn';
showAllButton.style.display = 'none';
showAllButton.addEventListener('click', async () => {
  showAllButton.disabled = true;
  showAllButton.textContent = 'Loading...';

  while (nextPageToken && !isLoading) {
    await fetchAndDisplayVideos(lastPlaylistUrl, lastSearchTerm, nextPageToken);
  }

  showAllButton.style.display = 'none';
  showAllButton.disabled = false;
  showAllButton.textContent = 'Show All';
});

resultsContainer.after(loadMoreButton);
loadMoreButton.after(showAllButton);

searchForm.addEventListener('submit', async function (event) {
  event.preventDefault();

  const playlistUrl = document.getElementById('playlistUrl').value.trim();
  const searchTerm = document.getElementById('searchTerm').value.trim();

  if (!playlistUrl) {
    resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
    loadMoreButton.style.display = 'none';
    showAllButton.style.display = 'none';
    return;
  }

  resultsContainer.innerHTML = '<li class="loading-message">Loading...</li>';
  nextPageToken = null;
  lastPlaylistUrl = playlistUrl;
  lastSearchTerm = searchTerm;

  await fetchAndDisplayVideos(playlistUrl, searchTerm, null, true);
});

async function fetchAndDisplayVideos(playlistUrl, searchTerm, pageToken = null, isNewSearch = false) {
  if (isLoading) return;
  isLoading = true;
  loadMoreButton.disabled = true;

  try {
    const apiUrl = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&searchTerm=${encodeURIComponent(searchTerm)}${pageToken ? `&pageToken=${pageToken}` : ''}`;
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
    nextPageToken = data.nextPageToken || null;

    if (isNewSearch) {
      resultsContainer.innerHTML = '';
    }

    if (items.length === 0 && isNewSearch) {
      resultsContainer.innerHTML = `<li>No videos found matching your criteria.</li>`;
      loadMoreButton.style.display = 'none';
      showAllButton.style.display = 'none';
      return;
    }

    for (const item of items) {
      const { videoId, title = 'Untitled Video', thumbnailUrl, videoUrl } = item;
      if (!videoUrl) continue;

      const li = document.createElement('li');
      li.className = 'video-item';

      li.innerHTML = `
        <img src="${thumbnailUrl}" alt="${title} thumbnail" />
        <div class="video-info">
          <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
        </div>
      `;
      resultsContainer.appendChild(li);
    }

    if (nextPageToken) {
      loadMoreButton.style.display = 'block';
      showAllButton.style.display = 'block';
    } else {
      loadMoreButton.style.display = 'none';
      showAllButton.style.display = 'none';
    }

  } catch (err) {
    console.error("Frontend Error:", err);
    resultsContainer.innerHTML = `<li class="error-message">${err.message}</li>`;
    loadMoreButton.style.display = 'none';
    showAllButton.style.display = 'none';
  } finally {
    isLoading = false;
    loadMoreButton.disabled = false;
  }
}
