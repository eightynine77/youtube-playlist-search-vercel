import { filterItems } from './searchFilter.js';

let allFetchedItems = [];
let currentSearchTerm = '';
let currentPlaylistUrl = '';
let isSearching = false;

const resultsContainer = document.getElementById('results');
const form = document.getElementById('searchForm');

form.addEventListener('submit', async function (event) {
    event.preventDefault();
    
    isSearching = false; 
    
    allFetchedItems = [];
    resultsContainer.innerHTML = '<li class="loading-message">Loading...</li>';

    currentPlaylistUrl = document.getElementById('playlistUrl').value.trim();
    currentSearchTerm = document.getElementById('searchTerm').value.trim().toLowerCase();

    if (!currentPlaylistUrl) {
        resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
        return;
    }

    isSearching = true;
    await progressiveSearch();
});

async function progressiveSearch() {
    let nextPageToken = '';
    let initialFetch = true;

    do {
        if (!isSearching) {
            return; 
        }

        const { items, nextToken, error } = await fetchPlaylistPage(currentPlaylistUrl, nextPageToken);

        if (error) {
            resultsContainer.innerHTML = `<li class="error-message">${error}</li>`;
            isSearching = false;
            return;
        }

        if (initialFetch) {
            resultsContainer.innerHTML = '';
            initialFetch = false;
        }
        
        if (items && items.length > 0) {
            allFetchedItems = allFetchedItems.concat(items);
        }

        renderResults();
        
        nextPageToken = nextToken;

    } while (nextPageToken);

    if (allFetchedItems.length === 0) {
        resultsContainer.innerHTML = '<li>No videos found in this playlist.</li>';
    } else if (filterItems(allFetchedItems, currentSearchTerm, document.getElementById('wholeWordMatch')?.checked, document.querySelector('input[name="searchMode"]:checked')?.value || 'title').length === 0) {
        resultsContainer.innerHTML = '<li>No videos found matching your criteria.</li>';
    }

    isSearching = false;
}

async function fetchPlaylistPage(playlistUrl, pageToken = '') {
    try {
        const apiUrl = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&pageToken=${encodeURIComponent(pageToken)}`;
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (!response.ok || data.error) {
            return { error: data.error || `Failed to fetch playlist data (Status: ${response.status})` };
        }

        return {
            items: data.items || [],
            nextToken: data.nextPageToken || null
        };
    } catch (err) {
        console.error("Fetch Error:", err);
        return { error: `Network or fetch error: ${err.message}` };
    }
}

function renderResults() {
    const matchWholeWord = document.getElementById('wholeWordMatch')?.checked;
    const selectedMode = document.querySelector('input[name="searchMode"]:checked')?.value || 'title';
    const filtered = filterItems(allFetchedItems, currentSearchTerm, matchWholeWord, selectedMode);

    resultsContainer.innerHTML = '';

    if (filtered.length > 0) {
        filtered.forEach(item => {
            const { title, thumbnailUrl, videoUrl, channelTitle, channelId } = item; // Get channelId
            if (!title || !thumbnailUrl || !videoUrl) {
                console.warn("Skipping item with missing data:", item);
                return;
            }
            const li = document.createElement('li');
            li.className = 'video-item';
            li.innerHTML = `
                <img src="${thumbnailUrl}" alt="${title} thumbnail" loading="lazy" />
                <div class="video-info">
                    <u><a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${title}</a></u><br><br>
                    ${channelId ? `<a href="https://www.youtube.com/channel/${channelId}" class="channel-link" target="_blank" rel="noopener noreferrer">${channelTitle || ''}</a>` : `<u><p class="channel-name">${channelTitle || ''}</p></u>`}
                </div>
            `;
            resultsContainer.appendChild(li);
        });
    }
}

const playlistUrlInput = document.getElementById('playlistUrl');
playlistUrlInput?.addEventListener('input', () => {
    if (!playlistUrlInput.value) {
        playlistUrlInput.setCustomValidity('Please enter a playlist URL.');
    } else {
        playlistUrlInput.setCustomValidity('');
    }
});