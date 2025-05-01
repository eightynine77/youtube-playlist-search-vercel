let allFetchedItems = [];
let nextPageToken = null;
let currentSearchTerm = '';
let currentPlaylistUrl = '';

const resultsContainer = document.getElementById('results');
const form = document.getElementById('searchForm');

const showAllBtn = document.createElement('button');
showAllBtn.textContent = 'Show All';
showAllBtn.style.display = 'none'; 
showAllBtn.addEventListener('click', handleShowAll);
form.appendChild(showAllBtn);

form.addEventListener('submit', async function (event) {
    event.preventDefault();
    allFetchedItems = [];
    nextPageToken = null;
    resultsContainer.innerHTML = '<li class="loading-message">Loading...</li>';
    showAllBtn.style.display = 'none'; 
    showAllBtn.disabled = false;    
    showAllBtn.textContent = 'Show All'; 

    currentPlaylistUrl = document.getElementById('playlistUrl').value.trim();
    currentSearchTerm = document.getElementById('searchTerm').value.trim().toLowerCase();

    if (!currentPlaylistUrl) {
        resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
        return;
    }

    const { items, nextToken, error } = await fetchPlaylistPage(currentPlaylistUrl);

    if (error) {
        resultsContainer.innerHTML = `<li class="error-message">${error}</li>`;
        showAllBtn.style.display = 'none'; 
        return;
    }

    allFetchedItems = items || []; 
    nextPageToken = nextToken;

    renderResults();
});

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
    const filtered = currentSearchTerm
        ? allFetchedItems.filter(item =>
            item && item.title && item.title.toLowerCase().includes(currentSearchTerm)
          )
        : allFetchedItems;

    resultsContainer.innerHTML = ''; 

    if (filtered.length === 0) {
        if (nextPageToken) {
            if (!showAllBtn.disabled) {
                showAllBtn.style.display = 'inline-block';
            }
        } else {
            resultsContainer.innerHTML = '<li>No videos found matching your criteria.</li>';
            showAllBtn.style.display = 'none'; 
        }
    } else {
        filtered.forEach(item => {
            const { title, thumbnailUrl, videoUrl } = item;
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
                </div>
            `;
            resultsContainer.appendChild(li);
        });

         if (!showAllBtn.disabled) {
            showAllBtn.style.display = nextPageToken ? 'inline-block' : 'none';
         }
    }
}

async function handleShowAll(event) {
    event.preventDefault();
    showAllBtn.disabled = true;
    showAllBtn.textContent = 'Loading...';
    showAllBtn.style.display = 'inline-block';

    let fetchError = null; 

    while (nextPageToken) {
        const { items, nextToken, error } = await fetchPlaylistPage(currentPlaylistUrl, nextPageToken);

        if (error) {
            alert(`Failed to load some videos: ${error}`);
            fetchError = error; 
            nextPageToken = null; 
            break; 
        }

        allFetchedItems = allFetchedItems.concat(items || []); 
        nextPageToken = nextToken;

        renderResults();
        if (nextPageToken && !showAllBtn.disabled) {
             showAllBtn.style.display = 'inline-block';
        }
    }

    showAllBtn.disabled = false;
    showAllBtn.textContent = 'Show All';

    renderResults();

    if (fetchError) {
        showAllBtn.style.display = 'none';
    }
}

const playlistUrlInput = document.getElementById('playlistUrl');
playlistUrlInput?.addEventListener('input', () => {
    if (!playlistUrlInput.value) {
        playlistUrlInput.setCustomValidity('Please enter a playlist URL.');
    } else {
        playlistUrlInput.setCustomValidity(''); // Clear validation message
    }
});
