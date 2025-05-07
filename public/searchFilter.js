export function filterVideos(items, searchTerm, options) {
  if (!searchTerm) return items;

  const {
    matchWholeWord = false,
    includeDescription = false,
    onlyDescription = false,
  } = options;

  const term = searchTerm.toLowerCase();
  const wordRegex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');

  return items.filter(item => {
    const title = item.title?.toLowerCase() || '';
    const description = item.description?.toLowerCase() || '';

    if (onlyDescription) {
      return matchWholeWord ? wordRegex.test(description) : description.includes(term);
    }

    if (includeDescription) {
      const combined = `${title} ${description}`;
      return matchWholeWord ? wordRegex.test(combined) : combined.includes(term);
    }

    // default: search title only
    return matchWholeWord ? wordRegex.test(title) : title.includes(term);
  });
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}