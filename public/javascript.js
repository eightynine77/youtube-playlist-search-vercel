import { filterItems } from './searchFilter.js';

let allFetchedItems = [];
let currentSearchTerm = '';
let currentPlaylistUrl = '';
let isSearching = false;
let dbPromise = null;
let playlistTotal = null;

const resultsContainer = document.getElementById('results');
const statusMessageEl = document.getElementById('statusMessage');
const modalStatusEl = document.getElementById('cookie-message');
const form = document.getElementById('searchForm');
const DB_NAME = 'ytplCache';
const DB_VER = 2;
const STORE_PLAYLISTS = 'playlists';
const STORE_PAGES = 'pages';
const COOKIE_EXPIRY_YEARS = 10;
const FETCH_CHUNK_SIZE = 10;
const TRIM_FIELDS = ['videoId', 'title', 'channelTitle', 'channelId', 'channelHandle', 'thumbnailUrl', 'videoUrl', 'description'];
const COOKIE_PREFIX = 'ytpl_cached_';
const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000; 
const RENEWAL_INTERVAL_MS = 6 * 60 * 60 * 1000;   

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
      if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
        const os = db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'playlistId' });
        os.createIndex('byCached', 'lastCached', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function idbGetAll(storeName) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error || new Error('idb getAll failed'));
    });
  } catch (e) { return []; }
}

async function idbDelete(storeName, key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const r = store.delete(key);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error || new Error('idb delete failed'));
    });
  } catch (e) {}
}

async function idbDeleteRange(storeName, range) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const r = store.delete(range);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error || new Error('idb delete range failed'));
    });
  } catch (e) {}
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

async function idbSetPage(key, value) {
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

async function idbSetPlaylist(meta) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PLAYLISTS, 'readwrite');
      const store = tx.objectStore(STORE_PLAYLISTS);
      const r = store.put(meta); 
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error || new Error('idb put playlist failed'));
    });
  } catch (e) {}
}

const LS_PREFIX = 'ytpl_ls:';
function lsGet(key) {
  try { const raw = localStorage.getItem(LS_PREFIX + key); if (!raw) return null; return JSON.parse(raw); } catch (e) { return null; }
}

function lsSet(key, value) { try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch (e) {} }

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function updateStatus(msg, isError = false) {
  if (!statusMessageEl) return;
  statusMessageEl.textContent = msg;
  statusMessageEl.className = isError ? 'status-error' : 'status-info';
}

function updateModalStatus(msg, isError = false) {
  if (!modalStatusEl) return;
  modalStatusEl.textContent = msg;
  modalStatusEl.className = isError ? 'cookies-message modal-status-error' : 'cookies-message';
}

function extractPlaylistId(url) {
  try { if (!url) return null; const parsed = new URL(url); if (!parsed.hostname.includes('youtube.com')) return null; return parsed.searchParams.get('list'); } catch (e) { return null; }
}

function setLongCookie(name, value, years = COOKIE_EXPIRY_YEARS) {
  const cookieData = JSON.stringify({ lastSet: Date.now(), value: value });
  try {
    const d = new Date();
    d.setFullYear(d.getFullYear() + years);
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(cookieData)}; Expires=${d.toUTCString()}; Path=/; SameSite=Lax; Secure`;
  } catch (e) {}
}

function trimItems(rawItems) {
  return (rawItems || []).map(it => {
    const out = {};
    for (const f of TRIM_FIELDS) if (it[f] !== undefined) out[f] = it[f];
    if (!out.videoUrl && out.videoId) out.videoUrl = `https://www.youtube.com/watch?v=${out.videoId}`;
    return out;
  });
}

async function fetchPlaylistPageClient(playlistUrl, pageToken = '') {
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) throw new Error('Invalid playlist URL');

  const key = `${playlistId}:${pageToken || ''}`;

  const idbAvailable = ('indexedDB' in window);
  if (idbAvailable) {
    const data = await idbGet(key);
    if (data) return { items: data.items, nextPageToken: data.nextPageToken, fromCache: true, totalResults: data.totalResults || null };
  } else {
    const lsData = lsGet(key);
    if (lsData) return { items: lsData.items, nextPageToken: lsData.nextPageToken, fromCache: true, totalResults: lsData.totalResults || null };
  }

  const url = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&pageToken=${encodeURIComponent(pageToken || '')}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Server returned ${resp.status}: ${text}`);
  }
  const json = await resp.json();

  if (json.playlistTitle && !pageToken) {
    const meta = {
      playlistId: playlistId,
      playlistTitle: json.playlistTitle,
      channelTitle: json.playlistChannelTitle,
      lastCached: Date.now()
    };
    await idbSetPlaylist(meta); 
  }

  const trimmed = trimItems(json.items || []);
  const payload = { items: trimmed, nextPageToken: json.nextPageToken || null, totalResults: json.totalResults || null };

  if (idbAvailable) {
    try { await idbSetPage(key, payload); } catch (e) { lsSet(key, payload); }
  } else {
    lsSet(key, payload);
  }

  setLongCookie(`${COOKIE_PREFIX}${playlistId}`, '1', COOKIE_EXPIRY_YEARS);

  return { items: trimmed, nextPageToken: json.nextPageToken || null, fromCache: false, totalResults: json.totalResults || null };
}

const modal = document.getElementById('cacheModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cachedListEl = document.getElementById('cachedPlaylistsList');

async function populateCacheList() {
  if (!cachedListEl) return;
  updateModalStatus('');
  const playlists = await idbGetAll(STORE_PLAYLISTS);
  cachedListEl.innerHTML = ''; 

  if (playlists.length === 0) {
    cachedListEl.innerHTML = '<li class="empty-result">No playlists are cached.</li>';
    return;
  }

  playlists.sort((a, b) => b.lastCached - a.lastCached); 

  playlists.forEach(pl => {
    const li = document.createElement('li');
    li.className = 'cached-playlist-item';
    li.innerHTML = `
      <div class="cached-playlist-info">
        <strong>${pl.playlistTitle || 'Unknown Title'}</strong>
        <span>By: ${pl.channelTitle || 'Unknown Channel'} (ID: ${pl.playlistId})</span>
      </div>
      <button class="delete-cache-btn" data-playlist-id="${pl.playlistId}">Delete</button>
    `;
    cachedListEl.appendChild(li);
  });
}

async function deletePlaylistCache(playlistId) {
  if (!playlistId) return;

  const range = IDBKeyRange.bound(playlistId + ':', playlistId + ':\uffff');
  await idbDeleteRange(STORE_PAGES, range);

  await idbDelete(STORE_PLAYLISTS, playlistId);

  Object.keys(localStorage)
    .filter(k => k.startsWith(LS_PREFIX + playlistId + ':'))
    .forEach(k => localStorage.removeItem(k));

  const cookieName = `${COOKIE_PREFIX}${playlistId}`;
  document.cookie = `${cookieName}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax; Secure`;

  console.log(`Cache cleared for playlist: ${playlistId}`);
  updateModalStatus(`Cleared cache for playlist: ${playlistId}`);
  await populateCacheList(); 
}

async function clearAllCache() {
  updateModalStatus('Clearing all local cache...');
  isSearching = false; 

  try {
    if (dbPromise) {
      console.log('Database connection found, requesting close...');
      const db = await dbPromise;

      await new Promise((resolve, reject) => {
        db.onclose = () => {
          console.log('Database connection confirmed closed.');
          resolve();
        };

        db.onerror = (e) => {
          console.error('Error while closing DB', e);
          reject(new Error('Error during DB close'));
        };

        db.close();
        dbPromise = null; 
        console.log('Current tab DB close request sent.');
      });

    } else {
      console.log('No DB connection was open, proceeding with delete.');
    }

    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      
      req.onsuccess = () => {
        console.log('Database successfully deleted.');
        resolve();
      };
      
      req.onerror = (e) => {
        console.error('IDB delete failed:', e);
        reject(req.error || new Error('IDB delete failed'));
      };
      
      req.onblocked = () => {
        
      };
    });
    
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .forEach(k => localStorage.removeItem(k));

    const allCookies = document.cookie.split(';');
    for (const cookie of allCookies) {
      const name = cookie.trim().split('=')[0];
      if (name.startsWith(COOKIE_PREFIX)) {
        document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax; Secure`;
      }
    }

    allFetchedItems = [];
    playlistTotal = null;
    clearResults();
    updateModalStatus('All cache cleared');
    console.log('All cache cleared.');

    if (modal.style.display !== 'none') {
      await populateCacheList(); 
    }
  } catch (err) {
    console.error('All cache clear failed:', err);
    updateModalStatus(`Cache clear failed: ${err.message}`, true);
  }
}

const clearCacheLink = document.getElementById('clearCacheLink');
if (clearCacheLink) {
  clearCacheLink.addEventListener('click', (e) => {
    e.preventDefault();
    populateCacheList();
    modal.style.display = 'flex';
  });
}

if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });
}

if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
}

if (cachedListEl) {
  cachedListEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-cache-btn')) {
      const playlistId = e.target.dataset.playlistId;
      if (confirm(`Are you sure you want to clear the cache for playlist ${playlistId}?`)) {
        deletePlaylistCache(playlistId);
      }
    }
  });
}

const clearAllBtn = document.getElementById('clearAllCacheBtn');
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear ALL cached playlist data? This cannot be undone.')) {
      clearAllCache();
    }
  });
}

function clearResults() { if (!resultsContainer) return; resultsContainer.innerHTML = ''; }

function renderResultsList(itemsToShow) {
  if (!resultsContainer) return;
  clearResults();
  if (!itemsToShow || itemsToShow.length === 0) {
    if (isSearching) {
      return;
    } else {
      resultsContainer.innerHTML = '<li class="empty-result">No results</li>';
      return;
    }
  }

  itemsToShow.forEach(it => {
    const li = document.createElement('li');
    li.className = 'video-item';

    const thumbnailUrl = it.thumbnailUrl || '';
    const title = (it.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const videoUrl = it.videoUrl || '#';
    const channelId = it.channelId || '';
    const channelHandle = it.channelHandle || null;
    const channelTitle = it.channelTitle || '';

    const channelTitleHtml = channelId 
      ? `<a href="https://www.youtube.com/channel/${channelId}" class="channel-link" target="_blank" rel="noopener noreferrer">${channelTitle || ''}</a>` 
      : `<span class="channel-name">${channelTitle || ''}</span>`;
    const channelHandleHtml = channelHandle 
      ? ` — <a href="https://www.youtube.com/${channelHandle}" class="channel-link" target="_blank" rel="noopener noreferrer">${channelHandle}</a>` 
      : '';

    li.innerHTML = `
      <img src="${thumbnailUrl}" alt="${title} thumbnail" loading="lazy" />
      <div class="video-info">
        <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
        <div class="channel-info-container">
          <span class="youtube-channel-text">youtube channel: </span>
          ${channelTitleHtml}${channelHandleHtml}
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

async function progressiveSearch() {
  let nextPageToken = '';
  allFetchedItems = [];
  playlistTotal = null;
  if (playlistTotal && Number.isFinite(playlistTotal)) {
    updateStatus(`Searching ${allFetchedItems.length} of ${playlistTotal} videos`);
  } else {
    updateStatus(`Searching ${allFetchedItems.length} videos`);
  }

  try {
    do {
      if (!isSearching) { updateStatus(''); return; }

      const itemsInChunk = [];
      let currentResult;

      for (let i = 0; i < FETCH_CHUNK_SIZE; i++) {
        currentResult = await fetchPlaylistPageClient(currentPlaylistUrl, nextPageToken);
        if (currentResult.items && currentResult.items.length) {
          itemsInChunk.push(...currentResult.items);
        }
        nextPageToken = currentResult.nextPageToken;
        if (!nextPageToken) break;
      }

      if (currentResult.totalResults != null && playlistTotal === null) {
        playlistTotal = Number(currentResult.totalResults) || null;
      }

      if (itemsInChunk.length) {
        allFetchedItems.push(...itemsInChunk);
      }

      applyFilterAndRender();

      if (playlistTotal && Number.isFinite(playlistTotal)) {
        updateStatus(`Searching ${allFetchedItems.length} of ${playlistTotal} videos`);
      } else {
        updateStatus(`Searching ${allFetchedItems.length} videos`);
      }
    } while (nextPageToken);
    updateStatus(`Done — searched ${allFetchedItems.length} videos`);
  } catch (err) {
    console.error('progressiveSearch error:', err);
    updateStatus('An error occurred: ' + (err.message || err), true);
  } finally {
    isSearching = false;
    applyFilterAndRender();
  }
}

if (form) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    isSearching = false;

    currentPlaylistUrl = document.getElementById('playlistUrl')?.value?.trim() || '';
    currentSearchTerm = document.getElementById('searchTerm')?.value?.trim() || '';
    if (!currentPlaylistUrl) { updateStatus('Please enter a playlist URL.', true); return; }

    setTimeout(() => {
      isSearching = true;
      progressiveSearch();
    }, 0);
  });
}

if (!resultsContainer) console.warn('No #results element found. UI may not render.');

function checkAndRenewCookies() {
  const allCookies = document.cookie.split(';');
  for (const cookie of allCookies) {
    const name = cookie.trim().split('=')[0];
    if (name.startsWith(COOKIE_PREFIX)) {
      try {
        const cookieValue = getCookie(name);
        if (cookieValue) {
          const data = JSON.parse(decodeURIComponent(cookieValue));
          const timeSinceLastSet = Date.now() - data.lastSet;
          
          if (timeSinceLastSet > RENEWAL_THRESHOLD_MS) {
            console.log(`Renewing stale cookie: ${name}`);
            setLongCookie(name, data.value, COOKIE_EXPIRY_YEARS);
          }
        }
      } catch (e) {
        console.error(`Could not parse or renew cookie ${name}`, e);
      }
    }
  }
}

checkAndRenewCookies(); 

setInterval(checkAndRenewCookies, RENEWAL_INTERVAL_MS); 



