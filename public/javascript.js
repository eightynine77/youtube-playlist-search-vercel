import { filterItems } from './searchFilter.js';

let allFetchedItems = [];
let currentSearchTerm = '';
let currentPlaylistUrl = '';
let isSearching = false;

const resultsContainer = document.getElementById('results');
const statusMessageEl = document.getElementById('statusMessage'); 
const form = document.getElementById('searchForm');

function updateStatus(message, isError = false) {
    statusMessageEl.textContent = message;
    statusMessageEl.className = isError ? 'status-error' : 'status-info';
}

form.addEventListener('submit', async function (event) {
    event.preventDefault();
    isSearching = false; 
    
    allFetchedItems = [];
    resultsContainer.innerHTML = ''; 
    updateStatus('Loading...'); 

    currentPlaylistUrl = document.getElementById('playlistUrl').value.trim();
    currentSearchTerm = document.getElementById('searchTerm').value.trim().toLowerCase();

    if (!currentPlaylistUrl) {
        updateStatus('Please enter a playlist URL.', true);
        return;
    }

    isSearching = true;
    await progressiveSearch();
});

async function progressiveSearch() {
    let nextPageToken = '';

    do {
        if (!isSearching) {
            updateStatus(''); 
            return; 
        }

        const { items, nextToken, error } = await fetchPlaylistPage(currentPlaylistUrl, nextPageToken);

        if (error) {
            updateStatus(error, true); 
            isSearching = false;
            return;
        }
        
        if (items && items.length > 0) {
            allFetchedItems = allFetchedItems.concat(items);
        }
        
        renderResults(); 
        
        nextPageToken = nextToken;

    } while (nextPageToken);

    if (allFetchedItems.length === 0) {
        updateStatus('No videos found in this playlist.');
    } else if (filterItems(allFetchedItems, currentSearchTerm, document.getElementById('wholeWordMatch')?.checked, document.querySelector('input[name="searchMode"]:checked')?.value || 'title').length === 0) {
        updateStatus('No videos found matching your criteria.');
    } else {
        updateStatus(''); 
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
            const { title, thumbnailUrl, videoUrl, channelTitle, channelId } = item;
            if (!title || !thumbnailUrl || !videoUrl) {
                console.warn("Skipping item with missing data:", item);
                return;
            }
            const li = document.createElement('li');
            li.className = 'video-item';
            
            li.innerHTML = `
                <img src="${thumbnailUrl}" alt="${title} thumbnail" loading="lazy" />
                <div class="video-info">
                    <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
                    
                    <div class="channel-info-container">
                        <span class="youtube-channel-text">youtube channel: </span><br>
                        ${channelId ? `<a href="https://www.youtube.com/channel/${channelId}" class="channel-link" target="_blank" rel="noopener noreferrer">${channelTitle || ''}</a>` : `<span class="channel-name">${channelTitle || ''}</span>`}
                    </div>
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