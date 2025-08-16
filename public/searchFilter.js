export function filterItems(items, searchTerm, wholeWordOnly, searchMode) {
  if (!searchTerm) return items;
  const term = searchTerm.toLowerCase();
  const pattern = wholeWordOnly ? new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i') : null;

  return items.filter(item => {
    if (!item) return false;

    if (searchMode === 'description') {
      const description = item.description?.toLowerCase() || '';
      return wholeWordOnly ? pattern.test(description) : description.includes(term);

    } else if (searchMode === 'both') {
      const title = item.title?.toLowerCase() || '';
      const description = item.description?.toLowerCase() || '';
      return wholeWordOnly
        ? pattern.test(title) || pattern.test(description)
        : title.includes(term) || description.includes(term);

    } else if (searchMode === 'channel') {
      const channelTitle = (item.channelTitle || '').toLowerCase();
      const standardTerm = searchTerm.trim().toLowerCase();
      const handleTerm = (standardTerm.startsWith('@') ? standardTerm.substring(1) : standardTerm).replace(/\s+/g, '');
      const channelHandleRaw = item.channelHandle || ''; 
      const channelHandleNormalized = channelHandleRaw.toLowerCase().replace(/^\@/, '').replace(/\s+/g, '');

      if (wholeWordOnly) {
        const titlePattern = new RegExp(`\\b${escapeRegExp(standardTerm)}\\b`, 'i');
        const handlePattern = new RegExp(`\\b${escapeRegExp(handleTerm)}\\b`, 'i');
        return titlePattern.test(channelTitle) || handlePattern.test(channelHandleNormalized);
      } else {
        return channelTitle.includes(standardTerm) || channelHandleNormalized.includes(handleTerm);
      }

    } else { 
      const title = item.title?.toLowerCase() || '';
      return wholeWordOnly ? pattern.test(title) : title.includes(term);
    }
  });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}