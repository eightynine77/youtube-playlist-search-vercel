const form = document.getElementById('searchForm');
const resultsContainer = document.getElementById('results');
const showAllBtn = document.createElement('button');

showAllBtn.textContent = 'Show All';
showAllBtn.style.display = 'none';
showAllBtn.type = 'button';
showAllBtn.style.marginTop = '1em';
form.appendChild(showAllBtn);

let allFetchedItems = [];
let nextToken = '';
let currentPlaylistUrl = '';
let currentSearchTerm = '';

form.addEventListener('submit', async function (event) {
  event.preventDefault();

  resultsContainer.innerHTML = '<li class="loading-message">Loading...</li>';
  showAllBtn.style.display = 'none';

  currentPlaylistUrl = document.getElementById('playlistUrl').value.trim();
  currentSearchTerm = document.getElementById('searchTerm').value.trim().toLowerCase();
  allFetchedItems = [];
  nextToken = '';

  if (!currentPlaylistUrl) {
    resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
    return;
  }

  await fetchAndRender(currentPlaylistUrl, currentSearchTerm);
});

showAllBtn.addEventListener('click', handleShowAll);

async function fetchAndRender(playlistUrl, searchTerm, pageToken = '') {
  try {
    const apiUrl = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&searchTerm=${encodeURIComponent(searchTerm)}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch data from server.');
    }

    const data = await response.json();

    const items = data.items || [];
    nextToken = data.nextPageToken || '';

    allFetchedItems = allFetchedItems.concat(items);
    renderResults();

    const hasMatch = searchTerm
      ? allFetchedItems.some(item => item.title.toLowerCase().includes(searchTerm))
      : allFetchedItems.length > 0;

    if (nextToken && !hasMatch) {
      showAllBtn.style.display = 'inline-block';
    } else if (nextToken && hasMatch) {
      showAllBtn.style.display = 'inline-block';
    } else {
      showAllBtn.style.display = 'none';
    }

  } catch (err) {
    console.error("Frontend Error:", err);
    resultsContainer.innerHTML = `<li class="error-message">${err.message}</li>`;
    showAllBtn.style.display = 'none';
  }
}

function renderResults() {
  const searchTerm = currentSearchTerm;
  const filtered = searchTerm
    ? allFetchedItems.filter(item =>
        item.title.toLowerCase().includes(searchTerm)
      )
    : allFetchedItems;

  resultsContainer.innerHTML = '';

  if (filtered.length === 0) {
    resultsContainer.innerHTML = `<li>No videos found matching your criteria.</li>`;
    return;
  }

  filtered.forEach(item => {
    const { title = 'Untitled Video', videoUrl, thumbnailUrl } = item;

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

async function handleShowAll() {
  showAllBtn.disabled = true;
  showAllBtn.textContent = 'Loading all...';

  try {
    while (nextToken) {
      await fetchAndRender(currentPlaylistUrl, currentSearchTerm, nextToken);
    }
  } finally {
    showAllBtn.disabled = false;
    showAllBtn.textContent = 'Show All';
    showAllBtn.style.display = 'none';
  }
}
