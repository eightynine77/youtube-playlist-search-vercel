import { filterItems } from '/searchFilter.js';

let allFetchedItems = [];
let currentSearchTerm = '';
let currentPlaylistUrl = '';
let isSearching = false;

const resultsContainer = document.getElementById('results');
const statusMessageEl = document.getElementById('statusMessage');
const form = document.getElementById('searchForm');
const instanceSelect = document.getElementById('instanceSelect');
const instanceInput = document.getElementById('instanceInput');

const DB_NAME = 'ytplCache';
const DB_VER = 1;
const STORE_PAGES = 'pages';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_PAGES)) {
        const os = db.createObjectStore(STORE_PAGES, { keyPath: 'key' });
        os.createIndex('byCreated', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function idbGet(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PAGES, 'readonly');
      const store = tx.objectStore(STORE_PAGES);
      const r = store.get(key);
      r.onsuccess = () => resolve(r.result ? r.result.value : null);
      r.onerror = () => reject(r.error || new Error('idb get failed'));
    });
  } catch (e) { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PAGES, 'readwrite');
      const store = tx.objectStore(STORE_PAGES);
      const payload = { key, value, createdAt: Date.now() };
      const r = store.put(payload);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error || new Error('idb put failed'));
    });
  } catch (e) {}
}

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

async function fetchFullPlaylist() {
  if (isSearching) return;
  isSearching = true;
  allFetchedItems = [];
  updateStatus('Searching playlist...');

  const playlistId = extractPlaylistId(currentPlaylistUrl);
  if (!playlistId) {
    updateStatus('Invalid playlist URL', true);
    isSearching = false;
    return;
  }

  const invidiousInstance = getSelectedInstance();
  if (!invidiousInstance) {
    updateStatus('Please select or enter an Invidious instance', true);
    isSearching = false;
    return;
  }

  const cacheKey = `invidious:${playlistId}`;

  try {
    const cachedData = await idbGet(cacheKey);
    if (cachedData) {
      allFetchedItems = cachedData.items;
      updateStatus(`Done (from cache) — ${allFetchedItems.length} videos`);
      applyFilterAndRender();
      isSearching = false;
      return;
    }

    updateStatus(`Fetching from ${invidiousInstance}...`);
    const url = `/api/invidiousPlaylistAPI?playlistUrl=${encodeURIComponent(currentPlaylistUrl)}&invidiousInstance=${encodeURIComponent(invidiousInstance)}`;
    
    const resp = await fetch(url);
    const json = await resp.json();

    if (!resp.ok) {
      throw new Error(json.error || `Server returned ${resp.status}`);
    }

    allFetchedItems = json.items || [];
    
    const payload = { items: allFetchedItems, totalResults: allFetchedItems.length };
    await idbSet(cacheKey, payload);

    updateStatus(`Done — searched ${allFetchedItems.length} videos`);
    applyFilterAndRender();

  } catch (err) {
    console.error('fetchFullPlaylist error:', err);
    updateStatus('An error occurred: ' + (err.message || err), true);
  } finally {
    isSearching = false;
  }
}


if (form) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    
    currentPlaylistUrl = document.getElementById('playlistUrl')?.value?.trim() || '';
    currentSearchTerm = document.getElementById('searchTerm')?.value?.trim() || '';
    
    if (!currentPlaylistUrl) {
      updateStatus('Please enter a playlist URL.', true);
      return;
    }
    
    clearResults();
    fetchFullPlaylist();
  });
  
  document.getElementById('searchTerm')?.addEventListener('input', () => {
    currentSearchTerm = document.getElementById('searchTerm').value.trim();
    if (!isSearching) applyFilterAndRender();
  });
  
  document.getElementById('wholeWordMatch')?.addEventListener('change', () => {
    if (!isSearching) applyFilterAndRender();
  });

  document.querySelectorAll('input[name="searchMode"]')?.forEach(radio => {
    radio.addEventListener('change', () => {
      if (!isSearching) applyFilterAndRender();
    });
  });
}

if (!resultsContainer) console.warn('No #results element found. UI may not render.');