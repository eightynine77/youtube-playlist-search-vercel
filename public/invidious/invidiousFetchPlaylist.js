import { filterItems } from '/searchFilter.js';

let allFetchedItems = [];
let currentSearchTerm = ''; 
let currentPlaylistUrl = ''; 
let isSearching = false;

const resultsContainer = document.getElementById('results');
const statusMessageEl = document.getElementById('statusMessage');
const form = document.getElementById('searchForm');
const searchButton = form.querySelector('button'); 
const instanceSelect = document.getElementById('instanceSelect');
const instanceInput = document.getElementById('instanceInput');

function updateStatus(msg, isError = false) {
  if (!statusMessageEl) return;
  statusMessageEl.textContent = msg;
  statusMessageEl.className = isError ? 'status-error' : 'status-info';
}

function extractPlaylistId(url) {
  try { if (!url) return null; const parsed = new URL(url); if (!parsed.hostname.includes('youtube.com')) return null; return parsed.searchParams.get('list'); } catch (e) { return null; }
}

function clearResults() { if (!resultsContainer) return; resultsContainer.innerHTML = ''; }

function renderResultsList(itemsToShow) {
  if (!resultsContainer) return;
  clearResults();
  if (!itemsToShow || itemsToShow.length === 0) {
    resultsContainer.innerHTML = '<li class="empty-result">No results</li>';
    return;
  }

  itemsToShow.forEach(it => {
    const li = document.createElement('li');
    li.className = 'video-item';

    const thumbnailUrl = it.thumbnailUrl || '';
    const title = (it.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const videoUrl = it.videoUrl || '#';
    const channelId = it.channelId || '';
    const channelTitle = it.channelTitle || '';

    li.innerHTML = `
      <img src="${thumbnailUrl}" alt="${title} thumbnail" loading="lazy" />
      <div class="video-info">
        <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
        <div class="channel-info-container">
          <span class="youtube-channel-text">youtube channel: </span>
          ${channelId ? `<a href="https://www.youtube.com/channel/${channelId}" class="channel-link" target="_blank" rel="noopener noreferrer">${channelTitle || ''}</a>` : `<span class="channel-name">${channelTitle || ''}</span>`}
        </div>
      </div>
    `;

    resultsContainer.appendChild(li);
  });
}

function applyFilterAndRender() {
  const wholeWordOnly = !!document.getElementById('wholeWordMatch')?.checked;
  const searchMode = document.querySelector('input[name="searchMode"]:checked')?.value || 'title';
  
  const filtered = filterItems(allFetchedItems, currentSearchTerm, wholeWordOnly, searchMode);
  renderResultsList(filtered);
}

function getSelectedInstance() {
    const manualInstance = instanceInput?.value?.trim();
    if (manualInstance) {
        return manualInstance;
    }
    return instanceSelect?.value;
}

async function fetchPlaylistPageClient(playlistUrl, invidiousInstance, page) {
    const url = `/api/invidiousAPI?playlistUrl=${encodeURIComponent(playlistUrl)}&invidiousInstance=${encodeURIComponent(invidiousInstance)}&page=${page}`;
    
    const resp = await fetch(url);
    const json = await resp.json();

    if (!resp.ok) {
        throw new Error(json.error || `Server returned ${resp.status}`);
    }
    
    return json;
}

async function progressiveSearch() {
  isSearching = true;
  allFetchedItems = [];
  
  const CONCURRENT_REQUESTS = 4;
  let currentPage = 1;
  let hasMore = true;

  searchButton.disabled = true;  
  searchButton.textContent = 'Searching...';
  
  const playlistId = extractPlaylistId(currentPlaylistUrl);
  const invidiousInstance = getSelectedInstance();

  if (!playlistId) {
    updateStatus('Invalid playlist URL', true);
    isSearching = false;
    searchButton.disabled = false;
    searchButton.textContent = 'Search';
    return;
  }
  if (!invidiousInstance) {
    updateStatus('Please select or enter an Invidious instance', true);
    isSearching = false;
    searchButton.disabled = false;
    searchButton.textContent = 'Search';
    return;
  }
  
  updateStatus('Searching playlist...');

  try {
    while (hasMore) {
      
      const pageNumbersToFetch = [];
      for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
        pageNumbersToFetch.push(currentPage + i);
      }

      const fetchPromises = pageNumbersToFetch.map(page => 
        fetchPlaylistPageClient(currentPlaylistUrl, invidiousInstance, page)
      );

      const results = await Promise.allSettled(fetchPromises);
      
      let itemsFoundInThisBatch = 0;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const pageData = result.value;
          
          if (pageData.items && pageData.items.length > 0) {
            allFetchedItems.push(...pageData.items);
            itemsFoundInThisBatch += pageData.items.length;
          }
          
          if (pageData.nextPage === null) {
            hasMore = false;
          }
        } else {
          updateStatus(`A fetch request failed: ${result.reason}`);
          hasMore = false; 
        }
      }
      
      applyFilterAndRender();  
      updateStatus(`Searching ${allFetchedItems.length} videos...`);
      
      if (itemsFoundInThisBatch === 0) {
        hasMore = false;
      }
      
      currentPage += CONCURRENT_REQUESTS;
    }

    updateStatus(`Done — searched ${allFetchedItems.length} videos`);

  } catch (err) {
    console.error('progressiveSearch error:', err);
    updateStatus('An error occurred: ' + (err.message || err), true);
  } finally {
    isSearching = false;  
    searchButton.disabled = false;  
    searchButton.textContent = 'Search';  
  }
}


if (form) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    
    if (isSearching) {
      return; 
    }
    
    currentPlaylistUrl = document.getElementById('playlistUrl')?.value?.trim() || '';
    currentSearchTerm = document.getElementById('searchTerm')?.value?.trim() || '';
    
    if (!currentPlaylistUrl) {
      updateStatus('Please enter a playlist URL.', true);
      return;
    }

    clearResults();
    progressiveSearch(); 
  });
}

if (!resultsContainer) console.warn('No #results element found. UI may not render.');