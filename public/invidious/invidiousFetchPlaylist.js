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

function transformInvidiousVideos(videos = [], instanceDomain) {
  return videos.map(video => {
    const thumbnail = video.videoThumbnails?.find(t => t.quality === 'medium') || video.videoThumbnails?.[0];
    return {
      videoId: video.videoId,
      title: video.title,
      channelTitle: video.author,
      channelId: video.authorId,
      description: '', 
      thumbnailUrl: thumbnail?.url ? `https://${instanceDomain}${thumbnail.url}` : '',
      videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      channelHandle: null
    };
  });
}

async function fetchPlaylistPageClient(playlistId, invidiousInstance, continuation) {
    let apiUrl = `https://${invidiousInstance}/api/v1/playlists/${encodeURIComponent(playlistId)}`;
    
    if (continuation) {
      apiUrl += `?continuation=${encodeURIComponent(continuation)}`;
    }

    const resp = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' }
    });
    
    const json = await resp.json();

    if (!resp.ok) {
        if (resp.status === 404) {
          return { items: [], nextContinuation: null };
        }
        throw new Error(json.error || `Server returned ${resp.status}`);
    }
    
    const items = transformInvidiousVideos(json.videos, invidiousInstance);
    
    return {
      items: items,
      nextContinuation: json.continuation || null
    };
}

async function progressiveSearch() {
  isSearching = true;
  allFetchedItems = [];
  let currentContinuation = ''; 
  let hasMore = true; 
  
  searchButton.disabled = true;  
  searchButton.textContent = 'Searching...';
  
  const playlistId = extractPlaylistId(currentPlaylistUrl);
  let invidiousInstance; 

  try {
    invidiousInstance = new URL(getSelectedInstance().startsWith('http') ? getSelectedInstance() : `https://${getSelectedInstance()}`).hostname;
  } catch (e) {
    updateStatus('Invalid Invidious instance URL', true);
    isSearching = false;
    searchButton.disabled = false;
    searchButton.textContent = 'Search';
    return;
  }

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
      
      const result = await fetchPlaylistPageClient(playlistId, invidiousInstance, currentContinuation);

      if (result.items && result.items.length > 0) {
        allFetchedItems.push(...result.items);
      }

      applyFilterAndRender();  
      updateStatus(`Searching ${allFetchedItems.length} videos...`);
      
      if (result.nextContinuation) {
        currentContinuation = result.nextContinuation;
      } else {
        hasMore = false; 
      }
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