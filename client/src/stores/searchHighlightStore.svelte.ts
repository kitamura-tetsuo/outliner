export class SearchHighlightStore {
    searchQuery = $state("");
    isRegexMode = $state(false);
    isCaseSensitive = $state(false);
}

export const searchHighlightStore = new SearchHighlightStore();
