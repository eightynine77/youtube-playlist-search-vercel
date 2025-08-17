import { filterItems } from './searchFilter.js';

let allFetchedItems = [];
let currentSearchTerm = '';
let currentPlaylistUrl = '';
let isSearching = false;

const resultsContainer = document.getElementById('results');
const statusMessageEl = document.getElementById('statusMessage');
const form = document.getElementById('searchForm');


const DB_NAME = 'ytplCache';
const DB_VER = 1;
const STORE_PAGES = 'pages';       
const PLAYLIST_PAGE_TTL_MS = null; 
const COOKIE_EXPIRY_YEARS = 10;    
const POLITE_DELAY_MS = 60;        
const TRIM_FIELDS = ['videoId','title','channelTitle','channelId','thumbnailUrl','videoUrl','description'];



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
    
  }
}


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


function trimItems(rawItems) {
  return (rawItems || []).map(it => {
    const out = {};
    for (const f of TRIM_FIELDS) {
      if (it[f] !== undefined) out[f] = it[f];
    }
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
    if (data) return { items: data.items, nextPageToken: data.nextPageToken, fromCache: true };
  } else {
    
    const lsData = lsGet(key);
    if (lsData) return { items: lsData.items, nextPageToken: lsData.nextPageToken, fromCache: true };
  }

  
  const url = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&pageToken=${encodeURIComponent(pageToken || '')}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Server returned ${resp.status}: ${text}`);
  }
  const json = await resp.json();

  
  const trimmed = trimItems(json.items || []);
  const payload = { items: trimmed, nextPageToken: json.nextPageToken || null };

  if (idbAvailable) {
    try {
      await idbSet(key, payload);
    } catch (e) {
      
      lsSet(key, payload);
    }
  } else {
    lsSet(key, payload);
  }

  
  try {
    setLongCookie(`ytpl_cached_${playlistId}`, '1', COOKIE_EXPIRY_YEARS);
  } catch (e) {}

  return { items: trimmed, nextPageToken: json.nextPageToken || null, fromCache: false };
}


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

    const thumb = document.createElement('img');
    thumb.className = 'thumb';
    thumb.src = it.thumbnailUrl || '';
    thumb.alt = it.title || '';

    const title = document.createElement('a');
    title.href = it.videoUrl || '#';
    title.textContent = it.title || 'Untitled';
    title.target = '_blank';
    title.rel = 'noopener';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const ch = document.createElement('div');
    ch.className = 'channel';
    ch.textContent = it.channelTitle || (it.channelHandle ? it.channelHandle : 'Unknown channel');

    meta.appendChild(ch);

    li.appendChild(thumb);
    li.appendChild(title);
    li.appendChild(meta);

    resultsContainer.appendChild(li);
  });
}


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

      const wholeWordOnly = !!document.querySelector('input[name="wholeWordOnly"]')?.checked;
      const searchMode = document.querySelector('input[name="searchMode"]:checked')?.value || 'title';
      const filtered = filterItems(allFetchedItems, currentSearchTerm, wholeWordOnly, searchMode);

      renderResultsList(filtered);

      updateStatus(`Fetched ${allFetchedItems.length} videos${result.fromCache ? ' (page from cache)' : ''}`);

      nextPageToken = result.nextPageToken || null;

      
      await new Promise(r => setTimeout(r, POLITE_DELAY_MS));
    } while (nextPageToken);

    if (allFetchedItems.length === 0) updateStatus('No videos found in this playlist.');
    else updateStatus(`Done — ${allFetchedItems.length} videos processed.`);
  } catch (err) {
    console.error('progressiveSearch error:', err);
    updateStatus('An error occurred: ' + (err.message || err), true);
  } finally {
    isSearching = false;
  }
}


function addRefreshButton() {
  try {
    if (document.getElementById('refreshCacheBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'refreshCacheBtn';
    btn.type = 'button';
    btn.textContent = 'Refresh cache (force re-fetch)';
    btn.style.marginLeft = '8px';
    const formEl = document.getElementById('searchForm');
    if (formEl && formEl.parentNode) formEl.parentNode.insertBefore(btn, formEl.nextSibling);
    else document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
      if (!currentPlaylistUrl) {
        updateStatus('No playlist selected to refresh.', true);
        return;
      }
      const playlistId = extractPlaylistId(currentPlaylistUrl);
      if (!playlistId) {
        updateStatus('Invalid playlist URL to refresh.', true);
        return;
      }
      const prefix = `${playlistId}:`;

      
      try {
        if ('indexedDB' in window) await idbDeletePrefix(prefix);
        else lsDeletePrefix(prefix);
      } catch (e) {}

      
      document.cookie = `ytpl_cached_${playlistId}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/;`;

      updateStatus('Cache cleared for playlist. Re-running search...');
      if (!isSearching) {
        isSearching = true;
        progressiveSearch();
      }
    });
  } catch (e) {
    console.warn('Could not add refresh button', e);
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
    isSearching = true;
    addRefreshButton();
    allFetchedItems = [];
    await progressiveSearch();
  });
}

if (!resultsContainer) console.warn('No #results element found. UI may not render.');