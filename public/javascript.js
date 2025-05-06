import { filterItems } from './searchFilter.js';

let allFetchedItems = [];
let nextPageToken = null;
let currentSearchTerm = '';
let currentPlaylistUrl = '';
let currentFetchController = null; // To abort previous fetches

const resultsContainer = document.getElementById('results');
const form = document.getElementById('searchForm');
const searchOptionsBtn = document.getElementById('searchOptionsBtn');
const searchOptionsDiv = document.getElementById('searchOptionsDiv');

const showAllBtn = document.createElement('button');
showAllBtn.id = 'showAllBtn'; // Added an ID for easier selection/styling if needed
showAllBtn.textContent = 'Load More / Show All Matching';
showAllBtn.style.display = 'none';
showAllBtn.addEventListener('click', handleShowAll);
// Insert showAllBtn after the form but before the results for better flow
form.insertAdjacentElement('afterend', showAllBtn);


// Toggle search options visibility
searchOptionsBtn.addEventListener('click', () => {
  searchOptionsDiv.style.display = searchOptionsDiv.style.display === 'none' ? 'block' : 'none';
});

form.addEventListener('submit', async function (event) {
  event.preventDefault();

  // Abort any ongoing fetch
  if (currentFetchController) {
    currentFetchController.abort();
  }
  currentFetchController = new AbortController();
  const signal = currentFetchController.signal;

  allFetchedItems = [];
  nextPageToken = null;
  resultsContainer.innerHTML = '<li class="loading-message">Loading...</li>';
  showAllBtn.style.display = 'none';
  showAllBtn.disabled = false;
  showAllBtn.textContent = 'Load More / Show All Matching';

  currentPlaylistUrl = document.getElementById('playlistUrl').value.trim();
  currentSearchTerm = document.getElementById('searchTerm').value.trim(); // Keep original case for display, convert to lower in filter

  if (!currentPlaylistUrl) {
    resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
    return;
  }

  // Fetch initial page
  fetchAndRenderPlaylist(currentPlaylistUrl, '', signal);
});

async function fetchAndRenderPlaylist(playlistUrl, pageToken = '', signal) {
    if (pageToken === '') { // If it's a new search (not "load more")
        allFetchedItems = []; // Clear previous items
        resultsContainer.innerHTML = '<li class="loading-message">Loading initial videos...</li>';
    } else {
        showAllBtn.textContent = 'Loading more...';
        showAllBtn.disabled = true;
    }

    try {
        const { items, nextToken, error } = await fetchPlaylistPage(playlistUrl, pageToken, signal);

        if (signal.aborted) {
            console.log("Fetch aborted for playlist:", playlistUrl);
            if (allFetchedItems.length === 0 && pageToken === '') { // If initial fetch aborted before any results
                 resultsContainer.innerHTML = '<li class="info-message">Search cancelled.</li>';
            }
            return; // Stop processing if fetch was aborted
        }

        if (error) {
            resultsContainer.innerHTML = `<li class="error-message">${error}</li>`;
            showAllBtn.style.display = 'none';
            return;
        }

        allFetchedItems = allFetchedItems.concat(items || []);
        nextPageToken = nextToken;

        renderResults(); // This will now apply filters to allFetchedItems

        showAllBtn.disabled = false;
        showAllBtn.textContent = 'Load More / Show All Matching';
        if (nextPageToken) {
            showAllBtn.style.display = 'inline-block';
        } else {
            showAllBtn.style.display = 'none';
             if (allFetchedItems.length > 0 && resultsContainer.children.length === 0) {
                // This case means all items were fetched, but none matched current filter
                resultsContainer.innerHTML = '<li>No videos found matching your current filter criteria from the loaded items.</li>';
            } else if (allFetchedItems.length === 0 && !pageToken) { // No items from first fetch
                resultsContainer.innerHTML = '<li>No videos found in this playlist.</li>';
            }
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('Fetch aborted by user.');
             if (allFetchedItems.length === 0 && pageToken === '') {
                 resultsContainer.innerHTML = '<li class="info-message">Search cancelled.</li>';
            }
            return;
        }
        console.error("Error in fetchAndRenderPlaylist:", err);
        resultsContainer.innerHTML = `<li class="error-message">An unexpected error occurred: ${err.message}</li>`;
        showAllBtn.style.display = 'none';
    }
}


async function fetchPlaylistPage(playlistUrl, pageToken = '', signal) {
  try {
    const apiUrl = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&pageToken=${encodeURIComponent(pageToken)}`;
    const response = await fetch(apiUrl, { signal }); // Pass signal to fetch
    const data = await response.json();

    if (!response.ok || data.error) {
      return { error: data.error || `Failed to fetch playlist data (Status: ${response.status})` };
    }

    return {
      items: data.items || [],
      nextToken: data.nextPageToken || null
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('Fetch operation was aborted.');
      return { error: 'Fetch aborted by user.', aborted: true };
    }
    console.error("Fetch Error in fetchPlaylistPage:", err);
    return { error: `Network or fetch error: ${err.message}` };
  }
}

function renderResults() {
  const matchWholeWord = document.getElementById('wholeWordMatch')?.checked;
  const descriptionSearchMode = document.querySelector('input[name="descriptionSearch"]:checked')?.value || "titleOnly";

  // currentSearchTerm is already fetched from input, no need to toLowerCase() here yet, filterItems will do it.
  const filtered = filterItems(allFetchedItems, currentSearchTerm, matchWholeWord, descriptionSearchMode);

  if (resultsContainer.firstChild && resultsContainer.firstChild.classList && (resultsContainer.firstChild.classList.contains('loading-message') || resultsContainer.firstChild.classList.contains('error-message') || resultsContainer.firstChild.classList.contains('info-message'))) {
      resultsContainer.innerHTML = ''; // Clear loading/error/info messages before appending results
  }


  if (filtered.length === 0) {
    // If it's the initial load (not from "show all") and no items matched
    if (allFetchedItems.length > 0 && !nextPageToken && !showAllBtn.disabled) { // All items loaded, but filter yields nothing
        resultsContainer.innerHTML = '<li>No videos found matching your current filter criteria from the loaded items.</li>';
    } else if (allFetchedItems.length === 0 && !nextPageToken) { // Playlist is empty or first fetch yielded nothing
        // The fetchAndRenderPlaylist handles initial empty messages
    }
    // The visibility of showAllBtn is handled in fetchAndRenderPlaylist
  } else {
    // If resultsContainer was cleared of loading message, or it's a subsequent render
    if(document.querySelector('input[name="descriptionSearch"]:checked')?.value !== "titleOnly" || currentSearchTerm){
        // If we are actively filtering, clear previous results before adding new filtered ones
        // Only clear if not in loading state from handleShowAll
        if(!showAllBtn.disabled || (showAllBtn.disabled && showAllBtn.textContent !== 'Loading all items...')) {
            resultsContainer.innerHTML = '';
        }
    }


    filtered.forEach(item => {
      // Avoid re-adding items if they are already in the DOM.
      // This check is basic, for more complex scenarios, consider item IDs.
      // For now, with full re-render on new filter or data, this is less critical,
      // but good for partial updates if implemented later.
      // Let's assume full re-render based on current logic to simplify.
      
      const { title, thumbnailUrl, videoUrl, description } = item;
      if (!title || !videoUrl) { // Thumbnail can be optional
        console.warn("Skipping item with missing title or videoUrl:", item);
        return;
      }
      const li = document.createElement('li');
      li.className = 'video-item';
      li.innerHTML = `
        <img src="${thumbnailUrl || 'placeholder.png'}" alt="${title} thumbnail" loading="lazy" onerror="this.style.display='none'"/>
        <div class="video-info">
          <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
          ${description ? `<p class="description">${highlightSearchTerm(description, currentSearchTerm, matchWholeWord)}</p>` : ''}
        </div>
      `;
      resultsContainer.appendChild(li);
    });
  }

    // Update visibility of "Load More" button
    if (nextPageToken) {
        showAllBtn.style.display = 'inline-block';
        showAllBtn.disabled = false;
        showAllBtn.textContent = 'Load More / Show All Matching';
    } else {
        showAllBtn.style.display = 'none';
        if (allFetchedItems.length > 0 && resultsContainer.children.length === 0) {
             resultsContainer.innerHTML = '<li>No videos found matching your current filter criteria from all loaded items.</li>';
        }
    }
}

// Helper function to highlight search term in description (optional enhancement)
function highlightSearchTerm(text, term, wholeWordOnly) {
    if (!term || !text) return text;
    const searchTerm = escapeRegExp(term);
    const regex = wholeWordOnly
        ? new RegExp(`(\\b${searchTerm}\\b)`, 'gi')
        : new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}


async function handleShowAll(event) {
  event.preventDefault();
  showAllBtn.disabled = true;
  showAllBtn.textContent = 'Loading all items...';

  let fetchError = null;
  currentFetchController = new AbortController(); // New controller for this operation
  const signal = currentFetchController.signal;

  while (nextPageToken) {
    if (signal.aborted) {
        console.log("handleShowAll aborted.");
        fetchError = "Fetch aborted by user.";
        break;
    }
    const { items, nextToken: newNextToken, error, aborted } = await fetchPlaylistPage(currentPlaylistUrl, nextPageToken, signal);

    if (aborted) {
        fetchError = "Fetch aborted by user.";
        break;
    }
    if (error) {
      // Don't alert for each page, collect error and show once or log
      console.warn(`Failed to load a page of videos: ${error}`);
      fetchError = error; // Keep last error
      // Optionally break if one page fails, or try to continue
      // For now, let's stop if a page fails to avoid many alerts
      nextPageToken = null; // Stop fetching
      break;
    }

    allFetchedItems = allFetchedItems.concat(items || []);
    nextPageToken = newNextToken;
    // No need to call renderResults() inside the loop for "Show All"
    // as it can be slow. Render once after all data is fetched or if search term is present.
  }

  // Always render results after loop finishes or breaks
  renderResults();

  showAllBtn.disabled = false;
  showAllBtn.textContent = 'Load More / Show All Matching';

  if (fetchError) {
    // Display a consolidated error message if any page failed during "show all"
    const errorLi = document.createElement('li');
    errorLi.className = 'error-message';
    errorLi.textContent = `Error loading all videos: ${fetchError}. Some items may be missing.`;
    resultsContainer.insertAdjacentElement('afterbegin', errorLi); // Add to top
  }

  if (!nextPageToken) { // All items loaded
    showAllBtn.style.display = 'none';
    if (allFetchedItems.length > 0 && resultsContainer.children.length === 0){
        resultsContainer.innerHTML = '<li>No videos found matching your current filter criteria from all loaded items.</li>';
    }
  } else {
      showAllBtn.style.display = 'inline-block'; // Still more to load if loop was exited early due to error but nextpagetoken existed
  }
}


// Add event listeners to filter options to re-render results when they change
document.getElementById('wholeWordMatch').addEventListener('change', renderResults);
document.querySelectorAll('input[name="descriptionSearch"]').forEach(radio => {
  radio.addEventListener('change', renderResults);
});
// Also re-filter if search term changes (e.g. user types and then changes filter option without new submit)
document.getElementById('searchTerm').addEventListener('input', () => {
    // Debounce this if it causes performance issues on very fast typing
    // For now, just update currentSearchTerm and re-render if items are already loaded
    if (allFetchedItems.length > 0) {
        currentSearchTerm = document.getElementById('searchTerm').value.trim();
        renderResults();
    }
});


const playlistUrlInput = document.getElementById('playlistUrl');
playlistUrlInput?.addEventListener('input', () => {
  if (!playlistUrlInput.value.trim()) {
    playlistUrlInput.setCustomValidity('Please enter a YouTube playlist URL.');
  } else if (!extractPlaylistId(playlistUrlInput.value.trim())) { // Use the same validation logic
    playlistUrlInput.setCustomValidity("Invalid playlist URL. Example: https://www.youtube.com/playlist?list=ID");
  }
  else {
    playlistUrlInput.setCustomValidity('');
  }
  playlistUrlInput.reportValidity(); // Show validation message immediately
});

// Helper function (client-side duplicate for quick validation, server-side is canonical)
function extractPlaylistId(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    const patterns = [ /list=([\w-]+)/, /playlist\?list=([\w-]+)/ ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1] && /^[a-zA-Z0-9_-]+$/.test(match[1])) return match[1];
    }
    const parsedUrl = new URL(url);
    if ((parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be'))) {
        const listId = parsedUrl.searchParams.get("list");
        if (listId && /^[a-zA-Z0-9_-]+$/.test(listId)) return listId;
    }
    return null;
  } catch (e) { return null; }
}