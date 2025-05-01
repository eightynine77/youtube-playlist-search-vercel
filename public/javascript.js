let allFetchedItems = [];
let nextPageToken = null;
let currentSearchTerm = '';
let currentPlaylistUrl = '';

const resultsContainer = document.getElementById('results');
const form = document.getElementById('searchForm');

const showAllBtn = document.createElement('button');
showAllBtn.textContent = 'Show All';
showAllBtn.style.display = 'none';
showAllBtn.addEventListener('click', handleShowAll);
form.appendChild(showAllBtn);

form.addEventListener('submit', async function (event) {
  event.preventDefault();

  allFetchedItems = [];
  nextPageToken = null;
  resultsContainer.innerHTML = '<li class="loading-message">Loading...</li>';

  currentPlaylistUrl = document.getElementById('playlistUrl').value.trim();
  currentSearchTerm = document.getElementById('searchTerm').value.trim().toLowerCase();

  if (!currentPlaylistUrl) {
    resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
    return;
  }

  const { items, nextToken, error } = await fetchPlaylistPage(currentPlaylistUrl);

  if (error) {
    resultsContainer.innerHTML = `<li class="error-message">${error}</li>`;
    return;
  }

  allFetchedItems = items;
  nextPageToken = nextToken;
  showAllBtn.style.display = nextToken ? 'inline-block' : 'none';

  renderResults();
});

async function fetchPlaylistPage(playlistUrl, pageToken = '') {
  try {
    const apiUrl = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&pageToken=${encodeURIComponent(pageToken)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok || data.error) {
      return { error: data.error || `Error ${response.status}` };
    }

    return {
      items: data.items || [],
      nextToken: data.nextPageToken || null
    };
  } catch (err) {
    return { error: err.message };
  }
}

function renderResults() {
  const filtered = currentSearchTerm
    ? allFetchedItems.filter(item =>
        item.title.toLowerCase().includes(currentSearchTerm)
      )
    : allFetchedItems;

  resultsContainer.innerHTML = '';

  if (filtered.length === 0) {
    resultsContainer.innerHTML = '<li>No videos found matching your criteria.</li>';
    return;
  }

  filtered.forEach(item => {
    const { title, thumbnailUrl, videoUrl } = item;
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
}

async function handleShowAll(event) {
  event.preventDefault();

  showAllBtn.disabled = true;
  showAllBtn.textContent = 'Loading...';

  while (nextPageToken) {
    const { items, nextToken, error } = await fetchPlaylistPage(currentPlaylistUrl, nextPageToken);
    if (error) {
      alert(`Failed to load more videos: ${error}`);
      break;
    }
    allFetchedItems = allFetchedItems.concat(items);
    nextPageToken = nextToken;
    renderResults();
  }

  showAllBtn.style.display = 'none';
  showAllBtn.disabled = false;
  showAllBtn.textContent = 'Show All';
}
