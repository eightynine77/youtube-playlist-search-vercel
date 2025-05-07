// searchFilter.js
export function filterVideos(videos, searchTerm, options = {}) {
  const term = searchTerm.toLowerCase();
  const { matchWholeWord = false, descriptionMode = 'title' } = options;

  if (!term) return videos;

  const isWholeWordMatch = (text) => {
    if (!text) return false;
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
    return pattern.test(text);
  };

  return videos.filter(video => {
    const title = video.title?.toLowerCase() || '';
    const desc = video.description?.toLowerCase() || '';

    const check = (text) => {
      return matchWholeWord ? isWholeWordMatch(text) : text.includes(term);
    };

    if (descriptionMode === 'only') {
      return check(desc);
    } else if (descriptionMode === 'include') {
      return check(title) || check(desc);
    } else {
      return check(title);
    }
  });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}