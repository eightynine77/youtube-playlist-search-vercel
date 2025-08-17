// javascript.js (replace your existing public/javascript.js with this)
// Uses IndexedDB to cache playlist pages (permanent until user clears).
// Keeps UI minimal: NO "Refresh cache" button. Renders channel link below title as requested.
//
// Assumes you have a `searchFilter.js` module that exports `filterItems`.
// If you don't use modules, convert import to a global function call.

import { filterItems } from './searchFilter.js';

let allFetchedItems = [];
let currentSearchTerm = '';
let currentPlaylistUrl = '';
let isSearching = false;

const resultsContainer = document.getElementById('results');
const statusMessageEl = document.getElementById('statusMessage');
const form = document.getElementById('searchForm');

// --- CONFIG ---
const DB_NAME = 'ytplCache';
const DB_VER = 1;
const STORE_PAGES = 'pages';       // object store for pages: key = playlistId:pageToken
const PLAYLIST_PAGE_TTL_MS = null; // null = "forever" (no expiry)
const COOKIE_EXPIRY_YEARS = 10;    // pointer cookie lifetime
const POLITE_DELAY_MS = 60;        // small pause between page fetches
// Trim fields - include channelHandle in case server provides it
const TRIM_FIELDS = ['videoId','title','channelTitle','channelId','channelHandle','thumbnailUrl','videoUrl','description'];
// --------------

// --- IndexedDB wrapper (promise-based) ---
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
  } catch (e) {
    return null;
  }
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
  } catch (e) {
    // fail silently
  }
}

async function idbDeletePrefix(prefix) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PAGES, 'readwrite');
      const store = tx.objectStore(STORE_PAGES);
      const req = store.openCursor();
      req.onsuccess = (ev) => {
        const cursor = ev.target.result;
        if (cursor) {
          const k = cursor.key;
          if (typeof k === 'string' && k.startsWith(prefix)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error || new Error('idb cursor failed'));
    });
  } catch (e) {
    // ignore
  }
}

// --- localStorage fallback ---
const LS_PREFIX = 'ytpl_ls:';
function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch(e){}
}
function lsDeletePrefix(prefix) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(LS_PREFIX + prefix)) localStorage.removeItem(k);
    }
  } catch (e) {}
}

// --- helpers ---
function updateStatus(msg, isError = false) {
  if (!statusMessageEl) return;
  statusMessageEl.textContent = msg;
  statusMessageEl.className = isError ? 'status-error' : 'status-info';
}

function extractPlaylistId(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    const parsed = new URL(url);
    if (!parsed.hostname.includes('youtube.com')) return null;
    return parsed.searchParams.get('list');
  } catch (e) {
    return null;
  }
}

function setLongCookie(name, value='1', years = COOKIE_EXPIRY_YEARS) {
  try {
    const d = new Date();
    d.setFullYear(d.getFullYear() + years);
    const cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Expires=${d.toUTCString()}; Path=/; SameSite=Lax; Secure`;
    document.cookie = cookie;
  } catch (e){}
}

// Trim video objects to store only necessary fields
function trimItems(rawItems) {
  return (rawItems || []).map(it => {
    const out = {};
    for (const f of TRIM_FIELDS) {
      if (it[f] !== undefined) out[f] = it[f];
    }
    // ensure videoUrl exists
    if (!out.videoUrl && out.videoId) out.videoUrl = `https://www.youtube.com/watch?v=${out.videoId}`;
    return out;
  });
}

// --- client cache + backend fetch ---
async function fetchPlaylistPageClient(playlistUrl, pageToken = '') {
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) throw new Error('Invalid playlist URL');

  const key = `${playlistId}:${pageToken || ''}`;

  // try IndexedDB first
  const idbAvailable = ('indexedDB' in window);
  if (idbAvailable) {
    const data = await idbGet(key);
    if (data) return { items: data.items, nextPageToken: data.nextPageToken, fromCache: true };
  } else {
    const lsData = lsGet(key);
    if (lsData) return { items: lsData.items, nextPageToken: lsData.nextPageToken, fromCache: true };
  }

  // not cached -> call backend
  const url = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&pageToken=${encodeURIComponent(pageToken || '')}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Server returned ${resp.status}: ${text}`);
  }
  const json = await resp.json();

  // trim and save
  const trimmed = trimItems(json.items || []);
  const payload = { items: trimmed, nextPageToken: json.nextPageToken || null };

  if (idbAvailable) {
    try { await idbSet(key, payload); } catch (e) { lsSet(key, payload); }
  } else {
    lsSet(key, payload);
  }

  // set pointer cookie (tiny)
  try { setLongCookie(`ytpl_cached_${playlistId}`, '1', COOKIE_EXPIRY_YEARS); } catch (e) {}

  return { items: trimmed, nextPageToken: json.nextPageToken || null, fromCache: false };
}

// --- rendering ---
// Uses the exact layout you requested: channel link is right below title.
function clearResults() {
  if (!resultsContainer) return;
  resultsContainer.innerHTML = '';
}
function renderResultsList(itemsToShow) {
  if (!resultsContainer) return;
  clearResults();
  if (!itemsToShow || itemsToShow.length === 0) {
    resultsContainer.innerHTML = '<li class="empty">No results</li>';
    return;
  }

  itemsToShow.forEach(it => {
    const li = document.createElement('li');
    li.className = 'video-item';

    const thumbnailUrl = it.thumbnailUrl || '';
    const title = (it.title || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

// --- progressive search (sequential) ---
async function progressiveSearch() {
  let nextPageToken = '';
  allFetchedItems = [];
  updateStatus('Searching playlist…');

  try {
    do {
      if (!isSearching) {
        updateStatus('');
        return;
      }

      const result = await (async () => {
        try {
          return await fetchPlaylistPageClient(currentPlaylistUrl, nextPageToken);
        } catch (err) {
          return { error: err.message || String(err) };
        }
      })();

      if (result.error) {
        updateStatus(result.error, true);
        isSearching = false;
        return;
      }

      if (result.items && result.items.length) {
        allFetchedItems = allFetchedItems.concat(result.items);
      }

      // search/filter over the items cached so far
      const wholeWordOnly = !!document.querySelector('input[name="wholeWordOnly"]')?.checked;
      const searchMode = document.querySelector('input[name="searchMode"]:checked')?.value || 'title';
      const filtered = filterItems(allFetchedItems, currentSearchTerm, wholeWordOnly, searchMode);

      renderResultsList(filtered);

      // Show how many videos have been *searched* so far (user requested wording)
      updateStatus(`Searched ${allFetchedItems.length} videos`);

      nextPageToken = result.nextPageToken || null;

      await new Promise(r => setTimeout(r, POLITE_DELAY_MS));
    } while (nextPageToken);

    // final friendly message
    updateStatus(`Done — searched ${allFetchedItems.length} videos`);
  } catch (err) {
    console.error('progressiveSearch error:', err);
    updateStatus('An error occurred: ' + (err.message || err), true);
  } finally {
    isSearching = false;
  }
}

// --- UI wiring (NO refresh button) ---
if (form) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    currentPlaylistUrl = document.getElementById('playlistUrl')?.value?.trim() || '';
    currentSearchTerm = document.getElementById('searchTerm')?.value?.trim() || '';
    if (!currentPlaylistUrl) {
      updateStatus('Please enter a playlist URL.', true);
      return;
    }
    isSearching = true;
    allFetchedItems = [];
    await progressiveSearch();
  });
}

if (!resultsContainer) console.warn('No #results element found. UI may not render.');