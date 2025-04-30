// public/script.js

// Add event listener to the search form
document.getElementById('searchForm').addEventListener('submit', async function(event) {
  event.preventDefault(); // Prevent default form submission (handles both button click and Enter key)

  // Get values from form inputs
  const playlistUrl = document.getElementById('playlistUrl').value.trim();
  const searchTerm = document.getElementById('searchTerm').value.trim();
  const resultsContainer = document.getElementById('results');

  // Basic validation for playlist URL input
  if (!playlistUrl) {
      resultsContainer.innerHTML = '<li class="error-message">Please enter a playlist URL.</li>';
      return;
  }

  // --- Display Loading Message ---
  // Clear previous results and show loading text
  resultsContainer.innerHTML = '<li class="loading-message">Loading...</li>';

  try {
    // Construct the URL for your backend API endpoint
    const apiUrl = `/api/fetchPlaylist?playlistUrl=${encodeURIComponent(playlistUrl)}&searchTerm=${encodeURIComponent(searchTerm)}`;

    // Fetch data from your backend API
    const response = await fetch(apiUrl);

    // Check if the fetch was successful (response status 200-299)
    if (!response.ok) {
      // Try to parse error message from backend response for better feedback
      let errorMsg = `Error: ${response.status} ${response.statusText}`;
      try {
          const errorData = await response.json();
          // Use the error message from the backend if available
          errorMsg = `Error: ${errorData.error || 'Failed to fetch data from server.'}`;
      } catch (e) {
          // Ignore if response body is not JSON or parsing fails
          console.warn("Could not parse error response body as JSON.");
      }
      // Throw an error to be caught by the catch block
      throw new Error(errorMsg);
    }

    // Parse the JSON response from the backend
    const items = await response.json();

    // --- Clear Loading and Display Results ---
    resultsContainer.innerHTML = ''; // Clear the "Loading..." message

    // Check if any videos were found
    if (!items || items.length === 0) {
      resultsContainer.innerHTML = `<li>No videos found matching your criteria.</li>`;
      return;
    }

    // Loop through the video items and create list elements
    items.forEach(item => {
      // Destructure for cleaner access, provide fallbacks for potentially missing data
      const { videoId, title = 'Untitled Video', thumbnailUrl, videoUrl } = item;

      // Skip rendering this item if essential data like videoUrl is missing
      if (!videoUrl) {
          console.warn("Skipping item due to missing videoUrl:", item);
          return;
      }

      const li = document.createElement('li');
      li.className = 'video-item'; // Add a class for styling

      // Use a default placeholder image if thumbnail is missing or fails to load
      const imageSrc = thumbnailUrl || `https://placehold.co/120x90/eee/aaa?text=No+Thumb`;

      // Set the inner HTML for the list item
      li.innerHTML = `
        <img
          src="${imageSrc}"
          alt="${title} thumbnail"
          onerror="this.onerror=null; this.src='https://placehold.co/120x90/eee/aaa?text=Error';" // Fallback image if the original fails
        />
        <div class="video-info">
          {/* Link to the video, opening in a new tab */}
          <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
           {/* Optionally display the Video ID */}
          <p class="video-id">Video ID: ${videoId}</p>
        </div>
      `;
      // Add the newly created list item to the results container
      resultsContainer.appendChild(li);
    });

  } catch (err) {
    // --- Error Handling ---
    console.error("Frontend Error:", err);
    // Display the caught error message to the user, replacing the loading text
    resultsContainer.innerHTML = `<li class="error-message">${err.message}</li>`;
  }
});
