import { default_avatar } from '../../../../../../script.js';
import { loadQuillgenIndex } from './quillgenApi.js';

const baseUrl = 'https://raw.githubusercontent.com/mia13165/updated_cards/refs/heads/main';

// Storage for loaded data
const loadedData = {
    masterIndex: null,
    serviceIndexes: {},
    loadedChunks: {}
};

export async function loadMasterIndex() {
    try {
        const response = await fetch(`${baseUrl}/index/master-index.json`);
        if (!response.ok) throw new Error('Failed to load master index');
        loadedData.masterIndex = await response.json();
        return loadedData.masterIndex;
    } catch (error) {
        console.error('[Bot Browser] Error loading master index:', error);
        toastr.error('Failed to load bot browser data');
        return null;
    }
}

// Store Chub API state for pagination
const chubApiState = {
    currentPage: 1,
    hasMore: true,
    isLoading: false,
    currentSearch: '',
    currentSort: 'download_count'
};

export function getChubApiState() {
    return chubApiState;
}

export function resetChubApiState() {
    chubApiState.currentPage = 1;
    chubApiState.hasMore = true;
    chubApiState.isLoading = false;
    chubApiState.currentSearch = '';
    chubApiState.currentSort = 'download_count';
}

/**
 * Load more Chub cards (for infinite scroll)
 */
export async function loadMoreChubCards(options = {}) {
    if (chubApiState.isLoading || !chubApiState.hasMore) {
        return [];
    }

    chubApiState.isLoading = true;

    try {
        const { searchChubCards, transformChubCard } = await import('./chubApi.js');

        // Map sort options to Chub API sort values
        const sortMap = {
            'date_desc': 'created_at',
            'date_asc': 'created_at',
            'relevance': 'download_count',
            'name_asc': 'name',
            'name_desc': 'name'
        };

        const apiSort = sortMap[options.sort] || 'download_count';
        const isAsc = options.sort === 'date_asc' || options.sort === 'name_asc';

        // Update state with current search/sort
        if (options.search !== undefined) chubApiState.currentSearch = options.search;
        if (options.sort !== undefined) chubApiState.currentSort = options.sort;

        console.log(`[Bot Browser] Loading Chub page ${chubApiState.currentPage}, search: "${chubApiState.currentSearch}", sort: ${apiSort}`);

        const result = await searchChubCards({
            limit: 48,
            page: chubApiState.currentPage,
            search: chubApiState.currentSearch,
            sort: apiSort,
            asc: isAsc,
            // NSFW filter - if hideNsfw is true, tell API to exclude NSFW content
            nsfw: options.hideNsfw ? false : true,
            nsfl: options.hideNsfw ? false : true,
            // Advanced filters
            minTokens: options.minTokens,
            maxTokens: options.maxTokens,
            tags: options.customTags,
            excludeTags: options.excludeTags,
            username: options.creatorUsername,
            maxDaysAgo: options.maxDaysAgo,
            minAiRating: options.minAiRating,
            requireExamples: options.requireExamples,
            requireLore: options.requireLore,
            requireGreetings: options.requireGreetings
        });

        let nodes = [];
        if (Array.isArray(result)) {
            nodes = result;
        } else if (result && result.data && Array.isArray(result.data.nodes)) {
            // API returns { data: { nodes: [...], count, cursor } }
            nodes = result.data.nodes;
        } else if (result && Array.isArray(result.nodes)) {
            nodes = result.nodes;
        }

        const cards = nodes.map(transformChubCard);
        console.log(`[Bot Browser] Loaded ${cards.length} cards from Chub API page ${chubApiState.currentPage}`);

        // Check if there are more pages - use cursor if available, otherwise check count
        const hasCursor = result?.data?.cursor != null;
        if (cards.length < 48 && !hasCursor) {
            chubApiState.hasMore = false;
        } else {
            chubApiState.currentPage++;
        }

        // Append to existing cache
        if (!loadedData.serviceIndexes['chub']) {
            loadedData.serviceIndexes['chub'] = [];
        }
        loadedData.serviceIndexes['chub'].push(...cards);

        chubApiState.isLoading = false;
        return cards;
    } catch (error) {
        console.error('[Bot Browser] Failed to load more Chub cards:', error);
        chubApiState.isLoading = false;
        return [];
    }
}

// Store Chub Lorebooks API state for pagination
const chubLorebooksApiState = {
    currentPage: 1,
    hasMore: true,
    isLoading: false,
    currentSearch: '',
    currentSort: 'star_count'
};

export function getChubLorebooksApiState() {
    return chubLorebooksApiState;
}

export function resetChubLorebooksApiState() {
    chubLorebooksApiState.currentPage = 1;
    chubLorebooksApiState.hasMore = true;
    chubLorebooksApiState.isLoading = false;
    chubLorebooksApiState.currentSearch = '';
    chubLorebooksApiState.currentSort = 'star_count';
}

/**
 * Load more Chub lorebooks (for infinite scroll)
 */
export async function loadMoreChubLorebooks(options = {}) {
    if (chubLorebooksApiState.isLoading || !chubLorebooksApiState.hasMore) {
        return [];
    }

    chubLorebooksApiState.isLoading = true;

    try {
        const { searchChubLorebooks, transformChubLorebook } = await import('./chubApi.js');

        // Map sort options to Chub API sort values
        const sortMap = {
            'date_desc': 'created_at',
            'date_asc': 'created_at',
            'relevance': 'star_count',
            'name_asc': 'name',
            'name_desc': 'name'
        };

        const apiSort = sortMap[options.sort] || 'star_count';
        const isAsc = options.sort === 'date_asc' || options.sort === 'name_asc';

        // Update state with current search/sort
        if (options.search !== undefined) chubLorebooksApiState.currentSearch = options.search;
        if (options.sort !== undefined) chubLorebooksApiState.currentSort = options.sort;

        console.log(`[Bot Browser] Loading Chub lorebooks page ${chubLorebooksApiState.currentPage}, search: "${chubLorebooksApiState.currentSearch}", sort: ${apiSort}`);

        const result = await searchChubLorebooks({
            limit: 48,
            page: chubLorebooksApiState.currentPage,
            search: chubLorebooksApiState.currentSearch,
            sort: apiSort,
            asc: isAsc,
            // NSFW filter - if hideNsfw is true, tell API to exclude NSFW content
            nsfw: options.hideNsfw ? false : true,
            nsfl: options.hideNsfw ? false : true,
            // Filters
            tags: options.customTags,
            excludeTags: options.excludeTags,
            username: options.creatorUsername
        });

        let nodes = [];
        if (Array.isArray(result)) {
            nodes = result;
        } else if (result && result.data && Array.isArray(result.data.nodes)) {
            nodes = result.data.nodes;
        } else if (result && Array.isArray(result.nodes)) {
            nodes = result.nodes;
        }

        const lorebooks = nodes.map(transformChubLorebook);
        console.log(`[Bot Browser] Loaded ${lorebooks.length} lorebooks from Chub API page ${chubLorebooksApiState.currentPage}`);

        // Check if there are more pages
        if (lorebooks.length < 48) {
            chubLorebooksApiState.hasMore = false;
        } else {
            chubLorebooksApiState.currentPage++;
        }

        // Append to existing cache
        if (!loadedData.serviceIndexes['chub_lorebooks']) {
            loadedData.serviceIndexes['chub_lorebooks'] = [];
        }
        loadedData.serviceIndexes['chub_lorebooks'].push(...lorebooks);

        chubLorebooksApiState.isLoading = false;
        return lorebooks;
    } catch (error) {
        console.error('[Bot Browser] Failed to load more Chub lorebooks:', error);
        chubLorebooksApiState.isLoading = false;
        return [];
    }
}

export async function loadServiceIndex(serviceName, useLiveApi = false, options = {}) {
    // Handle QuillGen specially - it uses API-based loading
    if (serviceName === 'quillgen') {
        // Return cached data if available
        if (loadedData.serviceIndexes['quillgen'] && loadedData.serviceIndexes['quillgen'].length > 0) {
            return loadedData.serviceIndexes['quillgen'];
        }
        const cards = await loadQuillgenIndex();
        loadedData.serviceIndexes['quillgen'] = cards;
        return cards;
    }

    // For chub_lorebooks with live API enabled, fetch from Gateway API
    if (serviceName === 'chub_lorebooks' && useLiveApi) {
        resetChubLorebooksApiState();
        delete loadedData.serviceIndexes[serviceName];

        try {
            const lorebooks = await loadMoreChubLorebooks(options);
            return lorebooks;
        } catch (error) {
            console.error('[Bot Browser] Chub Lorebooks API failed:', error);
            // Fall through to archive method below
        }
    }

    // For chub with live API enabled, always fetch fresh from API (don't use cache)
    // This ensures users get the latest cards
    if (serviceName === 'chub' && useLiveApi) {
        // Reset pagination state for fresh load
        resetChubApiState();

        // Clear any cached chub data to ensure fresh API results
        delete loadedData.serviceIndexes[serviceName];

        try {
            // Load first page
            const cards = await loadMoreChubCards(options);
            return cards;
        } catch (error) {
            console.error('[Bot Browser] Chub API failed:', error);
            console.error('[Bot Browser] Error stack:', error.stack);
            // Fall through to archive method below
        }
    }

    // Return cached data if available (for non-chub or when API fails)
    if (loadedData.serviceIndexes[serviceName]) {
        return loadedData.serviceIndexes[serviceName];
    }

    try {
        const response = await fetch(`${baseUrl}/index/${serviceName}-search.json`);
        if (!response.ok) {
            console.warn(`[Bot Browser] ${serviceName} index not found (${response.status})`);
            loadedData.serviceIndexes[serviceName] = [];
            return [];
        }

        const text = await response.text();
        if (!text || text.trim().length === 0) {
            console.warn(`[Bot Browser] ${serviceName} index is empty`);
            loadedData.serviceIndexes[serviceName] = [];
            return [];
        }

        const data = JSON.parse(text);

        // Handle different data formats: object with cards/lorebooks array, or direct array
        const items = data.cards || data.lorebooks || data;
        if (!Array.isArray(items)) {
            throw new Error(`Invalid data format for ${serviceName}`);
        }

        loadedData.serviceIndexes[serviceName] = items;
        return items;
    } catch (error) {
        console.error(`[Bot Browser] Error loading ${serviceName} index:`, error);
        loadedData.serviceIndexes[serviceName] = [];
        return [];
    }
}

/**
 * Clear QuillGen cache to force reload on next access.
 */
export function clearQuillgenCache() {
    loadedData.serviceIndexes['quillgen'] = null;
}

export async function loadCardChunk(service, chunkFile) {
    const chunkKey = `${service}/${chunkFile}`;
    if (loadedData.loadedChunks[chunkKey]) {
        return loadedData.loadedChunks[chunkKey];
    }

    try {
        const response = await fetch(`${baseUrl}/chunks/${service}/${chunkFile}`);
        if (!response.ok) throw new Error(`Failed to load chunk ${chunkKey}`);

        const parsedData = await response.json();

        let data;
        if (Array.isArray(parsedData)) {
            data = parsedData;
        } else if (parsedData.cards) {
            data = parsedData.cards;
        } else if (parsedData.lorebooks) {
            data = parsedData.lorebooks;
        } else {
            data = [parsedData];
        }

        loadedData.loadedChunks[chunkKey] = data;
        return data;
    } catch (error) {
        console.error(`[Bot Browser] Error loading chunk ${chunkKey}:`, error);
        return [];
    }
}

async function cacheService(serviceName) {
    const cards = await loadServiceIndex(serviceName);
    return cards;
}

function pickCard(cards) {
    const cardsWithChunks = cards.filter(card =>
        card.chunk &&
        (card.avatar_url || card.image_url)
    );

    if (cardsWithChunks.length > 0) {
        return cardsWithChunks[Math.floor(Math.random() * cardsWithChunks.length)];
    }

    return null;
}

function findDefaultAvatarCard(cards) {
    const cardsWithChunks = cards.filter(card =>
        card.chunk &&
        (card.avatar_url || card.image_url)
    );

    const avatarFilename = default_avatar.split('/').pop();

    for (const card of cardsWithChunks) {
        const imageUrl = card.image_url || card.avatar_url || '';
        if (imageUrl.includes(default_avatar) || imageUrl.endsWith(avatarFilename)) {
            card.image_url = default_avatar;
            return card;
        }
    }

    return null;
}

function cleanupModal() {
    const detailModal = document.getElementById('bot-browser-detail-modal');
    const detailOverlay = document.getElementById('bot-browser-detail-overlay');

    if (detailModal && detailOverlay) {
        detailModal.className = 'bot-browser-preload-container';
        detailOverlay.className = 'bot-browser-preload-container';

        return new Promise(resolve => {
            setTimeout(() => {
                detailModal.remove();
                detailOverlay.remove();
                resolve();
            }, 10);
        });
    }
}

export async function initializeServiceCache(showCardDetailFunc) {
    try {
        await loadMasterIndex();

        const allServices = ['catbox', 'webring', 'chub', 'anchorhold', 'risuai_realm', 'nyai_me', 'character_tavern',  'desuarchive', 'mlpchag'];
        let defaultAvatarCard = null;
        let cachedServices = {};

        for (const serviceName of allServices) {
            const cards = await cacheService(serviceName);
            cachedServices[serviceName] = cards;

            if (cards.length > 0) {
                defaultAvatarCard = findDefaultAvatarCard(cards);

                if (defaultAvatarCard) {
                    break;
                }
            }
        }

        if (defaultAvatarCard) {
            await showCardDetailFunc(defaultAvatarCard, false);
            await cleanupModal();
        }

        const fetchedServiceNames = Object.keys(cachedServices).filter(s => cachedServices[s].length > 0);
        if (fetchedServiceNames.length > 0) {
            const randomServiceName = fetchedServiceNames[Math.floor(Math.random() * fetchedServiceNames.length)];
            const cards = cachedServices[randomServiceName];
            const randomCard = pickCard(cards);

            if (randomCard) {
                await showCardDetailFunc(randomCard, false);
                await cleanupModal();
            }
        }
    } catch (error) {
        console.error('[Bot Browser] Service cache initialization failed:', error);
    }
}

// Export loaded data for other modules
export function getMasterIndex() {
    return loadedData.masterIndex;
}

export function getServiceIndex(serviceName) {
    return loadedData.serviceIndexes[serviceName];
}

export function getLoadedChunk(service, chunkFile) {
    const chunkKey = `${service}/${chunkFile}`;
    return loadedData.loadedChunks[chunkKey];
}
