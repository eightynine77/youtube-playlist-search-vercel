export function filterVideos(videos, searchTerm, options = {}) {
  const term = searchTerm.trim().toLowerCase();
  const isWholeWord = options.wholeWord || false;
  const descriptionSearch = options.descriptionSearch || null;

  if (!term) return videos;

  return videos.filter(item => {
    const title = (item.title || '').toLowerCase();
    const desc = (item.description || '').toLowerCase();

    const regex = isWholeWord ? new RegExp(`\\b${term}\\b`, 'i') : new RegExp(term, 'i');

    if (descriptionSearch === 'only') {
      return regex.test(desc);
    } else if (descriptionSearch === 'include') {
      return regex.test(title) || regex.test(desc);
    } else {
      return regex.test(title);
    }
  });
}