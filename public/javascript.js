import { filterItems } from './searchFilter.js';

// --- helper DOM refs (adjust selectors to your markup) ---
const playlistInput = document.getElementById('playlistUrl'); // your playlist URL input
const maxPagesInput = document.getElementById('maxPages');   // the new input
const searchBtn = document.getElementById('searchBtn');      // your search button
const resultsContainer = document.getElementById('results'); // where results are shown
const fetchStatus = document.getElementById('fetchStatus');  // progress display

// --- simple spinner utility ---
function setLoading(isLoading, text = '') {
  if (isLoading) {
    fetchStatus.innerHTML = `<span>Loading… ${text}</span>`;
  } else {
    if (!text) fetchStatus.textContent = '';
    else fetchStatus.innerHTML = text;
  }
}

// --- safe JSON parse for possible non-JSON responses ---
async function safeParseJSON(response) {
  const text = await response.text().catch(() => null);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    // Not JSON — return the raw text inside an object for error display
    return { __rawText: text };
  }
}

// --- fetch playlist items from server API ---
// returns { items:[], fetchedPages, requestedMaxPages } or throws
async function fetchPlaylistFromServer(playlistUrl, maxPages = 20) {
  const url = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&maxPages=${encodeURIComponent(maxPages)}`;
  const resp = await fetch(url);
  // attempt robust parse
  const parsed = await safeParseJSON(resp);
  if (!resp.ok) {
    const errMsg = parsed && parsed.error ? parsed.error : (parsed && parsed.__rawText ? parsed.__rawText : `HTTP ${resp.status}`);
    throw new Error(`Server error: ${errMsg}`);
  }
  if (parsed && parsed.__rawText) {
    // server returned non-JSON text (unexpected)
    throw new Error(`Server returned non-JSON: ${parsed.__rawText.slice(0,300)}`);
  }
  return parsed;
}

// --- render single item (customize markup to your liking) ---
function renderItem(item) {
  const div = document.createElement('div');
  div.className = 'search-result-item';
  const handleHtml = item.channelHandle ? `<span class="channel-handle">${item.channelHandle}</span>` : '';
  div.innerHTML = `
    <a href="${item.videoUrl}" target="_blank" rel="noopener noreferrer">
      <img src="${item.thumbnailUrl || ''}" alt="" style="width:120px; height:auto; display:inline-block; vertical-align:middle; margin-right:8px" />
    </a>
    <div style="display:inline-block; vertical-align:middle; max-width:70%">
      <div class="title"><a href="${item.videoUrl}" target="_blank">${escapeHtml(item.title)}</a></div>
      <div class="meta">
        <strong class="channel">${escapeHtml(item.channelTitle || 'Unknown')}</strong>
        ${handleHtml}
      </div>
      <div class="desc">${escapeHtml(item.description || '').slice(0,200)}</div>
    </div>
  `;
  return div;
}

// small helper to prevent injection
function escapeHtml(s='') {
  return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
}

// --- entry point for search button ---
searchBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  const playlistUrl = playlistInput.value.trim();
  if (!playlistUrl) {
    fetchStatus.textContent = 'Enter a playlist URL first.';
    return;
  }

  const maxPages = Math.min(50, Math.max(1, parseInt(maxPagesInput.value || '20', 10)));
  resultsContainer.innerHTML = '';
  setLoading(true, `requesting up to ${maxPages} pages (this may take a few seconds)`);

  try {
    const resp = await fetchPlaylistFromServer(playlistUrl, maxPages);
    // server returns items + fetchedPages
    const items = resp.items || [];
    const fetched = resp.fetchedPages || 0;
    setLoading(false, `Fetched pages: ${fetched}. Videos returned: ${items.length}`);

    // Render items (simple)
    if (!items.length) {
      resultsContainer.innerHTML = '<div>No videos found.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const it of items) {
      frag.appendChild(renderItem(it));
    }
    resultsContainer.appendChild(frag);

  } catch (err) {
    setLoading(false, `Error: ${err.message}`);
    console.error('Fetch or parse error:', err);
  }
});