let nextPageToken = null;
let lastPlaylistUrl = '';
let lastSearchTerm = '';

const resultsContainer = document.getElementById('results');
const searchForm = document.getElementById('searchForm');

const showAllButton = document.createElement('button');
showAllButton.textContent = 'Show All';
showAllButton.className = 'show-all-btn';
showAllButton.style.display = 'none'; 
showAllButton.addEventListener('click', async () => {
  showAllButton.disabled = true;
  showAllButton.textContent = 'Loading...';
  await fetchAndDisplayAllVideos(lastPlaylistUrl, lastSearchTerm, nextPageToken);
  showAllButton.style.display = 'none';
});

resultsContainer.after(showAllButton);

searchForm.addEventListener('submit', async function (event) {
  event.preventDefault();

  const playlistUrl = document.getElementById('playlistUrl').value.trim();
  const searchTerm = document.getElementById('searchTerm').value.trim();

  if (!playlistUrl) {
    resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
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
      showAllButton.style.display = 'none';
      return;
    }

    appendItemsToResults(items);

    if (nextPageToken) {
      showAllButton.disabled = false;
      showAllButton.textContent = 'Show All';
      showAllButton.style.display = 'block';
    } else {
      showAllButton.style.display = 'none';
    }

  } catch (err) {
    console.error("Frontend Error:", err);
    resultsContainer.innerHTML = `<li class="error-message">${err.message}</li>`;
    showAllButton.style.display = 'none';
  }
}

async function fetchAndDisplayAllVideos(playlistUrl, searchTerm, pageToken) {
  while (pageToken) {
    try {
      const apiUrl = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&searchTerm=${encodeURIComponent(searchTerm)}&pageToken=${pageToken}`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        appendItemsToResults(data.items);
      }

      pageToken = data.nextPageToken || null;
      nextPageToken = pageToken;

    } catch (err) {
      console.error("Error loading more videos:", err);
      break;
    }
  }
}

function appendItemsToResults(items) {
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
}
