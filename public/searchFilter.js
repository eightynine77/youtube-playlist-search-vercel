export function filterItems(items, searchTerm, wholeWordOnly, searchMode) {
  if (!searchTerm) return items;

  const term = searchTerm.toLowerCase();
  const pattern = wholeWordOnly ? new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i') : null;

  return items.filter(item => {
    if (!item) return false;

    const title = item.title?.toLowerCase() || '';
    const description = item.description?.toLowerCase() || '';

    if (searchMode === 'description') {
      return wholeWordOnly ? pattern.test(description) : description.includes(term);
    } else if (searchMode === 'both') {
      return wholeWordOnly
        ? pattern.test(title) || pattern.test(description)
        : title.includes(term) || description.includes(term);
    } else {
      return wholeWordOnly ? pattern.test(title) : title.includes(term);
    }
  });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}