export function filterItems(items, searchTerm, wholeWordOnly, searchMode = 'title') {
  if (!searchTerm) return items;

  const term = searchTerm.toLowerCase();
  const pattern = wholeWordOnly
    ? new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i')
    : null;

  return items.filter(item => {
    const title = item?.title?.toLowerCase() || '';
    const description = item?.description?.toLowerCase() || '';

    const matchesTitle = title && (wholeWordOnly ? pattern.test(title) : title.includes(term));
    const matchesDescription = description && (wholeWordOnly ? pattern.test(description) : description.includes(term));

    switch (searchMode) {
      case 'both':
        return matchesTitle || matchesDescription;
      case 'description':
        return matchesDescription;
      case 'title':
      default:
        return matchesTitle;
    }
  });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}