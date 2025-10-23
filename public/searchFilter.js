function checkMatch(text, term, wholeWord) {
  if (text === null || text === undefined) {
    return false;
  }

  if (wholeWord) {
    const escapedTerm = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
    return regex.test(text);
  } else {
    return text.toLowerCase().includes(term.toLowerCase());
  }
}

export function filterItems(items, searchTerm, wholeWordOnly, searchMode) {
  if (!searchTerm) {
    return items;
  }

  return items.filter(item => {
    switch (searchMode) {
      case 'title':
        return checkMatch(item.title, searchTerm, wholeWordOnly);
      case 'description':
        return checkMatch(item.description, searchTerm, wholeWordOnly);
      case 'both':
        return checkMatch(item.title, searchTerm, wholeWordOnly) ||
               checkMatch(item.description, searchTerm, wholeWordOnly);
      case 'channel':
        return checkMatch(item.channelTitle, searchTerm, wholeWordOnly);

      default:
        return checkMatch(item.title, searchTerm, wholeWordOnly);
    }
  });
}