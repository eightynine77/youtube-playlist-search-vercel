export function filterItems(items, searchTerm, wholeWordOnly, descriptionSearchMode, videoDescription) {
    if (!searchTerm && descriptionSearchMode === "titleOnly") { // Only return all if no term and default search
      return items;
    }
    if (!searchTerm) { // If no search term, but a description mode is active, still filter based on mode logic (e.g., show all if search term is empty but we are searching descriptions)
      // This might need refinement based on desired behavior for empty search term with description modes
      return items; // For now, return all if search term is empty, description mode can't apply without a term.
    }
  
  
    const term = searchTerm.toLowerCase();
    const pattern = wholeWordOnly
      ? new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i') // 'i' for case-insensitive already, though term is lowercased
      : null;
  
    return items.filter(item => {
      if (!item) return false;
  
      const title = (item.title || "").toLowerCase();
      // Ensure description is also lowercased for consistent search
      const description = (item.description || "").toLowerCase();
  
      let titleMatch = false;
      let descriptionMatch = false;
  
      // Check title
      if (descriptionSearchMode === "titleOnly" || descriptionSearchMode === "includeDescription") {
        titleMatch = wholeWordOnly ? pattern.test(title) : title.includes(term);
      }
  
      // Check description
      if (descriptionSearchMode === "includeDescription" || descriptionSearchMode === "onlyDescription") {
        descriptionMatch = wholeWordOnly ? pattern.test(description) : description.includes(term);
      }
  
      if (descriptionSearchMode === "titleOnly") {
        return titleMatch;
      } else if (descriptionSearchMode === "onlyDescription") {
        return descriptionMatch;
      } else if (descriptionSearchMode === "includeDescription") {
        return titleMatch || descriptionMatch;
      }
  
      return false; // Should not reach here if modes are handled
    });
  }
  
  function escapeRegExp(string) {
    if (typeof string !== 'string') return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
  }