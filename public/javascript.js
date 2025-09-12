import { filterItems } from './searchFilter.js';

let allFetchedItems = [];
let currentSearchTerm = '';
let currentPlaylistUrl = '';
let isSearching = false;
let playlistTotal = null;

const resultsContainer = document.getElementById('results');
const statusMessageEl = document.getElementById('statusMessage');
const form = document.getElementById('searchForm');
const DB_NAME = 'ytplCache';
const DB_VER = 1;
const STORE_PAGES = 'pages';
const COOKIE_EXPIRY_YEARS = 10;
const FETCH_CHUNK_SIZE = 4;
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

  const trimmed = trimItems(json.items || []);
  const payload = { items: trimmed, nextPageToken: json.nextPageToken || null, totalResults: json.totalResults || null };

  if (idbAvailable) {
    try { await idbSet(key, payload); } catch (e) { lsSet(key, payload); }
  } else {
    lsSet(key, payload);
  }

  setLongCookie(`${COOKIE_PREFIX}${playlistId}`, '1', COOKIE_EXPIRY_YEARS);

  return { items: trimmed, nextPageToken: json.nextPageToken || null, fromCache: false, totalResults: json.totalResults || null };
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

async function progressiveSearch() {
  let nextPageToken = '';
  allFetchedItems = [];
  playlistTotal = null;
  updateStatus('Searching playlist...');

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