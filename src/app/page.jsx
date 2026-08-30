"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';

// ============================================================================
// FILTER LOGIC
// ============================================================================
function checkMatch(text, term, wholeWord) {
  if (text === null || text === undefined) return false;
  if (wholeWord) {
    const escapedTerm = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
    return regex.test(text);
  } else {
    return text.toLowerCase().includes(term.toLowerCase());
  }
}

function filterItems(items, searchTerm, wholeWordOnly, searchMode) {
  if (!searchTerm) return items;
  return items.filter(item => {
    switch (searchMode) {
      case 'title': return checkMatch(item.title, searchTerm, wholeWordOnly);
      case 'description': return checkMatch(item.description, searchTerm, wholeWordOnly);
      case 'both': return checkMatch(item.title, searchTerm, wholeWordOnly) || checkMatch(item.description, searchTerm, wholeWordOnly);
      case 'channel': {
        // 1. Check if the standard channel name matches
        const matchName = checkMatch(item.channelTitle, searchTerm, wholeWordOnly);
        
        // 2. Normalize the handle and search term by stripping any starting '@'
        const cleanHandle = item.channelHandle ? item.channelHandle.replace(/^@/, '') : '';
        const cleanSearch = searchTerm.replace(/^@/, '');
        
        // 3. Check if the cleaned handle matches the cleaned search term
        const matchHandle = checkMatch(cleanHandle, cleanSearch, wholeWordOnly);
        
        return matchName || matchHandle;
      }
      default: return checkMatch(item.title, searchTerm, wholeWordOnly);
    }
  });
}

// ============================================================================
// INDEXEDDB DATABASE LOGIC
// ============================================================================
const DB_NAME = 'ytplCache';
const DB_VER = 2;
const STORE_PLAYLISTS = 'playlists';
const STORE_PAGES = 'pages';

const openDB = () => new Promise((resolve, reject) => {
  if (typeof window === 'undefined') return resolve(null); // SSR Guard
  const req = indexedDB.open(DB_NAME, DB_VER);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'playlistId' });
    if (!db.objectStoreNames.contains(STORE_PAGES)) db.createObjectStore(STORE_PAGES, { keyPath: ['playlistId', 'pageToken'] });
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function getPlaylistMeta(db, playlistId) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_PLAYLISTS, 'readonly').objectStore(STORE_PLAYLISTS).get(playlistId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePlaylistMeta(db, playlistId, meta) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_PLAYLISTS, 'readwrite').objectStore(STORE_PLAYLISTS).put({ playlistId, ...meta, lastUpdated: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getPage(db, playlistId, pageToken) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_PAGES, 'readonly').objectStore(STORE_PAGES).get([playlistId, pageToken]);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePage(db, playlistId, pageToken, items, nextPageToken) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_PAGES, 'readwrite').objectStore(STORE_PAGES).put({ playlistId, pageToken, items, nextPageToken });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllPlaylists(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_PLAYLISTS, 'readonly').objectStore(STORE_PLAYLISTS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deletePlaylistCache(db, playlistId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PLAYLISTS, STORE_PAGES], 'readwrite');
    tx.objectStore(STORE_PLAYLISTS).delete(playlistId);
    const req = tx.objectStore(STORE_PAGES).openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.key[0] === playlistId) cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearEntireCache(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PLAYLISTS, STORE_PAGES], 'readwrite');
    tx.objectStore(STORE_PLAYLISTS).clear();
    tx.objectStore(STORE_PAGES).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function extractPlaylistId(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    // If it looks like a direct ID instead of a full URL, return it directly
    if (!url.includes('youtube.com') && !url.includes('http')) {
      return url.trim();
    }
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes('youtube.com')) return null;
    return parsedUrl.searchParams.get("list");
  } catch (e) {
    if (url && typeof url === 'string' && !url.includes('.')) return url.trim();
    return null;
  }
}

// ============================================================================
// MEMOIZED ROW COMPONENT
// ============================================================================
const VideoRow = React.memo(({ item }) => {
  return (
    <div className="video-item">
      <div className="thumbnail-container">
        {item.thumbnailUrl && <img src={item.thumbnailUrl} alt={item.title} loading="lazy" />}
      </div>
      
      <div className="video-info">
        {item.videoUrl ? (
          <a href={item.videoUrl} target="_blank" rel="noopener noreferrer">{item.title}</a>
        ) : (
          <strong>{item.title}</strong>
        )}
        
        <div className="channel-info-container">
          <span className="youtube-channel-text">youtube channel: </span>
          {item.channelId ? (
            <a href={`https://www.youtube.com/channel/${item.channelId}`} className="channel-link" target="_blank" rel="noopener noreferrer">
              {item.channelTitle}
            </a>
          ) : (
            <span className="channel-name">{item.channelTitle}</span>
          )}
          
          {item.channelHandle && (
            <> — <a href={`https://www.youtube.com/${item.channelHandle}`} className="channel-link" target="_blank" rel="noopener noreferrer">{item.channelHandle}</a></>
          )}
        </div>
      </div>
    </div>
  );
});

// Setting a display name is good practice for React DevTools
VideoRow.displayName = 'VideoRow';

// ============================================================================
// MAIN REACT COMPONENT
// ============================================================================
export default function App() {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [wholeWordMatch, setWholeWordMatch] = useState(false);
  const [searchMode, setSearchMode] = useState('title');

  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [activeWholeWordMatch, setActiveWholeWordMatch] = useState(false);
  const [activeSearchMode, setActiveSearchMode] = useState('title');

  const [allItems, setAllItems] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('info'); 
  const [counterText, setCounterText] = useState('');
  const [playlistTotal, setPlaylistTotal] = useState(null);

  const [isCachedSearch, setIsCachedSearch] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cachedPlaylists, setCachedPlaylists] = useState([]);

  const abortRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Tab") {
        const focusable = [...document.querySelectorAll('[tabIndex]:not([tabIndex="-1"])')].sort((a, b) => a.tabIndex - b.tabIndex);
        if (focusable.length === 0) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } 
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // URL Parameter Detection and Auto-Search on Mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramPlaylistId = params.get('playlistId');
    const paramQ = params.get('q');
    const paramCheckbox = params.get('checkbox');
    const paramSearchBy = params.get('searchby');

    if (paramPlaylistId) {
      // Map URL variants back to your internal application searchMode states
      let internalSearchMode = 'title';
      if (paramSearchBy === 'titleAndDesc') internalSearchMode = 'both';
      if (paramSearchBy === 'desc') internalSearchMode = 'description';
      if (paramSearchBy === 'channel') internalSearchMode = 'channel';

      const isChecked = paramCheckbox === 'true';

      // Reconstruct the full URL if it's just an ID
      const fullPlaylistUrl = paramPlaylistId.startsWith('http') 
        ? paramPlaylistId 
        : `https://www.youtube.com/playlist?list=${paramPlaylistId}`;

      // Update interactive states so element values visibly sync up
      setPlaylistUrl(fullPlaylistUrl);
      if (paramQ) setSearchTerm(paramQ);
      setWholeWordMatch(isChecked);
      setSearchMode(internalSearchMode);

      // Execute auto-search with parsed parameters
      handleSearch(null, {
        playlistUrl: fullPlaylistUrl,
        searchTerm: paramQ || '',
        wholeWordMatch: isChecked,
        searchMode: internalSearchMode
      });
    }
  }, []);

  const showStatus = (msg, type = 'info') => {
    if (type !== 'error') {
      setStatusMessage(''); // Hide message for info/success/warning
      return;
    }
    setStatusMessage(msg);
    setStatusType(type);
  };

  // --- MAIN SEARCH & CACHE LOGIC ---
  const handleSearch = async (e, overrideParams = null) => {
    if (e) e.preventDefault();
    abortRef.current = false;

    // Use URL parameters if overriding on page load, otherwise fall back to standard element states
    const currentPlaylistUrl = overrideParams ? overrideParams.playlistUrl : playlistUrl;
    const currentSearchTerm = overrideParams ? overrideParams.searchTerm : searchTerm;
    const currentWholeWordMatch = overrideParams ? overrideParams.wholeWordMatch : wholeWordMatch;
    const currentSearchMode = overrideParams ? overrideParams.searchMode : searchMode;

    setActiveSearchTerm(currentSearchTerm);
    setActiveWholeWordMatch(currentWholeWordMatch);
    setActiveSearchMode(currentSearchMode);
    
    const listId = extractPlaylistId(currentPlaylistUrl);
    if (!listId) {
      showStatus('Invalid YouTube Playlist URL', 'error');
      return;
    }

    // ONLY update the browser URL if the search was manually triggered by clicking the search button
    if (!overrideParams) {
      const params = new URLSearchParams();
      if (currentPlaylistUrl) params.set('playlistId', listId);
      if (currentSearchTerm) params.set('q', currentSearchTerm);
      if (currentWholeWordMatch) params.set('checkbox', 'true');
      
      // Map internal search modes back to your requested URL parameter variants
      let urlSearchBy = 'title';
      if (currentSearchMode === 'both') urlSearchBy = 'titleAndDesc';
      if (currentSearchMode === 'description') urlSearchBy = 'desc';
      if (currentSearchMode === 'channel') urlSearchBy = 'channel';
      params.set('searchby', urlSearchBy);

      window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
    }

    setIsSearching(true);
    setAllItems([]);
    setIsCachedSearch(false); // Reset this for every new search
    setCounterText('Checking cache...');
    showStatus('');
    setPlaylistTotal(null);
    let loadedItemsCount = 0;

    try {
      const db = await openDB();
      const meta = await getPlaylistMeta(db, listId);
      let pageToken = 'START';
      let fetchedItemsAccumulator = [];

      // 1. CHECK CACHE
      if (meta && meta.fullyCached) {
        setIsCachedSearch(true); // Tell the app we are using cached data
        showStatus('Loading from cache...', 'info');
        setPlaylistTotal(meta.totalResults);

        // Update document title from cache
        const queryStr = currentSearchTerm ? `search: ${currentSearchTerm} | ` : '';
        document.title = `${queryStr}playlist: ${meta.playlistTitle || 'Unknown Title'} | youtube playlist search`;
        
        while (pageToken) {
          if (abortRef.current) break;
          const pageData = await getPage(db, listId, pageToken);
          if (!pageData) break;
          
          fetchedItemsAccumulator = [...fetchedItemsAccumulator, ...pageData.items];
          loadedItemsCount = fetchedItemsAccumulator.length;
          setAllItems([...fetchedItemsAccumulator]);
          setCounterText(`Loaded ${loadedItemsCount} / ${meta.totalResults || '?'} videos from cache...`);
          
          pageToken = pageData.nextPageToken;
        }
        
        if (!abortRef.current) showStatus('Finished loading playlist from cache.', 'success');
        else showStatus('Loading stopped by user.', 'warning');
        
        setIsSearching(false);
        return;
      }

      // 2. FETCH FROM NEXT.JS BACKEND (STREAMING)
      showStatus('Fetching playlist from YouTube...', 'info');
      let totalExpected = meta?.totalResults || 0;
      let fetchedPlaylistTitle = meta?.playlistTitle || null;
      let fetchedChannelTitle = meta?.channelTitle || null;
      let currentPageToken = 'START';

      // Open a single connection to the server
      const response = await fetch(`/api/fetchPlaylist?playlistId=${listId}`);
      if (!response.ok) throw new Error(`Server Error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partialLine = '';

      while (true) {
        if (abortRef.current) {
          reader.cancel();
          showStatus('Search stopped by user.', 'warning');
          break;
        }

        // Read the stream chunk by chunk as Vercel pushes it
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = (partialLine + chunkText).split('\n');
        partialLine = lines.pop(); // Save incomplete line for next iteration

        for (const line of lines) {
          if (!line.trim()) continue;
          
          const result = JSON.parse(line);
          if (result.error) throw new Error(result.error);

          // Update metadata only on the first chunk
          if (currentPageToken === 'START') {
            totalExpected = result.totalResults || 0;
            setPlaylistTotal(totalExpected);
            fetchedPlaylistTitle = result.playlistTitle || 'Unknown Title';
            fetchedChannelTitle = result.playlistChannelTitle || 'Unknown Channel';

            // Update document title from stream
            const queryStr = currentSearchTerm ? `search: ${currentSearchTerm} | ` : '';
            document.title = `${queryStr}playlist: ${fetchedPlaylistTitle} | youtube playlist search`;

            await savePlaylistMeta(db, listId, { 
              fullyCached: false, 
              totalResults: totalExpected,
              playlistTitle: fetchedPlaylistTitle,
              channelTitle: fetchedChannelTitle
            });
          }

          // Save the current chunk to IndexedDB cache
          await savePage(db, listId, currentPageToken, result.items, result.nextPageToken);
          currentPageToken = result.nextPageToken;

          // Update the UI state instantly
          fetchedItemsAccumulator = [...fetchedItemsAccumulator, ...result.items];
          loadedItemsCount = fetchedItemsAccumulator.length;
          setAllItems([...fetchedItemsAccumulator]);
          setCounterText(`Fetched ${loadedItemsCount} / ${totalExpected} videos...`);
        }
      }

      if (!abortRef.current) {
        await savePlaylistMeta(db, listId, { 
          fullyCached: true, 
          totalResults: totalExpected,
          playlistTitle: fetchedPlaylistTitle,
          channelTitle: fetchedChannelTitle
        });
        showStatus('', 'success');
      }

    } catch (err) {
      console.error(err);
      showStatus(`Error: ${err.message}`, 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    setIsSearching(false);
  };

  // --- MODAL & CACHE MANAGEMENT ---
  
  const loadModalData = async () => {
    try {
      const db = await openDB();
      const lists = await getAllPlaylists(db);
      setCachedPlaylists(lists);
    } catch (e) { console.error(e); }
  };

  const handleOpenModal = (e) => {
    e.preventDefault();
    setIsModalOpen(true);
    loadModalData();
  };

  const handleDeleteCache = async (listId) => {
    try {
      const db = await openDB();
      await deletePlaylistCache(db, listId);
      loadModalData();
    } catch (e) { alert("Failed to delete cache item."); }
  };

  const handleClearAllCache = async () => {
    if (!window.confirm("Are you sure you want to clear the ENTIRE playlist cache?")) return;
    try {
      const db = await openDB();
      await clearEntireCache(db);
      loadModalData();
    } catch (e) { alert("Failed to clear cache."); }
  };

  // Change this block:
  const filteredItems = useMemo(() => {
    return filterItems(allItems, activeSearchTerm, activeWholeWordMatch, activeSearchMode);
  }, [allItems, activeSearchTerm, activeWholeWordMatch, activeSearchMode]);

  const searchPlaceholders = {
  title: "Search videos by title",
  description: "Search videos by description",
  both: "Search videos by both title and description",
  channel: "Search videos by channel name or @handle",
  };

  return (
    <div className="container">
      
      <a href="#" id="clearCacheLink" tabIndex="10" onClick={handleOpenModal}><b>clear cache</b></a>
      <h1>youtube playlist video search</h1>

      <form id="searchForm" onSubmit={handleSearch}>
        <label htmlFor="playlistUrl">YouTube Playlist Link:</label>
        <input type="text" id="playlistUrl" placeholder="Paste playlist URL" required autoFocus tabIndex="1" value={playlistUrl} onChange={(e) => setPlaylistUrl(e.target.value)} />
        
        <label htmlFor="searchTerm">Search Term:</label>
        <input type="text" id="searchTerm" placeholder="enter your search here" tabIndex="2" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <p className="search-filter-info">{searchPlaceholders[searchMode]}</p>
        
        <div className="checkbox-group">
          <input type="checkbox" id="wholeWordMatch" tabIndex="3" checked={wholeWordMatch} onChange={(e) => setWholeWordMatch(e.target.checked)} />
          <label htmlFor="wholeWordMatch">Match whole word</label>
        </div>
        
        <div className="search-mode-group">
          <p style={{ fontSize: '22px' }}>search by:</p>
          <label><input type="radio" name="searchMode" value="title" tabIndex="4" checked={searchMode === 'title'} onChange={() => setSearchMode('title')} /> video title (default)</label>
          <label><input type="radio" name="searchMode" value="both" tabIndex="5" checked={searchMode === 'both'} onChange={() => setSearchMode('both')} /> video description and title</label>
          <label><input type="radio" name="searchMode" value="description" tabIndex="6" checked={searchMode === 'description'} onChange={() => setSearchMode('description')} /> video description</label>
          <label><input type="radio" name="searchMode" value="channel" tabIndex="7" checked={searchMode === 'channel'} onChange={() => setSearchMode('channel')} /> channel name</label>
        </div>
        
        <div className="search-controls">
          <button type="submit" id="searchBtn" tabIndex="8" disabled={isSearching}>{isSearching ? 'Searching...' : 'Search'}</button>
          <button type="button" id="stopBtn" tabIndex="9" disabled={!isSearching} onClick={handleStop}>Stop</button>
        </div>
      </form>

      <p id="counterText">
        {isSearching ? (
          allItems.length === 0 ? counterText : (
            playlistTotal && Number.isFinite(playlistTotal) 
              ? `Searching ${allItems.length} of ${playlistTotal} videos` 
              : `Searching ${allItems.length} videos...`
          )
        ) : (
          allItems.length > 0 ? `Done — searched ${allItems.length} videos | ${filteredItems.length} videos found` : ''
        )}
      </p>
      <p id="statusMessage" className={`${statusType}-msg`}>{statusMessage}</p>

      <div id="results" className="video-list">
        {isCachedSearch ? (
          /* Render a native list for cached items */
          filteredItems.map((item, index) => (
            <VideoRow key={`${item.videoId || index}`} item={item} />
          ))
        ) : (
          /* Render Virtuoso for streaming network items */
          <Virtuoso
            useWindowScroll
            data={filteredItems}
            itemContent={(index, item) => <VideoRow item={item} />}
          />
        )}
      </div>

      {isModalOpen && (
        <div id="cacheModal" className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button id="closeModalBtn" className="modal-close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            <h2>Cached Playlists</h2>
            <p>You can clear the cache for individual playlists here.</p>
            <ul id="cachedPlaylistsList" className="cached-playlist-list">
              {cachedPlaylists.length === 0 ? (
                <li className="empty-result">No playlists are cached.</li>
              ) : (
                cachedPlaylists.map(list => (
                  <li key={list.playlistId} className="cached-playlist-item">
                    <div className="cached-playlist-info">
                      <strong>{list.playlistTitle || 'Unknown Title'}</strong>
                      <span>By: {list.channelTitle || 'Unknown Channel'}</span>
                      <span className="playlist-url">https://www.youtube.com/playlist?list={list.playlistId}</span>
                    </div>
                    <button className="delete-cache-btn" onClick={() => handleDeleteCache(list.playlistId)}>Delete</button>
                  </li>
                ))
              )}
            </ul>
            <div className="modal-footer"><button id="clearAllCacheBtn" className="clear-all-btn" onClick={handleClearAllCache} disabled={cachedPlaylists.length === 0}>Clear Entire Cache</button></div>
          </div>
        </div>
      )}
    </div>
  );
}