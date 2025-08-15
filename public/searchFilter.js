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

      const handleTerm = (term.startsWith('@') ? term.substring(1) : term).replace(/\s+/g, '');
      const channelTitle = item.channelTitle;
      const channelTitleLower = channelTitle.toLowerCase();
      
      const standardMatch = wholeWordOnly ? pattern.test(channelTitle) : channelTitleLower.includes(term);
      if (standardMatch) return true;

      const channelHandleStyle = channelTitleLower.replace(/\s+/g, '');
      return channelHandleStyle.includes(handleTerm);

    } else { 
      const title = item.title?.toLowerCase() || '';
      return wholeWordOnly ? pattern.test(title) : title.includes(term);
    }
  });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}