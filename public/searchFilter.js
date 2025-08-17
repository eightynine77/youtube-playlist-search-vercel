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

export function filterItems(items = [], term = '', wholeWordOnly = false, mode = 'title') {
  if (!Array.isArray(items)) return [];
  term = (term || '').trim();
  if (!term) return items.slice(); 

  const tn = normalizeText(term);
  const termWords = tn.split(/\s+/).filter(Boolean);

  return items.filter(item => {
    const title = normalizeText(item.title || '');
    const chTitle = normalizeText(item.channelTitle || '');
    const chHandle = normalizeHandle(item.channelHandle || item.channelId || '');

    if (mode === 'channel') {
      const startsWithAt = term.trim().startsWith('@');
      if (chHandle) {
        const handleMatch = wholeWordOnly
          ? termWords.some(w => normalizeHandle(w) === chHandle)
          : termWords.some(w => chHandle.includes(normalizeHandle(w)));
        if (handleMatch) return true;
      }

      if (chTitle) {
        if (wholeWordOnly) {
          const allWords = termWords.every(w => {
            const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i');
            return re.test(chTitle);
          });
          if (allWords) return true;
        } else {
          if (chTitle.includes(tn)) return true;
        }
      }
      return false;
    } else {
      if (wholeWordOnly) {
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