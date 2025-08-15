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
      if (!item.channelTitle) return false;
      const standardTerm = searchTerm; 
      const handleTerm = (searchTerm.startsWith('@') ? searchTerm.substring(1) : searchTerm).replace(/\s+/g, '');
      const channelTitle = item.channelTitle;
      const channelHandleStyle = item.channelTitle.replace(/\s+/g, '');
      
      if (wholeWordOnly) {
        const standardPattern = new RegExp(`\\b${escapeRegExp(standardTerm)}\\b`, 'i');
        const handlePattern = new RegExp(`\\b${escapeRegExp(handleTerm)}\\b`, 'i');
        return standardPattern.test(channelTitle) || handlePattern.test(channelHandleStyle);
      } else {
        return channelTitle.toLowerCase().includes(standardTerm.toLowerCase()) || channelHandleStyle.toLowerCase().includes(handleTerm.toLowerCase());
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