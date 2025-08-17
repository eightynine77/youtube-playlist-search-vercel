// searchFilter.js
// Exports filterItems(items, term, wholeWordOnly, mode)
// mode: 'title' (default) or 'channel'
//
// Behavior for channel mode:
// - matches channel handle (with or without leading @)
// - matches channel name (which may contain spaces)
// - case-insensitive

export function normalizeText(s) {
  if (!s && s !== '') return '';
  return String(s).toLowerCase().trim();
}

export function normalizeHandle(h) {
  if (!h && h !== '') return '';
  let s = String(h).toLowerCase().trim();
  if (s.startsWith('@')) s = s.slice(1);
  return s;
}

// item expected shape (trimmed): { title, channelTitle, channelId, channelHandle, videoId, ... }
export function filterItems(items = [], term = '', wholeWordOnly = false, mode = 'title') {
  if (!Array.isArray(items)) return [];
  term = (term || '').trim();
  if (!term) return items.slice(); // no term = return all (copy)

  const tn = normalizeText(term);
  const termWords = tn.split(/\s+/).filter(Boolean);

  return items.filter(item => {
    const title = normalizeText(item.title || '');
    const chTitle = normalizeText(item.channelTitle || '');
    const chHandle = normalizeHandle(item.channelHandle || item.channelId || '');

    if (mode === 'channel') {
      // Match handle (exact or contains) OR channel title
      // Allow searching with or without @; user may type '@example' or 'example' or 'Ghost Gum'
      // If term starts with '@', prefer handle match, else check both.
      const startsWithAt = term.trim().startsWith('@');
      // check handle
      if (chHandle) {
        const handleMatch = wholeWordOnly
          ? termWords.some(w => normalizeHandle(w) === chHandle)
          : termWords.some(w => chHandle.includes(normalizeHandle(w)));
        if (handleMatch) return true;
      }
      // check channel title (name)
      if (chTitle) {
        if (wholeWordOnly) {
          // require all words present as separate whole words
          const allWords = termWords.every(w => {
            // match whole word in chTitle: use word boundaries
            const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i');
            return re.test(chTitle);
          });
          if (allWords) return true;
        } else {
          // simple substring
          if (chTitle.includes(tn)) return true;
        }
      }
      return false;
    } else {
      // title mode (default) - search video title
      if (wholeWordOnly) {
        // require all words to be present as whole words in title
        return termWords.every(w => {
          const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i');
          return re.test(title);
        });
      } else {
        return title.includes(tn);
      }
    }
  });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}