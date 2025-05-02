export function filterItems(items, searchTerm, wholeWordOnly) {
    if (!searchTerm) return items;

    const term = searchTerm.toLowerCase();
    const pattern = wholeWordOnly
        ? new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i')
        : null;

    return items.filter(item => {
        if (!item || !item.title) return false;
        const title = item.title.toLowerCase();
        return wholeWordOnly ? pattern.test(title) : title.includes(term);
    });
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
