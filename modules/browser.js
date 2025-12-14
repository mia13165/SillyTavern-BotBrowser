import { Fuse } from '../../../../../lib.js';
import { debounce, escapeHTML } from './utils/utils.js';
import { createBrowserHeader, createCardGrid, createCardHTML, createBottomActions } from './templates/templates.js';
import { getAllTags, getAllCreators, filterCards, sortCards, deduplicateCards, validateCardImages } from './services/cards.js';
import { loadPersistentSearch, savePersistentSearch, loadSearchCollapsed, saveSearchCollapsed } from './storage/storage.js';
import { loadMoreChubCards, loadMoreChubLorebooks, getChubApiState, getChubLorebooksApiState, resetChubApiState, loadServiceIndex, getCharacterTavernApiState, resetCharacterTavernState, loadMoreCharacterTavernCards, getWyvernApiState, getWyvernLorebooksApiState, resetWyvernApiState, resetWyvernLorebooksApiState, loadMoreWyvernCards, loadMoreWyvernLorebooksWrapper } from './services/cache.js';
import { searchWyvernCharacters, searchWyvernLorebooks, transformWyvernCard, transformWyvernLorebook } from './services/wyvernApi.js';
import { searchJannyCharacters, transformJannyCard } from './services/jannyApi.js';
import { searchCharacterTavern } from './services/characterTavernApi.js';
import {
    fetchChubTrending, transformChubTrendingCard, chubTrendingState, resetChubTrendingState,
    fetchWyvernTrending, transformWyvernTrendingCard, wyvernTrendingState, resetWyvernTrendingState,
    fetchJannyTrending, transformJannyTrendingCard, jannyTrendingState, resetJannyTrendingState, loadMoreJannyTrending
} from './services/trendingApi.js';

// JannyAI API state for pagination
let jannyApiState = {
    page: 1,
    hasMore: true,
    isLoading: false,
    lastSearch: '',
    lastSort: ''
};

export function resetJannyApiState() {
    jannyApiState = {
        page: 1,
        hasMore: true,
        isLoading: false,
        lastSearch: '',
        lastSort: ''
    };
}

export function getJannyApiState() {
    return jannyApiState;
}

// Helper to update cached tags/creators and refresh filter dropdowns after loading new cards
function updateCachedFiltersAndDropdowns(state, menuContent) {
    state.cachedTags = getAllTags(state.currentCards);
    state.cachedCreators = getAllCreators(state.currentCards);
    updateFilterDropdowns(menuContent, state.cachedTags, state.cachedCreators, state);
}

// Helper to apply all client-side filters consistently (blocklist, NSFW, image validation)
// This ensures blocklist is applied whenever cards are loaded from live APIs
function applyClientSideFilters(cards, state, extensionName, extension_settings) {
    // Apply filterCards to handle blocklist, NSFW filter, and other client-side filters
    const filtered = filterCards(cards, state.filters, state.fuse, extensionName, extension_settings);

    // Filter for valid images
    const cardsWithImages = filtered.filter(card => {
        const imageUrl = card.avatar_url || card.image_url;
        const hasValidImage = imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
        if (!hasValidImage) {
            console.log(`[Bot Browser] No valid image: Hiding "${card.name}" - image URL: "${imageUrl || 'none'}"`);
        }
        return hasValidImage;
    });

    console.log(`[Bot Browser] applyClientSideFilters: ${cards.length} input -> ${filtered.length} after blocklist/NSFW -> ${cardsWithImages.length} after image filter`);

    return cardsWithImages;
}

export function createCardBrowser(serviceName, cards, state, extensionName, extension_settings, showCardDetailFunc) {
    state.view = 'browser';
    state.currentService = serviceName;

    // Detect if this is a live Chub API source (cards/lorebooks have isLiveChub flag)
    const useLiveChubApi = extension_settings[extensionName].useChubLiveApi !== false;
    const isChubService = serviceName === 'chub' || serviceName === 'chub_lorebooks';
    state.isLiveChub = isChubService && useLiveChubApi && cards.some(c => c.isLiveChub);
    state.isLorebooks = serviceName === 'chub_lorebooks';

    // Detect if this is JannyAI (always live API)
    state.isJannyAI = serviceName === 'jannyai';
    if (state.isJannyAI) {
        resetJannyApiState();
    }

    // Detect if this is Character Tavern with live API enabled
    const useCharacterTavernLiveApi = extension_settings[extensionName].useCharacterTavernLiveApi === true;
    state.isCharacterTavern = serviceName === 'character_tavern' && useCharacterTavernLiveApi && cards.some(c => c.isCharacterTavern || c.sourceService === 'character_tavern_live');
    if (state.isCharacterTavern) {
        resetCharacterTavernState();
    }

    // Detect if this is Wyvern with live API enabled
    const useWyvernLiveApi = extension_settings[extensionName].useWyvernLiveApi !== false;
    const isWyvernService = serviceName === 'wyvern' || serviceName === 'wyvern_lorebooks';
    state.isWyvern = isWyvernService && useWyvernLiveApi && cards.some(c => c.isWyvern || c.sourceService === 'wyvern_live' || c.sourceService === 'wyvern_lorebooks_live');
    state.isWyvernLorebooks = serviceName === 'wyvern_lorebooks';
    if (state.isWyvern) {
        if (state.isWyvernLorebooks) {
            resetWyvernLorebooksApiState();
        } else {
            resetWyvernApiState();
        }
    }

    // Detect trending sources via card sourceService
    const firstCard = cards[0];
    state.isTrending = firstCard?.isTrending || false;
    state.isJannyAITrending = firstCard?.sourceService === 'jannyai_trending';
    state.isChubTrending = firstCard?.sourceService === 'chub_trending';
    state.isWyvernTrending = firstCard?.sourceService === 'wyvern_trending';

    // Deduplicate cards before storing, and preserve or add the source service name
    const cardsWithSource = cards.map(card => ({
        ...card,
        sourceService: card.sourceService || serviceName
    }));
    state.currentCards = deduplicateCards(cardsWithSource);

    // Load persistent search for this service ONLY if autoClearFilters is disabled
    const autoClearFilters = extension_settings[extensionName].autoClearFilters !== false;
    const savedSearch = autoClearFilters ? null : loadPersistentSearch(extensionName, extension_settings, serviceName);
    if (savedSearch) {
        state.filters = savedSearch.filters || { search: '', tags: [], creator: '' };
        state.sortBy = savedSearch.sortBy || extension_settings[extensionName].defaultSortBy || 'relevance';
    } else {
        // Reset filters - either autoClearFilters is on OR no saved search exists
        state.filters = { search: '', tags: [], creator: '' };
        state.sortBy = extension_settings[extensionName].defaultSortBy || 'relevance';
    }

    // For JannyAI, sync the persisted search to jannyApiState so "load more" uses it
    if (state.isJannyAI && state.filters.search) {
        jannyApiState.lastSearch = state.filters.search;
    }

    // Initialize advanced filters for live Chub API
    if (state.isLiveChub) {
        state.advancedFilters = savedSearch?.advancedFilters || {
            minTokens: null,
            maxTokens: null,
            customTags: '',
            excludeTags: '',
            creatorUsername: '',
            maxDaysAgo: null,
            minAiRating: null,
            requireExamples: false,
            requireLore: false,
            requireGreetings: false
        };
    } else {
        state.advancedFilters = null;
    }

    // Initialize advanced filters for JannyAI
    if (state.isJannyAI) {
        state.jannyAdvancedFilters = savedSearch?.jannyAdvancedFilters || {
            minTokens: null,
            maxTokens: null,
            hideLowQuality: false
        };
    } else {
        state.jannyAdvancedFilters = null;
    }

    // Initialize advanced filters for Character Tavern
    if (state.isCharacterTavern) {
        state.ctAdvancedFilters = savedSearch?.ctAdvancedFilters || {
            minTokens: null,
            maxTokens: null,
            tags: [],
            hasLorebook: false,
            isOC: false
        };
    } else {
        state.ctAdvancedFilters = null;
    }

    // Initialize advanced filters for Wyvern
    if (state.isWyvern) {
        state.wyvernAdvancedFilters = savedSearch?.wyvernAdvancedFilters || {
            rating: 'all',
            tags: []
        };
    } else {
        state.wyvernAdvancedFilters = null;
    }

    // Lazy initialize Fuse.js only when search is used (performance optimization)
    const fuseOptions = {
        keys: [
            { name: 'name', weight: 3 },
            { name: 'creator', weight: 2 },
            { name: 'desc_search', weight: 1.5 },
            { name: 'desc_preview', weight: 1 },
            { name: 'tags', weight: 1.5 }
        ],
        threshold: extension_settings[extensionName].fuzzySearchThreshold || 0.4,
        distance: 100,
        minMatchCharLength: 2,
        ignoreLocation: true,
        useExtendedSearch: true
    };

    // Always store options for rebuilding Fuse when loading more cards
    state.fuseOptions = fuseOptions;
    // Only initialize Fuse if there's an active search query
    if (state.filters.search) {
        state.fuse = new Fuse(state.currentCards, fuseOptions);
    } else {
        state.fuse = null;
    }

    const menu = document.getElementById('bot-browser-menu');
    if (!menu) return;

    // Cache tag/creator extraction (performance optimization)
    const allTags = getAllTags(state.currentCards);
    const allCreators = getAllCreators(state.currentCards);
    state.cachedTags = allTags;
    state.cachedCreators = allCreators;
    const filteredCards = filterCards(state.currentCards, state.filters, state.fuse, extensionName, extension_settings);
    filteredCards.forEach((card, index) => {
        card.sortedIndex = index;
    });
    const sortedCards = sortCards(filteredCards, state.sortBy);

    const cardsWithImages = sortedCards.filter(card => {
        const imageUrl = card.avatar_url || card.image_url;
        return imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
    });

    // Store filtered cards for pagination
    state.filteredCards = cardsWithImages;
    state.currentPage = 1;
    state.totalPages = Math.ceil(cardsWithImages.length / (extension_settings[extensionName].cardsPerPage || 200));

    const serviceDisplayName = serviceName === 'all' ? 'All Sources' :
        serviceName === 'anchorhold' ? '4chan - /aicg/' :
            serviceName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Load collapsed state before creating HTML to prevent animation
    const searchCollapsed = loadSearchCollapsed();

    // Replace menu content
    const menuContent = menu.querySelector('.bot-browser-content');
    const hideNsfw = extension_settings[extensionName].hideNsfw || false;
    const nsfwText = hideNsfw ? ' (after hiding NSFW)' : '';
    // For live APIs (Chub/JannyAI/CT/Wyvern), show "Browsing X API" instead of count (we don't know total)
    const cardCountText = state.isLiveChub
        ? `Browsing Chub API${nsfwText}`
        : state.isJannyAI
            ? `Browsing JannyAI${nsfwText}`
            : state.isCharacterTavern
                ? `Browsing Character Tavern${nsfwText}`
                : state.isWyvern
                    ? `Browsing Wyvern Chat${nsfwText}`
                    : `${cardsWithImages.length} card${cardsWithImages.length !== 1 ? 's' : ''} found${nsfwText}`;
    menuContent.innerHTML = createBrowserHeader(serviceDisplayName, state.filters.search, cardCountText, searchCollapsed, hideNsfw, state.isLiveChub, state.advancedFilters, state.isJannyAI, state.jannyAdvancedFilters, state.isCharacterTavern, state.ctAdvancedFilters, state.isWyvern, state.wyvernAdvancedFilters);

    // Render first page immediately for better perceived performance
    renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);

    // Defer filter dropdown population to idle time (performance optimization)
    if (window.requestIdleCallback) {
        requestIdleCallback(() => {
            updateFilterDropdowns(menuContent, state.cachedTags, state.cachedCreators, state);
        });
    } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
            updateFilterDropdowns(menuContent, state.cachedTags, state.cachedCreators, state);
        }, 50);
    }

    // Add event listeners
    setupBrowserEventListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc);

    // Add advanced filter event listeners for live Chub
    if (state.isLiveChub) {
        setupAdvancedFilterListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc);
    }

    // Add advanced filter event listeners for JannyAI
    if (state.isJannyAI) {
        setupJannyAdvancedFilterListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc);
    }

    // Add advanced filter event listeners for Character Tavern
    if (state.isCharacterTavern) {
        setupCTAdvancedFilterListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc);
    }

    // Add advanced filter event listeners for Wyvern
    if (state.isWyvern) {
        setupWyvernAdvancedFilterListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc);
    }

    console.log('[Bot Browser] Card browser created with', sortedCards.length, 'cards');
}

// Update filter dropdowns
function updateFilterDropdowns(menuContent, allTags, allCreators, state) {
    // Populate tags (Custom Multi-Select)
    const tagFilterContainer = menuContent.querySelector('#bot-browser-tag-filter');

    const tagOptionsContainer = tagFilterContainer.querySelector('.bot-browser-multi-select-options');
    const tagTriggerText = tagFilterContainer.querySelector('.selected-text');

    // Clear existing options
    tagOptionsContainer.innerHTML = '';

    // Add "All Tags" option (clear all)
    const allTagsOption = document.createElement('div');
    allTagsOption.className = `bot-browser-multi-select-option ${state.filters.tags.length === 0 ? 'selected' : ''}`;
    allTagsOption.dataset.value = '';
    allTagsOption.innerHTML = `<i class="fa-solid fa-check"></i> <span>All Tags</span>`;
    tagOptionsContainer.appendChild(allTagsOption);

    // Add tag options (use DocumentFragment for better performance)
    const tagFragment = document.createDocumentFragment();
    allTags.forEach(tag => {
        const isSelected = state.filters.tags.includes(tag);
        const option = document.createElement('div');
        option.className = `bot-browser-multi-select-option ${isSelected ? 'selected' : ''}`;
        option.dataset.value = tag;
        option.innerHTML = `<i class="fa-solid fa-check"></i> <span>${escapeHTML(tag)}</span>`;
        tagFragment.appendChild(option);
    });
    tagOptionsContainer.appendChild(tagFragment);

    // Update trigger text
    if (state.filters.tags.length === 0) {
        tagTriggerText.textContent = 'All Tags';
    } else if (state.filters.tags.length === 1) {
        tagTriggerText.textContent = state.filters.tags[0];
    } else {
        tagTriggerText.textContent = `${state.filters.tags.length} Tags Selected`;
    }

    // Populate creators (Custom Multi-Select)
    const creatorFilterContainer = menuContent.querySelector('#bot-browser-creator-filter');
    const creatorOptionsContainer = creatorFilterContainer.querySelector('.bot-browser-multi-select-options');
    const creatorTriggerText = creatorFilterContainer.querySelector('.selected-text');

    // Clear existing options
    creatorOptionsContainer.innerHTML = '';

    // Add "All Creators" option (clear all)
    const allCreatorsOption = document.createElement('div');
    allCreatorsOption.className = `bot-browser-multi-select-option ${!state.filters.creator ? 'selected' : ''}`;
    allCreatorsOption.dataset.value = '';
    allCreatorsOption.innerHTML = `<i class="fa-solid fa-check"></i> <span>All Creators</span>`;
    creatorOptionsContainer.appendChild(allCreatorsOption);

    // Add creator options (use DocumentFragment for better performance)
    const creatorFragment = document.createDocumentFragment();
    allCreators.forEach(creator => {
        const isSelected = state.filters.creator === creator;
        const option = document.createElement('div');
        option.className = `bot-browser-multi-select-option ${isSelected ? 'selected' : ''}`;
        option.dataset.value = creator;
        option.innerHTML = `<i class="fa-solid fa-check"></i> <span>${escapeHTML(creator)}</span>`;
        creatorFragment.appendChild(option);
    });
    creatorOptionsContainer.appendChild(creatorFragment);

    // Update trigger text
    if (!state.filters.creator) {
        creatorTriggerText.textContent = 'All Creators';
    } else {
        creatorTriggerText.textContent = state.filters.creator;
    }

    // Update sort filter initial state
    const sortFilterContainer = menuContent.querySelector('#bot-browser-sort-filter');
    if (sortFilterContainer) {
        const sortTriggerText = sortFilterContainer.querySelector('.selected-text');
        const sortOptions = sortFilterContainer.querySelectorAll('.bot-browser-multi-select-option');

        const sortLabels = {
            'relevance': 'Relevance',
            'name_asc': 'Name (A-Z)',
            'name_desc': 'Name (Z-A)',
            'creator_asc': 'Creator (A-Z)',
            'creator_desc': 'Creator (Z-A)',
            'date_desc': 'Newest First',
            'date_asc': 'Oldest First',
            'tokens_desc': 'Most Tokens',
            'tokens_asc': 'Least Tokens'
        };

        if (sortTriggerText) {
            sortTriggerText.textContent = sortLabels[state.sortBy] || 'Relevance';
        }

        sortOptions.forEach(option => {
            const value = option.dataset.value;
            if (state.sortBy === value) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }

    // Filter out tags that don't exist in the current service (cleanup)
    const validTags = state.filters.tags.filter(tag => allTags.includes(tag));
    if (validTags.length !== state.filters.tags.length) {
        state.filters.tags = validTags;
        // Re-run update to fix UI if tags were removed
        updateFilterDropdowns(menuContent, allTags, allCreators, state);
    }
}

function setupBrowserEventListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc) {
    const backButton = menuContent.querySelector('.bot-browser-back-button');
    backButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // navigateToSources will be called from main index.js
        window.dispatchEvent(new CustomEvent('bot-browser-navigate-sources'));
    });

    const closeButton = menuContent.querySelector('.bot-browser-close');
    closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // closeBotBrowserMenu will be called from main index.js
        window.dispatchEvent(new CustomEvent('bot-browser-close'));
    });

    // Global click listener for closing dropdowns
    const closeDropdowns = (e) => {
        // Check if menu content still exists in DOM
        if (!document.body.contains(menuContent)) {
            document.removeEventListener('click', closeDropdowns);
            return;
        }

        // Check if click is outside all dropdowns
        const dropdowns = menuContent.querySelectorAll('.bot-browser-multi-select');
        dropdowns.forEach(container => {
            const dropdown = container.querySelector('.bot-browser-multi-select-dropdown');
            // Close if click is outside the container
            if (!container.contains(e.target) && dropdown) {
                dropdown.classList.remove('open');
            }
        });
    };

    // Use capture phase to ensure this fires before other handlers
    document.addEventListener('click', closeDropdowns, true);

    const searchInput = menuContent.querySelector('.bot-browser-search-input');
    searchInput.addEventListener('input', debounce(async (e) => {
        state.filters.search = e.target.value;

        // For live Chub, trigger fresh API search
        if (state.isLiveChub) {
            console.log('[Bot Browser] Triggering Chub API search:', state.filters.search);
            try {
                // Reset and reload with new search
                const cards = await loadServiceIndex('chub', true, {
                    search: state.filters.search,
                    sort: state.sortBy,
                    hideNsfw: extension_settings[extensionName].hideNsfw,
                    ...(state.advancedFilters || {})
                });
                state.currentCards = cards;

                // For live Chub, search is done server-side by the API
                // Clear Fuse to prevent stale client-side search from overriding API results
                state.fuse = null;

                // Apply client-side filters (blocklist, NSFW) and sort
                const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                state.filteredCards = sortCards(filteredCards, state.sortBy);
                state.currentPage = 1; // Reset to page 1 on new search

                // Update tags/creators dropdowns with new data
                updateCachedFiltersAndDropdowns(state, menuContent);

                renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
            } catch (error) {
                console.error('[Bot Browser] Chub API search failed:', error);
            }
        } else if (state.isJannyAI) {
            // For JannyAI, trigger fresh API search
            console.log('[Bot Browser] Triggering JannyAI search:', state.filters.search);
            try {
                resetJannyApiState();

                // Map sort options to JannyAI format
                let jannySort = 'createdAtStamp:desc';
                switch (state.sortBy) {
                    case 'date_desc': jannySort = 'createdAtStamp:desc'; break;
                    case 'date_asc': jannySort = 'createdAtStamp:asc'; break;
                    case 'tokens_desc': jannySort = 'totalToken:desc'; break;
                    case 'tokens_asc': jannySort = 'totalToken:asc'; break;
                    default: jannySort = 'createdAtStamp:desc';
                }

                const searchResults = await searchJannyCharacters({
                    search: state.filters.search,
                    page: 1,
                    limit: 40,
                    sort: jannySort,
                    minTokens: state.jannyAdvancedFilters?.minTokens || 29,
                    maxTokens: state.jannyAdvancedFilters?.maxTokens || 4101
                });

                const results = searchResults.results?.[0] || {};
                const cards = (results.hits || []).map(hit => transformJannyCard(hit));
                state.currentCards = cards;

                // Update pagination state
                jannyApiState.lastSearch = state.filters.search;
                jannyApiState.lastSort = jannySort;
                jannyApiState.hasMore = (results.totalHits || 0) > cards.length;

                // For JannyAI, search is done server-side by the API
                // Clear Fuse to prevent stale client-side search from overriding API results
                state.fuse = null;

                // Apply client-side filters (blocklist, NSFW) and sort
                const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                state.filteredCards = sortCards(filteredCards, state.sortBy);
                state.currentPage = 1; // Reset to page 1 on new search

                updateCachedFiltersAndDropdowns(state, menuContent);
                renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
            } catch (error) {
                console.error('[Bot Browser] JannyAI search failed:', error);
            }
        } else if (state.isCharacterTavern) {
            // For Character Tavern, trigger fresh API search
            console.log('[Bot Browser] Triggering Character Tavern search:', state.filters.search);
            try {
                resetCharacterTavernState();

                const cards = await searchCharacterTavern({
                    query: state.filters.search,
                    page: 1,
                    limit: 30,
                    hasLorebook: state.ctAdvancedFilters?.hasLorebook || undefined,
                    isOC: state.ctAdvancedFilters?.isOC || undefined,
                    minTokens: state.ctAdvancedFilters?.minTokens || undefined,
                    maxTokens: state.ctAdvancedFilters?.maxTokens || undefined,
                    tags: state.ctAdvancedFilters?.tags || []
                });

                state.currentCards = cards;

                // For CT, search is done server-side by the API
                // Clear Fuse to prevent stale client-side search from overriding API results
                state.fuse = null;

                // Apply client-side filters (blocklist, NSFW) and sort
                const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                state.filteredCards = sortCards(filteredCards, state.sortBy);
                state.currentPage = 1; // Reset to page 1 on new search

                updateCachedFiltersAndDropdowns(state, menuContent);
                renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
            } catch (error) {
                console.error('[Bot Browser] Character Tavern search failed:', error);
            }
        } else if (state.isWyvern) {
            // For Wyvern, trigger fresh API search
            console.log('[Bot Browser] Triggering Wyvern search:', state.filters.search);
            try {
                if (state.isWyvernLorebooks) {
                    resetWyvernLorebooksApiState();
                } else {
                    resetWyvernApiState();
                }

                // Map sort options to Wyvern format
                let wyvernSort = 'votes';
                let wyvernOrder = 'DESC';
                switch (state.sortBy) {
                    case 'date_desc': wyvernSort = 'created_at'; wyvernOrder = 'DESC'; break;
                    case 'date_asc': wyvernSort = 'created_at'; wyvernOrder = 'ASC'; break;
                    case 'name_asc': wyvernSort = 'name'; wyvernOrder = 'ASC'; break;
                    case 'name_desc': wyvernSort = 'name'; wyvernOrder = 'DESC'; break;
                    default: wyvernSort = 'votes'; wyvernOrder = 'DESC';
                }

                const searchFunc = state.isWyvernLorebooks ? searchWyvernLorebooks : searchWyvernCharacters;
                const transformFunc = state.isWyvernLorebooks ? transformWyvernLorebook : transformWyvernCard;

                const result = await searchFunc({
                    search: state.filters.search,
                    page: 1,
                    limit: 40,
                    sort: wyvernSort,
                    order: wyvernOrder,
                    tags: state.wyvernAdvancedFilters?.tags || [],
                    rating: state.wyvernAdvancedFilters?.rating !== 'all' ? state.wyvernAdvancedFilters?.rating : undefined,
                    hideNsfw: !state.wyvernAdvancedFilters?.rating ? extension_settings[extensionName].hideNsfw : false
                });

                const cards = result.results.map(transformFunc);
                state.currentCards = cards;

                // For Wyvern, search is done server-side by the API
                // Clear Fuse to prevent stale client-side search from overriding API results
                state.fuse = null;

                // Apply client-side filters (blocklist) and sort
                const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                state.filteredCards = sortCards(filteredCards, state.sortBy);
                state.currentPage = 1; // Reset to page 1 on new search

                updateCachedFiltersAndDropdowns(state, menuContent);
                renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
            } catch (error) {
                console.error('[Bot Browser] Wyvern search failed:', error);
            }
        } else {
            // Lazy initialize Fuse.js when user starts searching
            if (state.filters.search && !state.fuse) {
                console.log('[Bot Browser] Initializing Fuse.js search index...');
                state.fuse = new Fuse(state.currentCards, state.fuseOptions);
            }
            refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc);
        }

        savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy, state.advancedFilters, state.jannyAdvancedFilters, state.ctAdvancedFilters, state.wyvernAdvancedFilters);
    }, 500));

    // Custom Tag Filter Logic
    setupCustomDropdown(
        menuContent.querySelector('#bot-browser-tag-filter'),
        state,
        'tags',
        extensionName,
        extension_settings,
        showCardDetailFunc
    );

    // Custom Creator Filter Logic
    setupCustomDropdown(
        menuContent.querySelector('#bot-browser-creator-filter'),
        state,
        'creator',
        extensionName,
        extension_settings,
        showCardDetailFunc
    );

    // Custom Sort Filter Logic
    setupCustomDropdown(
        menuContent.querySelector('#bot-browser-sort-filter'),
        state,
        'sort',
        extensionName,
        extension_settings,
        showCardDetailFunc
    );

    const clearButton = menuContent.querySelector('.bot-browser-clear-filters');
    clearButton.addEventListener('click', async () => {
        state.filters = { search: '', tags: [], creator: '' };
        state.sortBy = 'relevance';
        searchInput.value = '';

        // Reset custom tag filter
        const tagTriggerText = menuContent.querySelector('#bot-browser-tag-filter .selected-text');
        if (tagTriggerText) tagTriggerText.textContent = 'All Tags';

        // Reset custom creator filter
        const creatorTriggerText = menuContent.querySelector('#bot-browser-creator-filter .selected-text');
        if (creatorTriggerText) creatorTriggerText.textContent = 'All Creators';

        // Reset custom sort filter
        const sortTriggerText = menuContent.querySelector('#bot-browser-sort-filter .selected-text');
        if (sortTriggerText) sortTriggerText.textContent = 'Relevance';

        // Reset advanced filters for Chub
        if (state.isLiveChub) {
            state.advancedFilters = {
                minTokens: null,
                maxTokens: null,
                customTags: '',
                excludeTags: '',
                creatorUsername: '',
                maxDaysAgo: null,
                minAiRating: null,
                requireExamples: false,
                requireLore: false,
                requireGreetings: false
            };

            // Reset advanced filter form fields
            const minTokensInput = menuContent.querySelector('.bot-browser-min-tokens');
            const maxTokensInput = menuContent.querySelector('.bot-browser-max-tokens');
            const customTagsInput = menuContent.querySelector('.bot-browser-custom-tags');
            const excludeTagsInput = menuContent.querySelector('.bot-browser-exclude-tags');
            const creatorInput = menuContent.querySelector('.bot-browser-creator-input');
            const maxDaysInput = menuContent.querySelector('.bot-browser-max-days');
            const minRatingSelect = menuContent.querySelector('.bot-browser-min-rating');
            const requireExamplesCheckbox = menuContent.querySelector('.bot-browser-require-examples');
            const requireLoreCheckbox = menuContent.querySelector('.bot-browser-require-lore');
            const requireGreetingsCheckbox = menuContent.querySelector('.bot-browser-require-greetings');

            if (minTokensInput) minTokensInput.value = '';
            if (maxTokensInput) maxTokensInput.value = '';
            if (customTagsInput) customTagsInput.value = '';
            if (excludeTagsInput) excludeTagsInput.value = '';
            if (creatorInput) creatorInput.value = '';
            if (maxDaysInput) maxDaysInput.value = '';
            if (minRatingSelect) minRatingSelect.value = '';
            if (requireExamplesCheckbox) requireExamplesCheckbox.checked = false;
            if (requireLoreCheckbox) requireLoreCheckbox.checked = false;
            if (requireGreetingsCheckbox) requireGreetingsCheckbox.checked = false;
        }

        savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy, state.advancedFilters, state.jannyAdvancedFilters, state.ctAdvancedFilters, state.wyvernAdvancedFilters);

        // For live Chub, make a fresh API call with cleared filters
        if (state.isLiveChub) {
            try {
                clearButton.disabled = true;
                clearButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                const cards = await loadServiceIndex(state.currentService, true, { sort: state.sortBy, hideNsfw: extension_settings[extensionName].hideNsfw });
                state.currentCards = cards;

                // Apply client-side filters (blocklist, NSFW) and sort
                const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                state.filteredCards = sortCards(filteredCards, state.sortBy);
                state.currentPage = 1;

                updateCachedFiltersAndDropdowns(state, menuContent);
                renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);

                const countContainer = menuContent.querySelector('.bot-browser-results-count');
                if (countContainer) {
                    countContainer.textContent = `Browsing Chub API (${filteredCards.length} cards loaded)`;
                }
            } catch (error) {
                console.error('[Bot Browser] Failed to clear filters:', error);
                toastr.error('Failed to clear filters: ' + error.message);
            } finally {
                clearButton.disabled = false;
                clearButton.innerHTML = '<i class="fa-solid fa-times"></i> Clear Filters';
            }
        } else {
            refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc);
        }
    });
    // Toggle search section
    const toggleSearchButton = menuContent.querySelector('.bot-browser-toggle-search');
    const searchSection = document.getElementById('bot-browser-search-section');

    // Initialize state from current DOM (already set by template)
    state.searchCollapsed = searchSection.classList.contains('collapsed');

    toggleSearchButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        state.searchCollapsed = !state.searchCollapsed;
        saveSearchCollapsed(state.searchCollapsed);

        if (state.searchCollapsed) {
            searchSection.classList.add('collapsed');
            toggleSearchButton.querySelector('i').classList.remove('fa-chevron-up');
            toggleSearchButton.querySelector('i').classList.add('fa-chevron-down');
        } else {
            searchSection.classList.remove('collapsed');
            toggleSearchButton.querySelector('i').classList.remove('fa-chevron-down');
            toggleSearchButton.querySelector('i').classList.add('fa-chevron-up');
        }
    });
}

// Setup advanced filter listeners for live Chub API mode
function setupAdvancedFilterListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc) {
    const toggleBtn = menuContent.querySelector('.bot-browser-toggle-advanced');
    const advancedSection = menuContent.querySelector('.bot-browser-advanced-filters');
    const applyBtn = menuContent.querySelector('.bot-browser-apply-advanced');

    if (!toggleBtn || !advancedSection) return;

    // Toggle collapse
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        advancedSection.classList.toggle('collapsed');
        const toggleIcon = toggleBtn.querySelector('.toggle-icon');
        toggleIcon.classList.toggle('fa-chevron-down');
        toggleIcon.classList.toggle('fa-chevron-up');
    });

    // Apply filters button
    applyBtn.addEventListener('click', async () => {
        // Collect all advanced filter values
        state.advancedFilters = {
            minTokens: parseInt(menuContent.querySelector('.bot-browser-min-tokens').value) || null,
            maxTokens: parseInt(menuContent.querySelector('.bot-browser-max-tokens').value) || null,
            customTags: menuContent.querySelector('.bot-browser-custom-tags').value.trim(),
            excludeTags: menuContent.querySelector('.bot-browser-exclude-tags').value.trim(),
            creatorUsername: menuContent.querySelector('.bot-browser-creator-input').value.trim(),
            maxDaysAgo: parseInt(menuContent.querySelector('.bot-browser-max-days').value) || null,
            minAiRating: parseFloat(menuContent.querySelector('.bot-browser-min-rating').value) || null,
            requireExamples: menuContent.querySelector('.bot-browser-require-examples').checked,
            requireLore: menuContent.querySelector('.bot-browser-require-lore').checked,
            requireGreetings: menuContent.querySelector('.bot-browser-require-greetings').checked
        };

        console.log('[Bot Browser] Applying advanced filters:', state.advancedFilters);

        // Trigger new API search with all filters
        try {
            // Show loading state
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';

            const cards = await loadServiceIndex('chub', true, {
                search: state.filters.search,
                sort: state.sortBy,
                hideNsfw: extension_settings[extensionName].hideNsfw,
                ...state.advancedFilters
            });
            state.currentCards = cards;

            // For live Chub, search is done server-side by the API
            // Clear Fuse to prevent stale client-side search from overriding API results
            state.fuse = null;

            // Apply client-side filters (blocklist, NSFW) and sort
            const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
            state.filteredCards = sortCards(filteredCards, state.sortBy);
            state.currentPage = 1;

            // Update tags/creators dropdowns with new data
            updateCachedFiltersAndDropdowns(state, menuContent);

            renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);

            // Update results count
            const countContainer = menuContent.querySelector('.bot-browser-results-count');
            if (countContainer) {
                countContainer.textContent = `Browsing Chub API (${filteredCards.length} cards loaded)`;
            }
        } catch (error) {
            console.error('[Bot Browser] Chub API advanced filter search failed:', error);
            toastr.error('Failed to apply filters: ' + error.message);
        } finally {
            applyBtn.disabled = false;
            applyBtn.innerHTML = 'Apply Filters';
        }

        // Save to persistent search
        savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy, state.advancedFilters, state.jannyAdvancedFilters, state.ctAdvancedFilters, state.wyvernAdvancedFilters);
    });
}

// Setup JannyAI advanced filter listeners
function setupJannyAdvancedFilterListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc) {
    const toggleBtn = menuContent.querySelector('.bot-browser-toggle-advanced-janny');
    const advancedSection = menuContent.querySelector('.bot-browser-advanced-filters-janny');
    const applyBtn = menuContent.querySelector('.bot-browser-apply-advanced-janny');

    if (!toggleBtn || !advancedSection) return;

    // Toggle collapse
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        advancedSection.classList.toggle('collapsed');
        const toggleIcon = toggleBtn.querySelector('.toggle-icon');
        toggleIcon.classList.toggle('fa-chevron-down');
        toggleIcon.classList.toggle('fa-chevron-up');
    });

    // Apply filters button
    applyBtn.addEventListener('click', async () => {
        // Collect JannyAI advanced filter values
        const hideLowQuality = menuContent.querySelector('.bot-browser-janny-hide-low-quality').checked;
        const minTokensInput = parseInt(menuContent.querySelector('.bot-browser-janny-min-tokens').value) || null;
        const maxTokensInput = parseInt(menuContent.querySelector('.bot-browser-janny-max-tokens').value) || null;

        state.jannyAdvancedFilters = {
            minTokens: hideLowQuality ? Math.max(minTokensInput || 0, 300) : minTokensInput,
            maxTokens: maxTokensInput,
            hideLowQuality: hideLowQuality
        };

        console.log('[Bot Browser] Applying JannyAI advanced filters:', state.jannyAdvancedFilters);

        // Trigger new API search with all filters
        try {
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';

            resetJannyApiState();

            // Map sort options to JannyAI format
            let jannySort = 'createdAtStamp:desc';
            switch (state.sortBy) {
                case 'date_desc': jannySort = 'createdAtStamp:desc'; break;
                case 'date_asc': jannySort = 'createdAtStamp:asc'; break;
                case 'tokens_desc': jannySort = 'totalToken:desc'; break;
                case 'tokens_asc': jannySort = 'totalToken:asc'; break;
                default: jannySort = 'createdAtStamp:desc';
            }

            const searchResults = await searchJannyCharacters({
                search: state.filters.search,
                page: 1,
                limit: 40,
                sort: jannySort,
                minTokens: state.jannyAdvancedFilters.minTokens || 29,
                maxTokens: state.jannyAdvancedFilters.maxTokens || 4101
            });

            const results = searchResults.results?.[0] || {};
            const cards = (results.hits || []).map(hit => transformJannyCard(hit));
            state.currentCards = cards;

            jannyApiState.lastSearch = state.filters.search;
            jannyApiState.lastSort = jannySort;
            jannyApiState.hasMore = (results.totalHits || 0) > cards.length;

            // For JannyAI, search is done server-side by the API
            // Clear Fuse to prevent stale client-side search from overriding API results
            state.fuse = null;

            // Apply client-side filters (blocklist, NSFW) and sort
            const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
            state.filteredCards = sortCards(filteredCards, state.sortBy);
            state.currentPage = 1;

            updateCachedFiltersAndDropdowns(state, menuContent);
            renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);

            const countContainer = menuContent.querySelector('.bot-browser-results-count');
            if (countContainer) {
                countContainer.textContent = `Browsing JannyAI (${filteredCards.length} cards loaded)`;
            }
        } catch (error) {
            console.error('[Bot Browser] JannyAI advanced filter search failed:', error);
            toastr.error('Failed to apply filters: ' + error.message);
        } finally {
            applyBtn.disabled = false;
            applyBtn.innerHTML = 'Apply Filters';
        }

        // Save to persistent search (include jannyAdvancedFilters)
        savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy, state.advancedFilters, state.jannyAdvancedFilters, state.ctAdvancedFilters, state.wyvernAdvancedFilters);
    });
}

// Setup Character Tavern advanced filter listeners
function setupCTAdvancedFilterListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc) {
    const toggleBtn = menuContent.querySelector('.bot-browser-toggle-advanced-ct');
    const advancedSection = menuContent.querySelector('.bot-browser-advanced-filters-ct');
    const applyBtn = menuContent.querySelector('.bot-browser-apply-advanced-ct');

    if (!toggleBtn || !advancedSection) return;

    // Toggle collapse
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        advancedSection.classList.toggle('collapsed');
        const toggleIcon = toggleBtn.querySelector('.toggle-icon');
        toggleIcon.classList.toggle('fa-chevron-down');
        toggleIcon.classList.toggle('fa-chevron-up');
    });

    // Apply filters button
    applyBtn.addEventListener('click', async () => {
        // Collect CT advanced filter values
        const tagsInput = menuContent.querySelector('.bot-browser-ct-tags').value.trim();
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

        state.ctAdvancedFilters = {
            minTokens: parseInt(menuContent.querySelector('.bot-browser-ct-min-tokens').value) || null,
            maxTokens: parseInt(menuContent.querySelector('.bot-browser-ct-max-tokens').value) || null,
            tags: tags,
            hasLorebook: menuContent.querySelector('.bot-browser-ct-has-lorebook').checked,
            isOC: menuContent.querySelector('.bot-browser-ct-is-oc').checked
        };

        console.log('[Bot Browser] Applying Character Tavern advanced filters:', state.ctAdvancedFilters);

        // Trigger new API search with all filters
        try {
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';

            resetCharacterTavernState();

            const cards = await searchCharacterTavern({
                query: state.filters.search,
                page: 1,
                limit: 30,
                hasLorebook: state.ctAdvancedFilters.hasLorebook || undefined,
                isOC: state.ctAdvancedFilters.isOC || undefined,
                minTokens: state.ctAdvancedFilters.minTokens || undefined,
                maxTokens: state.ctAdvancedFilters.maxTokens || undefined,
                tags: state.ctAdvancedFilters.tags
            });

            state.currentCards = cards;

            // For CT, search is done server-side by the API
            // Clear Fuse to prevent stale client-side search from overriding API results
            state.fuse = null;

            // Apply client-side filters (blocklist, NSFW) and sort
            const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
            state.filteredCards = sortCards(filteredCards, state.sortBy);
            state.currentPage = 1;

            updateCachedFiltersAndDropdowns(state, menuContent);
            renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);

            const countContainer = menuContent.querySelector('.bot-browser-results-count');
            if (countContainer) {
                countContainer.textContent = `Browsing Character Tavern (${filteredCards.length} cards loaded)`;
            }
        } catch (error) {
            console.error('[Bot Browser] Character Tavern advanced filter search failed:', error);
            toastr.error('Failed to apply filters: ' + error.message);
        } finally {
            applyBtn.disabled = false;
            applyBtn.innerHTML = 'Apply Filters';
        }

        // Save to persistent search (include ctAdvancedFilters)
        savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy, state.advancedFilters, state.jannyAdvancedFilters, state.ctAdvancedFilters, state.wyvernAdvancedFilters);
    });
}

// Setup Wyvern advanced filter listeners
function setupWyvernAdvancedFilterListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc) {
    const toggleBtn = menuContent.querySelector('.bot-browser-toggle-advanced-wyvern');
    const advancedSection = menuContent.querySelector('.bot-browser-advanced-filters-wyvern');
    const applyBtn = menuContent.querySelector('.bot-browser-apply-advanced-wyvern');

    if (!toggleBtn || !advancedSection) return;

    // Toggle collapse
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        advancedSection.classList.toggle('collapsed');
        const toggleIcon = toggleBtn.querySelector('.toggle-icon');
        toggleIcon.classList.toggle('fa-chevron-down');
        toggleIcon.classList.toggle('fa-chevron-up');
    });

    // Apply filters button
    applyBtn.addEventListener('click', async () => {
        // Collect Wyvern advanced filter values
        const tagsInput = menuContent.querySelector('.bot-browser-wyvern-tags').value.trim();
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

        state.wyvernAdvancedFilters = {
            rating: menuContent.querySelector('.bot-browser-wyvern-rating').value,
            tags: tags
        };

        console.log('[Bot Browser] Applying Wyvern advanced filters:', state.wyvernAdvancedFilters);

        // Trigger new API search with all filters
        try {
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';

            if (state.isWyvernLorebooks) {
                resetWyvernLorebooksApiState();
            } else {
                resetWyvernApiState();
            }

            // Map sort options to Wyvern format
            let wyvernSort = 'votes';
            let wyvernOrder = 'DESC';
            switch (state.sortBy) {
                case 'date_desc': wyvernSort = 'created_at'; wyvernOrder = 'DESC'; break;
                case 'date_asc': wyvernSort = 'created_at'; wyvernOrder = 'ASC'; break;
                case 'name_asc': wyvernSort = 'name'; wyvernOrder = 'ASC'; break;
                case 'name_desc': wyvernSort = 'name'; wyvernOrder = 'DESC'; break;
                default: wyvernSort = 'votes'; wyvernOrder = 'DESC';
            }

            const searchFunc = state.isWyvernLorebooks ? searchWyvernLorebooks : searchWyvernCharacters;
            const transformFunc = state.isWyvernLorebooks ? transformWyvernLorebook : transformWyvernCard;

            const result = await searchFunc({
                search: state.filters.search,
                page: 1,
                limit: 40,
                sort: wyvernSort,
                order: wyvernOrder,
                tags: state.wyvernAdvancedFilters.tags,
                rating: state.wyvernAdvancedFilters.rating !== 'all' ? state.wyvernAdvancedFilters.rating : undefined,
                hideNsfw: false // Don't use hideNsfw when explicit rating is set
            });

            const cards = result.results.map(transformFunc);
            state.currentCards = cards;

            // Clear Fuse for server-side search
            state.fuse = null;

            // Apply client-side filters (blocklist, etc.) but NOT NSFW filter when rating is explicitly set
            const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
            state.filteredCards = sortCards(filteredCards, state.sortBy);
            state.currentPage = 1;

            updateCachedFiltersAndDropdowns(state, menuContent);
            renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);

            const countContainer = menuContent.querySelector('.bot-browser-results-count');
            if (countContainer) {
                countContainer.textContent = `Browsing Wyvern Chat (${filteredCards.length} cards loaded)`;
            }
        } catch (error) {
            console.error('[Bot Browser] Wyvern advanced filter search failed:', error);
            toastr.error('Failed to apply filters: ' + error.message);
        } finally {
            applyBtn.disabled = false;
            applyBtn.innerHTML = 'Apply Filters';
        }

        // Save to persistent search
        savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy, state.advancedFilters, state.jannyAdvancedFilters, state.ctAdvancedFilters, state.wyvernAdvancedFilters);
    });
}

function setupCustomDropdown(container, state, filterType, extensionName, extension_settings, showCardDetailFunc) {
    if (!container) return;

    const trigger = container.querySelector('.bot-browser-multi-select-trigger');
    const dropdown = container.querySelector('.bot-browser-multi-select-dropdown');
    const searchInput = container.querySelector('.bot-browser-multi-select-search input');
    const optionsContainer = container.querySelector('.bot-browser-multi-select-options');

    // Sort dropdown doesn't have search
    const hasSearch = searchInput !== null;

    // Toggle dropdown - shared handler for both click and touch
    const toggleDropdown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isOpen = dropdown.classList.contains('open');

        // Close all other dropdowns
        document.querySelectorAll('.bot-browser-multi-select-dropdown').forEach(d => {
            if (d !== dropdown) {
                d.classList.remove('open');
                d.style.position = '';
                d.style.top = '';
                d.style.left = '';
                d.style.right = '';
                d.style.width = '';
            }
        });

        if (!isOpen) {
            dropdown.classList.add('open');

            // On mobile, use fixed positioning to escape overflow containers
            const isMobile = window.innerWidth <= 600;
            if (isMobile) {
                const triggerRect = trigger.getBoundingClientRect();
                dropdown.style.position = 'fixed';
                dropdown.style.top = `${triggerRect.bottom + 4}px`;
                dropdown.style.left = '5vw';
                dropdown.style.right = '5vw';
                dropdown.style.width = 'auto';
            }

            if (hasSearch && searchInput) {
                // Delay focus on mobile to prevent keyboard issues
                setTimeout(() => searchInput.focus(), 100);
            }
        } else {
            dropdown.classList.remove('open');
            // Reset positioning
            dropdown.style.position = '';
            dropdown.style.top = '';
            dropdown.style.left = '';
            dropdown.style.right = '';
            dropdown.style.width = '';
        }
    };

    // Add both click and touch handlers for mobile compatibility
    trigger.addEventListener('click', toggleDropdown);
    trigger.addEventListener('touchend', toggleDropdown, { passive: false });

    // Search functionality (only for dropdowns with search)
    if (hasSearch && searchInput) {
        // Prevent dropdown from closing when clicking on search input
        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Also handle touch to prevent dropdown close on mobile
        searchInput.addEventListener('touchend', (e) => {
            e.stopPropagation();
        }, { passive: false });

        // Search functionality
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const options = optionsContainer.querySelectorAll('.bot-browser-multi-select-option');

            options.forEach(option => {
                const text = option.querySelector('span').textContent.toLowerCase();
                if (text.includes(query) || option.dataset.value === '') {
                    option.style.display = 'flex';
                } else {
                    option.style.display = 'none';
                }
            });
        });
    }

    // Option Selection - shared handler for click and touch
    const handleOptionSelect = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const option = e.target.closest('.bot-browser-multi-select-option');
        if (!option) return;

        const value = option.dataset.value;

        if (filterType === 'tags') {
            if (value === '') {
                // Clear all tags
                state.filters.tags = [];
            } else {
                // Toggle tag selection
                if (state.filters.tags.includes(value)) {
                    state.filters.tags = state.filters.tags.filter(t => t !== value);
                } else {
                    state.filters.tags.push(value);
                }
            }

            // Save and refresh
            savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy, state.advancedFilters, state.jannyAdvancedFilters, state.ctAdvancedFilters, state.wyvernAdvancedFilters);
            refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc);

            // Keep dropdown open for multi-select
            // The updateFilterUI function will handle updating the selected states
        } else if (filterType === 'creator') {
            state.filters.creator = value;

            // Save and refresh
            savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy, state.advancedFilters, state.jannyAdvancedFilters, state.ctAdvancedFilters, state.wyvernAdvancedFilters);
            refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc);

            // Close dropdown for single select
            dropdown.classList.remove('open');
        } else if (filterType === 'sort') {
            state.sortBy = value;

            // For live Chub, trigger fresh API call with new sort
            if (state.isLiveChub) {
                console.log('[Bot Browser] Triggering Chub API sort:', state.sortBy);
                (async () => {
                    try {
                        const cards = await loadServiceIndex('chub', true, {
                            search: state.filters.search,
                            sort: state.sortBy,
                            hideNsfw: extension_settings[extensionName].hideNsfw,
                            ...(state.advancedFilters || {})
                        });
                        state.currentCards = cards;

                        // For live Chub, search is done server-side by the API
                        // Clear Fuse to prevent stale client-side search from overriding API results
                        state.fuse = null;

                        // Apply client-side filters (blocklist, NSFW) and sort
                        const menuContent = document.querySelector('.bot-browser-content');
                        const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                        state.filteredCards = sortCards(filteredCards, state.sortBy);
                        state.currentPage = 1; // Reset to page 1 on new sort

                        // Update tags/creators dropdowns with new data
                        updateCachedFiltersAndDropdowns(state, menuContent);

                        renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
                    } catch (error) {
                        console.error('[Bot Browser] Chub API sort failed:', error);
                    }
                })();
            } else if (state.isJannyAI) {
                // For JannyAI, trigger fresh API call with new sort
                console.log('[Bot Browser] Triggering JannyAI sort:', state.sortBy);
                (async () => {
                    try {
                        resetJannyApiState();

                        // Map sort options to JannyAI format
                        let jannySort = 'createdAtStamp:desc';
                        switch (state.sortBy) {
                            case 'date_desc': jannySort = 'createdAtStamp:desc'; break;
                            case 'date_asc': jannySort = 'createdAtStamp:asc'; break;
                            case 'tokens_desc': jannySort = 'totalToken:desc'; break;
                            case 'tokens_asc': jannySort = 'totalToken:asc'; break;
                            default: jannySort = 'createdAtStamp:desc';
                        }

                        const searchResults = await searchJannyCharacters({
                            search: state.filters.search,
                            page: 1,
                            limit: 40,
                            sort: jannySort,
                            minTokens: state.jannyAdvancedFilters?.minTokens || 29,
                            maxTokens: state.jannyAdvancedFilters?.maxTokens || 4101
                        });

                        const results = searchResults.results?.[0] || {};
                        const cards = (results.hits || []).map(hit => transformJannyCard(hit));
                        state.currentCards = cards;

                        jannyApiState.lastSearch = state.filters.search;
                        jannyApiState.lastSort = jannySort;
                        jannyApiState.hasMore = (results.totalHits || 0) > cards.length;

                        // For JannyAI, search is done server-side by the API
                        // Clear Fuse to prevent stale client-side search from overriding API results
                        state.fuse = null;

                        // Apply client-side filters (blocklist, NSFW) and sort
                        const menuContent = document.querySelector('.bot-browser-content');
                        const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                        state.filteredCards = sortCards(filteredCards, state.sortBy);
                        state.currentPage = 1; // Reset to page 1 on new sort

                        updateCachedFiltersAndDropdowns(state, menuContent);
                        renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
                    } catch (error) {
                        console.error('[Bot Browser] JannyAI sort failed:', error);
                    }
                })();
            } else if (state.isCharacterTavern) {
                // For Character Tavern, trigger fresh API call with new sort
                console.log('[Bot Browser] Triggering Character Tavern sort:', state.sortBy);
                (async () => {
                    try {
                        resetCharacterTavernState();

                        const cards = await searchCharacterTavern({
                            query: state.filters.search,
                            page: 1,
                            limit: 30,
                            hasLorebook: state.ctAdvancedFilters?.hasLorebook || undefined,
                            isOC: state.ctAdvancedFilters?.isOC || undefined,
                            minTokens: state.ctAdvancedFilters?.minTokens || undefined,
                            maxTokens: state.ctAdvancedFilters?.maxTokens || undefined,
                            tags: state.ctAdvancedFilters?.tags || []
                        });

                        state.currentCards = cards;

                        // For CT, search is done server-side by the API
                        // Clear Fuse to prevent stale client-side search from overriding API results
                        state.fuse = null;

                        // Apply client-side filters (blocklist, NSFW) and sort
                        const menuContent = document.querySelector('.bot-browser-content');
                        const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                        state.filteredCards = sortCards(filteredCards, state.sortBy);
                        state.currentPage = 1; // Reset to page 1 on new sort

                        updateCachedFiltersAndDropdowns(state, menuContent);
                        renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
                    } catch (error) {
                        console.error('[Bot Browser] Character Tavern sort failed:', error);
                    }
                })();
            } else if (state.isWyvern) {
                // For Wyvern, trigger fresh API call with new sort
                console.log('[Bot Browser] Triggering Wyvern sort:', state.sortBy);
                (async () => {
                    try {
                        if (state.isWyvernLorebooks) {
                            resetWyvernLorebooksApiState();
                        } else {
                            resetWyvernApiState();
                        }

                        // Map sort options to Wyvern format
                        let wyvernSort = 'votes';
                        let wyvernOrder = 'DESC';
                        switch (state.sortBy) {
                            case 'date_desc': wyvernSort = 'created_at'; wyvernOrder = 'DESC'; break;
                            case 'date_asc': wyvernSort = 'created_at'; wyvernOrder = 'ASC'; break;
                            case 'name_asc': wyvernSort = 'name'; wyvernOrder = 'ASC'; break;
                            case 'name_desc': wyvernSort = 'name'; wyvernOrder = 'DESC'; break;
                            default: wyvernSort = 'votes'; wyvernOrder = 'DESC';
                        }

                        const searchFunc = state.isWyvernLorebooks ? searchWyvernLorebooks : searchWyvernCharacters;
                        const transformFunc = state.isWyvernLorebooks ? transformWyvernLorebook : transformWyvernCard;

                        const result = await searchFunc({
                            search: state.filters.search,
                            page: 1,
                            limit: 40,
                            sort: wyvernSort,
                            order: wyvernOrder,
                            tags: state.wyvernAdvancedFilters?.tags || [],
                            rating: state.wyvernAdvancedFilters?.rating !== 'all' ? state.wyvernAdvancedFilters?.rating : undefined,
                            hideNsfw: !state.wyvernAdvancedFilters?.rating ? extension_settings[extensionName].hideNsfw : false
                        });

                        const cards = result.results.map(transformFunc);
                        state.currentCards = cards;

                        // For Wyvern, search is done server-side by the API
                        // Clear Fuse to prevent stale client-side search from overriding API results
                        state.fuse = null;

                        // Apply client-side filters (blocklist) and sort
                        const menuContent = document.querySelector('.bot-browser-content');
                        const filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                        state.filteredCards = sortCards(filteredCards, state.sortBy);
                        state.currentPage = 1; // Reset to page 1 on new sort

                        updateCachedFiltersAndDropdowns(state, menuContent);
                        renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
                    } catch (error) {
                        console.error('[Bot Browser] Wyvern sort failed:', error);
                    }
                })();
            } else {
                // Standard refresh for non-Chub sources
                refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc);
            }

            // Save and close dropdown
            savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy, state.advancedFilters, state.jannyAdvancedFilters, state.ctAdvancedFilters, state.wyvernAdvancedFilters);
            dropdown.classList.remove('open');
        }
    };

    // Add click handler
    optionsContainer.addEventListener('click', handleOptionSelect);

    // Touch handling - detect tap vs scroll
    let touchStartY = 0;
    let touchStartTime = 0;
    const SCROLL_THRESHOLD = 10; // pixels of movement to consider it a scroll

    optionsContainer.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }, { passive: true });

    optionsContainer.addEventListener('touchend', (e) => {
        const touchEndY = e.changedTouches[0].clientY;
        const touchDuration = Date.now() - touchStartTime;
        const touchDistance = Math.abs(touchEndY - touchStartY);

        // Only select if it was a tap (minimal movement, quick touch)
        if (touchDistance < SCROLL_THRESHOLD && touchDuration < 500) {
            handleOptionSelect(e);
        }
    }, { passive: false });
}




function renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const gridContainer = menuContent.querySelector('.bot-browser-card-grid');
    if (!gridContainer) return;

    const cardsPerPage = extension_settings[extensionName].cardsPerPage || 200;

    // Calculate which cards to show
    const startIndex = (state.currentPage - 1) * cardsPerPage;
    const endIndex = startIndex + cardsPerPage;
    const pageCards = state.filteredCards.slice(startIndex, endIndex);

    // Create HTML for page cards
    const cardsHTML = pageCards.map(card => createCardHTML(card)).join('');

    // Create pagination HTML - for live APIs (Chub/JannyAI/CT/Wyvern) and trending, don't show total pages
    const chubApiState = state.isLorebooks ? getChubLorebooksApiState() : getChubApiState();
    const ctApiState = getCharacterTavernApiState();
    const wyvernApiState = state.isWyvernLorebooks ? getWyvernLorebooksApiState() : getWyvernApiState();

    let paginationHTML;
    if (state.isJannyAITrending) {
        paginationHTML = createChubPaginationHTML(jannyTrendingState.page, jannyTrendingState.hasMore, false);
    } else if (state.isChubTrending) {
        paginationHTML = createChubPaginationHTML(chubTrendingState.page, chubTrendingState.hasMore, false);
    } else if (state.isWyvernTrending) {
        paginationHTML = createChubPaginationHTML(wyvernTrendingState.page, wyvernTrendingState.hasMore, false);
    } else if (state.isLiveChub) {
        paginationHTML = createChubPaginationHTML(state.currentPage, chubApiState.hasMore, state.currentPage * cardsPerPage < state.filteredCards.length);
    } else if (state.isJannyAI) {
        paginationHTML = createChubPaginationHTML(jannyApiState.page, jannyApiState.hasMore, false);
    } else if (state.isCharacterTavern) {
        paginationHTML = createChubPaginationHTML(ctApiState.page, ctApiState.hasMore, false);
    } else if (state.isWyvern) {
        paginationHTML = createChubPaginationHTML(wyvernApiState.page, wyvernApiState.hasMore, false);
    } else {
        paginationHTML = createPaginationHTML(state.currentPage, state.totalPages);
    }

    // Set grid content
    gridContainer.innerHTML = cardsHTML + paginationHTML;

    // Attach card click listeners
    gridContainer.querySelectorAll('.bot-browser-card-thumbnail').forEach(cardEl => {
        cardEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const cardId = cardEl.dataset.cardId;
            const card = state.currentCards.find(c => c.id === cardId);
            if (card) {
                await showCardDetailFunc(card);
            }
        });
    });

    // Attach pagination listeners
    if (state.isJannyAITrending) {
        setupJannyTrendingPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings);
    } else if (state.isChubTrending) {
        setupChubTrendingPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings);
    } else if (state.isWyvernTrending) {
        setupWyvernTrendingPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings);
    } else if (state.isLiveChub) {
        setupChubPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings);
    } else if (state.isJannyAI) {
        setupJannyPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings);
    } else if (state.isCharacterTavern) {
        setupCTPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings);
    } else if (state.isWyvern) {
        setupWyvernPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings);
    } else {
        setupPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings);
    }

    // Force scroll to top - scroll the wrapper which contains search + grid
    const wrapper = menuContent.querySelector('.bot-browser-card-grid-wrapper');
    if (wrapper) wrapper.scrollTop = 0;

    // Validate images with Intersection Observer (no delay needed)
    validateCardImages();

    if (state.isLiveChub) {
        console.log(`[Bot Browser] Rendered Chub page ${state.currentPage} (${pageCards.length} cards)`);
    } else if (state.isJannyAI) {
        console.log(`[Bot Browser] Rendered JannyAI API page ${jannyApiState.page} (${pageCards.length} cards)`);
    } else if (state.isCharacterTavern) {
        console.log(`[Bot Browser] Rendered Character Tavern API page ${ctApiState.page} (${pageCards.length} cards)`);
    } else {
        console.log(`[Bot Browser] Rendered page ${state.currentPage}/${state.totalPages}`);
    }
}

// Chub pagination HTML - just prev/next buttons, no total pages
function createChubPaginationHTML(currentPage, hasMoreFromApi, hasMoreCached) {
    // Enable next if there are more cached cards or API has more
    const canGoNext = hasMoreCached || hasMoreFromApi;
    return `
        <div class="bot-browser-pagination">
            <button class="bot-browser-pagination-btn" data-action="prev" ${currentPage === 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-angle-left"></i> Previous
            </button>
            <span class="bot-browser-pagination-info">
                Page ${currentPage}
            </span>
            <button class="bot-browser-pagination-btn" data-action="next" ${!canGoNext ? 'disabled' : ''}>
                Next <i class="fa-solid fa-angle-right"></i>
            </button>
        </div>
    `;
}

// Setup Chub pagination listeners - loads more from API when needed
function setupChubPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const pagination = gridContainer.querySelector('.bot-browser-pagination');
    if (!pagination) return;

    const cardsPerPage = extension_settings[extensionName].cardsPerPage || 200;

    pagination.querySelectorAll('.bot-browser-pagination-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;

            if (action === 'prev' && state.currentPage > 1) {
                state.currentPage--;
                renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
            } else if (action === 'next') {
                const nextPageStart = state.currentPage * cardsPerPage;

                // Use appropriate state and loader based on whether this is lorebooks or cards
                const apiState = state.isLorebooks ? getChubLorebooksApiState() : getChubApiState();
                const loadMoreFunc = state.isLorebooks ? loadMoreChubLorebooks : loadMoreChubCards;

                // Keep loading until we have enough filtered cards for the next page OR API runs out
                let loadAttempts = 0;
                const maxLoadAttempts = 10; // Prevent infinite loops

                while (nextPageStart >= state.filteredCards.length && apiState.hasMore && !apiState.isLoading && loadAttempts < maxLoadAttempts) {
                    // Disable button and show loading
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

                    try {
                        loadAttempts++;
                        console.log(`[Bot Browser] Loading more Chub cards (attempt ${loadAttempts}), need ${nextPageStart - state.filteredCards.length + 1} more filtered cards`);

                        const newItems = await loadMoreFunc({
                            search: state.filters.search,
                            sort: state.sortBy,
                            hideNsfw: extension_settings[extensionName].hideNsfw,
                            ...(state.advancedFilters || {})
                        });

                        if (newItems.length > 0) {
                            // Deduplicate new items against existing ones
                            const existingIds = new Set(state.currentCards.map(c => c.id).filter(Boolean));
                            const uniqueNewItems = newItems.filter(c => !c.id || !existingIds.has(c.id));

                            state.currentCards.push(...uniqueNewItems);

                            // Only filter and append NEW items to preserve existing order
                            const filteredNewItems = applyClientSideFilters(uniqueNewItems, state, extensionName, extension_settings);
                            state.filteredCards.push(...filteredNewItems);

                            updateCachedFiltersAndDropdowns(state, menuContent);
                        } else {
                            break;
                        }
                    } catch (error) {
                        console.error('[Bot Browser] Failed to load more:', error);
                        toastr.error('Failed to load more');
                        btn.disabled = false;
                        btn.innerHTML = 'Next <i class="fa-solid fa-angle-right"></i>';
                        return;
                    }
                }

                // Only go to next page if we actually have cards to show
                if (state.filteredCards.length > nextPageStart) {
                    state.currentPage++;
                    renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
                } else {
                    // No more cards available after filtering
                    toastr.info('No more cards available (all remaining cards were filtered out)');
                    btn.disabled = false;
                    btn.innerHTML = 'Next <i class="fa-solid fa-angle-right"></i>';
                }
            }
        });
    });
}

// Setup JannyAI pagination - uses API pagination directly (1 API page = 1 UI page)
function setupJannyPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const pagination = gridContainer.querySelector('.bot-browser-pagination');
    if (!pagination) return;

    pagination.querySelectorAll('.bot-browser-pagination-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;

            // Helper to fetch and display an API page
            const fetchApiPage = async (pageNum) => {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

                try {
                    console.log(`[Bot Browser] Fetching JannyAI API page ${pageNum}`);

                    const searchResults = await searchJannyCharacters({
                        search: jannyApiState.lastSearch,
                        page: pageNum,
                        limit: 40,
                        sort: jannyApiState.lastSort,
                        minTokens: state.jannyAdvancedFilters?.minTokens || 29,
                        maxTokens: state.jannyAdvancedFilters?.maxTokens || 4101
                    });

                    const results = searchResults.results?.[0] || {};
                    const cards = (results.hits || []).map(hit => transformJannyCard(hit));

                    // Update API state
                    jannyApiState.page = pageNum;
                    jannyApiState.hasMore = (results.totalHits || 0) > (pageNum * 40);

                    // REPLACE cards (not accumulate)
                    state.currentCards = cards;

                    // For JannyAI, search is done server-side by the API
                    // Clear Fuse to prevent stale client-side search from overriding API results
                    state.fuse = null;
                    state.filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);

                    updateCachedFiltersAndDropdowns(state, menuContent);
                    renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);

                    console.log(`[Bot Browser] Displaying JannyAI API page ${pageNum} (${cards.length} cards)`);
                } catch (error) {
                    console.error('[Bot Browser] Failed to fetch JannyAI page:', error);
                    toastr.error('Failed to load page');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = action === 'next'
                        ? 'Next <i class="fa-solid fa-angle-right"></i>'
                        : '<i class="fa-solid fa-angle-left"></i> Previous';
                }
            };

            if (action === 'prev' && jannyApiState.page > 1) {
                await fetchApiPage(jannyApiState.page - 1);
            } else if (action === 'next' && jannyApiState.hasMore) {
                await fetchApiPage(jannyApiState.page + 1);
            }
        });
    });
}

// Setup Character Tavern pagination - uses API pagination directly (1 API page = 1 UI page)
function setupCTPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const pagination = gridContainer.querySelector('.bot-browser-pagination');
    if (!pagination) return;

    const ctApiState = getCharacterTavernApiState();

    pagination.querySelectorAll('.bot-browser-pagination-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;

            // Helper to fetch and display an API page
            const fetchApiPage = async (pageNum) => {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

                try {
                    console.log(`[Bot Browser] Fetching Character Tavern API page ${pageNum}`);

                    const cards = await searchCharacterTavern({
                        query: state.filters.search,
                        page: pageNum,
                        limit: 30,
                        hasLorebook: state.ctAdvancedFilters?.hasLorebook || undefined,
                        isOC: state.ctAdvancedFilters?.isOC || undefined,
                        minTokens: state.ctAdvancedFilters?.minTokens || undefined,
                        maxTokens: state.ctAdvancedFilters?.maxTokens || undefined,
                        tags: state.ctAdvancedFilters?.tags || []
                    });

                    // REPLACE cards (not accumulate)
                    state.currentCards = cards;

                    // For CT, search is done server-side by the API
                    // Clear Fuse to prevent stale client-side search from overriding API results
                    state.fuse = null;
                    state.filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);

                    updateCachedFiltersAndDropdowns(state, menuContent);
                    renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);

                    console.log(`[Bot Browser] Displaying Character Tavern API page ${pageNum} (${cards.length} cards)`);
                } catch (error) {
                    console.error('[Bot Browser] Failed to fetch Character Tavern page:', error);
                    toastr.error('Failed to load page');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = action === 'next'
                        ? 'Next <i class="fa-solid fa-angle-right"></i>'
                        : '<i class="fa-solid fa-angle-left"></i> Previous';
                }
            };

            if (action === 'prev' && ctApiState.page > 1) {
                await fetchApiPage(ctApiState.page - 1);
            } else if (action === 'next' && ctApiState.hasMore) {
                await fetchApiPage(ctApiState.page + 1);
            }
        });
    });
}

// Setup Wyvern pagination - uses API pagination directly (1 API page = 1 UI page)
function setupWyvernPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const pagination = gridContainer.querySelector('.bot-browser-pagination');
    if (!pagination) return;

    const wyvernApiState = state.isWyvernLorebooks ? getWyvernLorebooksApiState() : getWyvernApiState();

    pagination.querySelectorAll('.bot-browser-pagination-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;

            // Helper to fetch and display an API page
            const fetchApiPage = async (pageNum) => {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

                try {
                    console.log(`[Bot Browser] Fetching Wyvern API page ${pageNum}`);

                    // Map sort options to Wyvern format
                    let wyvernSort = 'votes';
                    let wyvernOrder = 'DESC';
                    switch (state.sortBy) {
                        case 'date_desc': wyvernSort = 'created_at'; wyvernOrder = 'DESC'; break;
                        case 'date_asc': wyvernSort = 'created_at'; wyvernOrder = 'ASC'; break;
                        case 'name_asc': wyvernSort = 'name'; wyvernOrder = 'ASC'; break;
                        case 'name_desc': wyvernSort = 'name'; wyvernOrder = 'DESC'; break;
                        default: wyvernSort = 'votes'; wyvernOrder = 'DESC';
                    }

                    const searchFunc = state.isWyvernLorebooks ? searchWyvernLorebooks : searchWyvernCharacters;
                    const transformFunc = state.isWyvernLorebooks ? transformWyvernLorebook : transformWyvernCard;

                    const result = await searchFunc({
                        search: state.filters.search,
                        page: pageNum,
                        limit: 40,
                        sort: wyvernSort,
                        order: wyvernOrder,
                        tags: state.wyvernAdvancedFilters?.tags || [],
                        rating: state.wyvernAdvancedFilters?.rating !== 'all' ? state.wyvernAdvancedFilters?.rating : undefined,
                        hideNsfw: !state.wyvernAdvancedFilters?.rating ? extension_settings[extensionName].hideNsfw : false
                    });

                    const cards = result.results.map(transformFunc);

                    // REPLACE cards (not accumulate)
                    state.currentCards = cards;

                    // For Wyvern, search is done server-side by the API
                    // Clear Fuse to prevent stale client-side search from overriding API results
                    state.fuse = null;
                    state.filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);

                    updateCachedFiltersAndDropdowns(state, menuContent);
                    renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);

                    console.log(`[Bot Browser] Displaying Wyvern API page ${pageNum} (${cards.length} cards)`);
                } catch (error) {
                    console.error('[Bot Browser] Failed to fetch Wyvern page:', error);
                    toastr.error('Failed to load page');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = action === 'next'
                        ? 'Next <i class="fa-solid fa-angle-right"></i>'
                        : '<i class="fa-solid fa-angle-left"></i> Previous';
                }
            };

            if (action === 'prev' && wyvernApiState.page > 1) {
                await fetchApiPage(wyvernApiState.page - 1);
            } else if (action === 'next' && wyvernApiState.hasMore) {
                await fetchApiPage(wyvernApiState.page + 1);
            }
        });
    });
}

// Setup Chub Trending pagination - uses API pagination
function setupChubTrendingPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const pagination = gridContainer.querySelector('.bot-browser-pagination');
    if (!pagination) return;

    pagination.querySelectorAll('.bot-browser-pagination-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;

            const fetchApiPage = async (pageNum) => {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

                try {
                    console.log(`[Bot Browser] Fetching Chub trending page ${pageNum}`);
                    const result = await fetchChubTrending({
                        page: pageNum,
                        limit: 48,
                        nsfw: !extension_settings[extensionName].hideNsfw
                    });
                    const cards = (result.nodes || []).map(transformChubTrendingCard);

                    // Replace current cards with new page
                    state.currentCards = cards;
                    state.filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                    state.currentPage = 1;
                    state.totalPages = 1;

                    renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
                    console.log(`[Bot Browser] Displaying Chub trending page ${pageNum} (${cards.length} cards)`);
                } catch (error) {
                    console.error('[Bot Browser] Failed to fetch Chub trending page:', error);
                    toastr.error('Failed to load page');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = action === 'next'
                        ? 'Next <i class="fa-solid fa-angle-right"></i>'
                        : '<i class="fa-solid fa-angle-left"></i> Previous';
                }
            };

            if (action === 'prev' && chubTrendingState.page > 1) {
                await fetchApiPage(chubTrendingState.page - 1);
            } else if (action === 'next' && chubTrendingState.hasMore) {
                await fetchApiPage(chubTrendingState.page + 1);
            }
        });
    });
}

// Setup JannyAI Trending pagination - uses API pagination
function setupJannyTrendingPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const pagination = gridContainer.querySelector('.bot-browser-pagination');
    if (!pagination) return;

    pagination.querySelectorAll('.bot-browser-pagination-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;

            const fetchApiPage = async (pageNum) => {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

                try {
                    console.log(`[Bot Browser] Fetching JanitorAI/JannyAI trending page ${pageNum}`);
                    const result = await fetchJannyTrending({ page: pageNum, limit: 40 });
                    const cards = (result.characters || []).map(transformJannyTrendingCard);

                    // Replace current cards with new page
                    state.currentCards = cards;
                    state.filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                    state.currentPage = 1;
                    state.totalPages = 1;

                    renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
                    console.log(`[Bot Browser] Displaying JanitorAI/JannyAI trending page ${pageNum} (${cards.length} cards)`);
                } catch (error) {
                    console.error('[Bot Browser] Failed to fetch JannyAI trending page:', error);
                    toastr.error('Failed to load page');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = action === 'next'
                        ? 'Next <i class="fa-solid fa-angle-right"></i>'
                        : '<i class="fa-solid fa-angle-left"></i> Previous';
                }
            };

            if (action === 'prev' && jannyTrendingState.page > 1) {
                await fetchApiPage(jannyTrendingState.page - 1);
            } else if (action === 'next' && jannyTrendingState.hasMore) {
                await fetchApiPage(jannyTrendingState.page + 1);
            }
        });
    });
}

// Setup Wyvern Trending pagination - uses API pagination
function setupWyvernTrendingPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const pagination = gridContainer.querySelector('.bot-browser-pagination');
    if (!pagination) return;

    pagination.querySelectorAll('.bot-browser-pagination-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;

            const fetchApiPage = async (pageNum) => {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

                try {
                    console.log(`[Bot Browser] Fetching Wyvern trending page ${pageNum}`);
                    const result = await fetchWyvernTrending({
                        page: pageNum,
                        limit: 40,
                        sort: 'nsfw-popular',
                        rating: extension_settings[extensionName].hideNsfw ? 'none' : 'all'
                    });
                    const cards = (result.results || []).map(transformWyvernTrendingCard);

                    // Replace current cards with new page
                    state.currentCards = cards;
                    state.filteredCards = applyClientSideFilters(cards, state, extensionName, extension_settings);
                    state.currentPage = 1;
                    state.totalPages = 1;

                    renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
                    console.log(`[Bot Browser] Displaying Wyvern trending page ${pageNum} (${cards.length} cards)`);
                } catch (error) {
                    console.error('[Bot Browser] Failed to fetch Wyvern trending page:', error);
                    toastr.error('Failed to load page');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = action === 'next'
                        ? 'Next <i class="fa-solid fa-angle-right"></i>'
                        : '<i class="fa-solid fa-angle-left"></i> Previous';
                }
            };

            if (action === 'prev' && wyvernTrendingState.page > 1) {
                await fetchApiPage(wyvernTrendingState.page - 1);
            } else if (action === 'next' && wyvernTrendingState.hasMore) {
                await fetchApiPage(wyvernTrendingState.page + 1);
            }
        });
    });
}

function createPaginationHTML(currentPage, totalPages) {
    if (totalPages <= 1) return '';

    return `
        <div class="bot-browser-pagination">
            <button class="bot-browser-pagination-btn" data-action="first" ${currentPage === 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-angles-left"></i>
            </button>
            <button class="bot-browser-pagination-btn" data-action="prev" ${currentPage === 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-angle-left"></i>
            </button>
            <span class="bot-browser-pagination-info">
                <input type="number" class="bot-browser-pagination-input" min="1" max="${totalPages}" value="${currentPage}">
                <span>/ ${totalPages}</span>
            </span>
            <button class="bot-browser-pagination-btn" data-action="next" ${currentPage === totalPages ? 'disabled' : ''}>
                <i class="fa-solid fa-angle-right"></i>
            </button>
            <button class="bot-browser-pagination-btn" data-action="last" ${currentPage === totalPages ? 'disabled' : ''}>
                <i class="fa-solid fa-angles-right"></i>
            </button>
        </div>
    `;
}

function setupPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const pagination = gridContainer.querySelector('.bot-browser-pagination');
    if (!pagination) return;

    // Button clicks
    pagination.querySelectorAll('.bot-browser-pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;

            switch (action) {
                case 'first':
                    state.currentPage = 1;
                    break;
                case 'prev':
                    state.currentPage = Math.max(1, state.currentPage - 1);
                    break;
                case 'next':
                    state.currentPage = Math.min(state.totalPages, state.currentPage + 1);
                    break;
                case 'last':
                    state.currentPage = state.totalPages;
                    break;
            }

            renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
        });
    });

    // Direct page input
    const pageInput = pagination.querySelector('.bot-browser-pagination-input');
    if (pageInput) {
        pageInput.addEventListener('change', (e) => {
            let page = parseInt(e.target.value);
            if (isNaN(page)) page = 1;
            page = Math.max(1, Math.min(state.totalPages, page));
            state.currentPage = page;
            renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
        });

        pageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        });
    }
}

export function refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc) {
    const filteredCards = filterCards(state.currentCards, state.filters, state.fuse, extensionName, extension_settings);
    const sortedCards = sortCards(filteredCards, state.sortBy);
    const cardsWithImages = sortedCards.filter(card => {
        const imageUrl = card.avatar_url || card.image_url;
        return imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
    });

    // Store filtered cards and reset to page 1
    state.filteredCards = cardsWithImages;
    state.currentPage = 1;
    state.totalPages = Math.ceil(cardsWithImages.length / (extension_settings[extensionName].cardsPerPage || 200));

    const menuContent = document.querySelector('.bot-browser-content');
    const countContainer = document.querySelector('.bot-browser-results-count');

    // Update filter UI to reflect current selections
    updateFilterUI(menuContent, state);

    if (menuContent) {
        renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
    }

    if (countContainer) {
        const hideNsfw = extension_settings[extensionName].hideNsfw || false;
        const nsfwText = hideNsfw ? ' (after hiding NSFW)' : '';
        // For live APIs (Chub/JannyAI/CT/Wyvern), show different text (we don't know total)
        if (state.isLiveChub) {
            countContainer.textContent = `Browsing Chub API${nsfwText}`;
        } else if (state.isJannyAI) {
            countContainer.textContent = `Browsing JannyAI${nsfwText}`;
        } else if (state.isCharacterTavern) {
            countContainer.textContent = `Browsing Character Tavern${nsfwText}`;
        } else if (state.isWyvern) {
            countContainer.textContent = `Browsing Wyvern Chat${nsfwText}`;
        } else {
            countContainer.textContent = `${cardsWithImages.length} card${cardsWithImages.length !== 1 ? 's' : ''} found${nsfwText}`;
        }
    }
}

// Update filter UI without recreating all options (performance optimization)
function updateFilterUI(menuContent, state) {
    if (!menuContent) return;

    // Update tag filter trigger text
    const tagFilterContainer = menuContent.querySelector('#bot-browser-tag-filter');
    if (tagFilterContainer) {
        const tagTriggerText = tagFilterContainer.querySelector('.selected-text');
        if (tagTriggerText) {
            if (state.filters.tags.length === 0) {
                tagTriggerText.textContent = 'All Tags';
            } else if (state.filters.tags.length === 1) {
                tagTriggerText.textContent = state.filters.tags[0];
            } else {
                tagTriggerText.textContent = `${state.filters.tags.length} Tags Selected`;
            }
        }

        // Update selected state on options
        const tagOptions = tagFilterContainer.querySelectorAll('.bot-browser-multi-select-option');
        tagOptions.forEach(option => {
            const value = option.dataset.value;
            if (value === '' && state.filters.tags.length === 0) {
                option.classList.add('selected');
            } else if (state.filters.tags.includes(value)) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }

    // Update creator filter trigger text
    const creatorFilterContainer = menuContent.querySelector('#bot-browser-creator-filter');
    if (creatorFilterContainer) {
        const creatorTriggerText = creatorFilterContainer.querySelector('.selected-text');
        if (creatorTriggerText) {
            if (!state.filters.creator) {
                creatorTriggerText.textContent = 'All Creators';
            } else {
                creatorTriggerText.textContent = state.filters.creator;
            }
        }

        // Update selected state on options
        const creatorOptions = creatorFilterContainer.querySelectorAll('.bot-browser-multi-select-option');
        creatorOptions.forEach(option => {
            const value = option.dataset.value;
            if (value === '' && !state.filters.creator) {
                option.classList.add('selected');
            } else if (state.filters.creator === value) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }

    // Update sort filter trigger text
    const sortFilterContainer = menuContent.querySelector('#bot-browser-sort-filter');
    if (sortFilterContainer) {
        const sortTriggerText = sortFilterContainer.querySelector('.selected-text');
        const sortOptions = sortFilterContainer.querySelectorAll('.bot-browser-multi-select-option');

        // Map values to display names
        const sortLabels = {
            'relevance': 'Relevance',
            'name_asc': 'Name (A-Z)',
            'name_desc': 'Name (Z-A)',
            'creator_asc': 'Creator (A-Z)',
            'creator_desc': 'Creator (Z-A)',
            'date_desc': 'Newest First',
            'date_asc': 'Oldest First',
            'tokens_desc': 'Most Tokens',
            'tokens_asc': 'Least Tokens'
        };

        if (sortTriggerText) {
            sortTriggerText.textContent = sortLabels[state.sortBy] || 'Relevance';
        }

        // Update selected state on options
        sortOptions.forEach(option => {
            const value = option.dataset.value;
            if (state.sortBy === value) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }
}
