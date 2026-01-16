import { extension_settings } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced, processDroppedFiles, getRequestHeaders } from '../../../../script.js';

// Import modules
import { loadImportStats, saveImportStats, loadRecentlyViewed, loadPersistentSearch, loadBookmarks, removeBookmark, clearImportedCards } from './modules/storage/storage.js';
import { getTimeAgo } from './modules/storage/stats.js';
import { loadServiceIndex, initializeServiceCache, clearQuillgenCache } from './modules/services/cache.js';
import { getRandomCard } from './modules/services/cards.js';
import { importCardToSillyTavern } from './modules/services/import.js';
import { showCardDetail, closeDetailModal, showImageLightbox } from './modules/modals/detail.js';
import { createCardBrowser, refreshCardGrid } from './modules/browser.js';
import { getOriginalMenuHTML, createBottomActions } from './modules/templates/templates.js';
import { escapeHTML } from './modules/utils/utils.js';
import { searchJannyCharacters, transformJannyCard, JANNYAI_TAGS } from './modules/services/jannyApi.js';
import { fetchJannyCollections, fetchJannyCollectionDetails } from './modules/services/jannyCollectionsApi.js';
import { createCollectionCardHTML, createCollectionsBrowserHeader } from './modules/templates/templates.js';
import {
    fetchCharacterTavernTrending, transformCharacterTavernTrendingCard,
    fetchChubTrending, transformChubTrendingCard, resetChubTrendingState, chubTrendingState,
    fetchWyvernTrending, transformWyvernTrendingCard, resetWyvernTrendingState, wyvernTrendingState,
    fetchJannyTrending, transformJannyTrendingCard, resetJannyTrendingState, jannyTrendingState, loadMoreJannyTrending,
    fetchBackyardTrending, transformBackyardTrendingCard, resetBackyardTrendingState, backyardTrendingState, loadMoreBackyardTrending
} from './modules/services/trendingApi.js';
import {
    searchBackyardCharacters, transformBackyardCard, resetBackyardApiState, backyardApiState, BACKYARD_SORT_TYPES,
    getBackyardUserProfile
} from './modules/services/backyardApi.js';
import { preloadPuter } from './modules/services/corsProxy.js';
import {
    searchPygmalionCharacters, browsePygmalionCharacters, getPygmalionCharacter,
    getPygmalionCharactersByOwner, transformPygmalionCard, transformFullPygmalionCharacter,
    pygmalionApiState, resetPygmalionApiState, PYGMALION_SORT_TYPES
} from './modules/services/pygmalionApi.js';
import { initUpdateChecker } from './modules/services/updateChecker.js';
import { searchRisuRealm, transformRisuRealmCard, resetRisuRealmState, risuRealmApiState, fetchRisuRealmTrending } from './modules/services/risuRealmApi.js';
import { searchChubCards, transformChubCard } from './modules/services/chubApi.js';
import { fetchWyvernCreatorCards } from './modules/services/wyvernApi.js';
import { searchCharacterTavern } from './modules/services/characterTavernApi.js';

// Extension version (from manifest.json)
const EXTENSION_VERSION = '1.1.3';

// Extension name and settings
const extensionName = 'BotBrowser';

// State management
const state = {
    view: 'sources',
    currentService: null,
    currentCards: [],
    selectedCard: null,
    filters: {
        search: '',
        tags: [],
        creator: ''
    },
    sortBy: 'relevance',
    fuse: null,
    recentlyViewed: [],
    searchCollapsed: false,
    cacheInitialized: false,
    lastActiveTab: 'bots'
};

// Random service options (used for roulette + settings)
const randomServiceOptions = [
    {
        id: 'risuai_realm',
        name: 'Risuai Realm',
        iconUrl: 'https://files.catbox.moe/216rab.webp',
        iconSize: 'cover',
    },
    {
        id: 'webring',
        name: 'Webring',
        iconUrl: 'https://files.catbox.moe/6avrsl.png',
        iconSize: '85%',
    },
    {
        id: 'nyai_me',
        name: 'Nyai.me',
        iconUrl: 'https://nyai.me/img/necologofavicon-64.png',
        iconSize: '85%',
    },
    {
        id: 'chub',
        name: 'Chub',
        iconUrl: 'https://avatars.charhub.io/icons/assets/full_logo.png',
        iconSize: 'cover',
        iconBg: '#ffffff',
    },
    {
        id: 'character_tavern',
        name: 'Character Tavern',
        iconUrl: 'https://character-tavern.com/_app/immutable/assets/logo.DGIlOnDO.png',
        iconSize: 'cover',
    },
    {
        id: 'wyvern',
        name: 'Wyvern Chat',
        iconUrl: 'https://substackcdn.com/image/fetch/w_176,h_176,c_fill,f_webp,q_auto:good,fl_progressive:steep,g_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F6ea09a00-0248-4482-a893-1a2d1e3fe3c1_512x512.png',
        iconSize: 'cover',
    },
    {
        id: 'catbox',
        name: 'Catbox',
        iconUrl: 'https://catbox.tech/favicon128.png',
        iconSize: 'cover',
    },
    {
        id: 'anchorhold',
        name: '4chan - /aicg/',
        iconUrl: 'https://assets.coingecko.com/coins/images/30124/large/4CHAN.png?1696529046',
        iconSize: '85%',
    },
    {
        id: 'mlpchag',
        name: 'MLPchag',
        iconUrl: 'https://derpicdn.net/img/view/2015/9/26/988523__safe_solo_upvotes+galore_smiling_cute_derpy+hooves_looking+at+you_looking+up_part+of+a_set_derpibooru+exclusive.png',
        iconSize: 'cover',
    },
    {
        id: 'desuarchive',
        name: 'Desuarchive',
        iconUrl: 'https://s2.vndb.org/ch/32/17032.jpg',
        iconSize: 'cover',
    },
    {
        id: 'jannyai',
        name: 'JannyAI',
        iconUrl: 'https://tse3.mm.bing.net/th/id/OIP.nb-qi0od9W6zRsskVwL6QAHaHa?rs=1&pid=ImgDetMain&o=7&rm=3',
        iconSize: 'cover',
    },
    {
        id: 'backyard',
        name: 'Backyard.ai',
        iconUrl: 'https://backyard.ai/favicon.png',
        iconSize: 'cover',
    },
    {
        id: 'pygmalion',
        name: 'Pygmalion',
        iconUrl: 'https://files.catbox.moe/sw0crk.png',
        iconSize: '85%',
    },
];

function getDefaultRandomServiceSettings() {
    const enabledMap = {};
    for (const service of randomServiceOptions) {
        enabledMap[service.id] = true;
    }
    return enabledMap;
}

// Default settings
const defaultSettings = {
    enabled: true,
    message: 'Bot Browser Active!',
    recentlyViewedEnabled: true,
    maxRecentlyViewed: 10,
    persistentSearchEnabled: true,
    defaultSortBy: 'relevance',
    fuzzySearchThreshold: 0.4,
    cardsPerPage: 50,
    blurCards: false,
    blurNsfw: false,
    hideNsfw: false,
    trackStats: true,
    tagBlocklist: [],
    quillgenApiKey: '',
    useChubLiveApi: true,
    useCharacterTavernLiveApi: true,
    useRisuRealmLiveApi: true,
    useMlpchagLiveApi: true,
    useWyvernLiveApi: true,
    autoClearFilters: true,
    randomServices: getDefaultRandomServiceSettings(),
};

// Stats storage
let importStats = {
    totalCharacters: 0,
    totalLorebooks: 0,
    imports: [],
    bySource: {},
    byCreator: {}
};

// Initialize settings
function loadSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }

    // Apply default settings
    for (const key of Object.keys(defaultSettings)) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }

    // Ensure random service settings include all known services (for upgrades)
    const randomServices = extension_settings[extensionName].randomServices;
    if (typeof randomServices !== 'object' || randomServices === null) {
        extension_settings[extensionName].randomServices = getDefaultRandomServiceSettings();
    } else {
        for (const service of randomServiceOptions) {
            if (randomServices[service.id] === undefined) {
                randomServices[service.id] = true;
            }
        }
    }
}

// Apply blur setting to all card images
function applyBlurSetting() {
    const menu = document.getElementById('bot-browser-menu');
    if (!menu) return;

    const blurEnabled = extension_settings[extensionName].blurCards;
    const blurNsfwEnabled = extension_settings[extensionName].blurNsfw;

    if (blurEnabled) {
        menu.classList.add('blur-cards-enabled');
    } else {
        menu.classList.remove('blur-cards-enabled');
    }

    if (blurNsfwEnabled) {
        menu.classList.add('blur-nsfw-enabled');
    } else {
        menu.classList.remove('blur-nsfw-enabled');
    }
}

// Wrapper for showCardDetail that passes all dependencies
async function showCardDetailWrapper(card, save = true, isRandom = false) {
    await showCardDetail(card, extensionName, extension_settings, state, save, isRandom);

    // After modal is created, attach additional handlers that need access to state
    const detailModal = document.getElementById('bot-browser-detail-modal');
    if (!detailModal) return;

    // Random buttons (only shown when viewing a random card)
    const randomSameBtn = detailModal.querySelector('.bot-browser-random-same-btn');
    const randomAnyBtn = detailModal.querySelector('.bot-browser-random-any-btn');

    if (randomSameBtn) {
        randomSameBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            closeDetailModal();
            await getRandomCardFromSameService();
        });
    }

    if (randomAnyBtn) {
        randomAnyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            closeDetailModal();
            await getRandomCardFromAnyService();
        });
    }

    // Import button
    const importButton = detailModal.querySelector('.bot-browser-import-button');
    if (importButton) {
        importButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            importStats = await importCardToSillyTavern(
                state.selectedCard,
                extensionName,
                extension_settings,
                importStats,
                getRequestHeaders,
                processDroppedFiles
            );
        });
    }

    // Creator link
    const creatorLink = detailModal.querySelector('.bot-browser-creator-link');
    if (creatorLink) {
        creatorLink.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const creator = creatorLink.dataset.creator;
            const card = state.selectedCard;
            console.log('[Bot Browser] Creator clicked:', creator);
            console.log('[Bot Browser] Card service flags:', {
                service: card?.service,
                sourceService: card?.sourceService,
                isJannyAI: card?.isJannyAI,
                isRisuRealm: card?.isRisuRealm,
                isBackyard: card?.isBackyard,
                isChub: card?.isLiveChub
            });

            closeDetailModal();

            // Check if we can use live API for creator search
            const isChub = card?.service === 'chub' || card?.sourceService === 'chub' || card?.isLiveChub;
            const isWyvern = card?.service === 'wyvern' || card?.sourceService?.includes('wyvern') || card?.isWyvern;
            const isCharacterTavern = card?.service === 'character_tavern' || card?.sourceService === 'character_tavern';

            // Save previous state for back button
            state.previousCards = [...state.currentCards];
            state.previousService = state.currentService;
            state.isCreatorPage = true;
            state.creatorPageSource = card?.service || card?.sourceService;

            if (isChub && creator) {
                // Use Chub API to search by username (using @username syntax)
                try {
                    toastr.info(`Loading cards by ${escapeHTML(creator)}...`, '', { timeOut: 2000 });
                    const result = await searchChubCards({
                        search: `@${creator}`,
                        limit: 200,
                        sort: 'download_count',
                        nsfw: !extension_settings[extensionName].hideNsfw
                    });
                    // Chub API returns { data: { nodes: [...] } }
                    const nodes = result?.data?.nodes || result?.nodes || [];
                    const cards = nodes.map(transformChubCard);

                    if (cards.length > 0) {
                        await createCardBrowser(`Cards by ${creator}`, cards, state, extensionName, extension_settings, showCardDetailWrapper);
                        toastr.success(`Found ${cards.length} cards by ${escapeHTML(creator)}`);
                    } else {
                        toastr.info(`No cards found by ${escapeHTML(creator)}`);
                        state.isCreatorPage = false;
                    }
                    return;
                } catch (error) {
                    console.error('[Bot Browser] Failed to load Chub creator cards:', error);
                    state.isCreatorPage = false;
                    // Fall through to local filter
                }
            }

            if (isWyvern && card?.creatorUid) {
                // Use Wyvern API to get creator's cards
                try {
                    toastr.info(`Loading cards by ${escapeHTML(creator)}...`, '', { timeOut: 2000 });
                    const result = await fetchWyvernCreatorCards({ uid: card.creatorUid });

                    if (result.cards.length > 0) {
                        await createCardBrowser(`Cards by ${creator}`, result.cards, state, extensionName, extension_settings, showCardDetailWrapper);
                        toastr.success(`Found ${result.cards.length} cards by ${escapeHTML(creator)}`);
                    } else {
                        toastr.info(`No cards found by ${escapeHTML(creator)}`);
                        state.isCreatorPage = false;
                    }
                    return;
                } catch (error) {
                    console.error('[Bot Browser] Failed to load Wyvern creator cards:', error);
                    state.isCreatorPage = false;
                    // Fall through to local filter
                }
            }

            if (isCharacterTavern && creator) {
                // Use Character Tavern API to search by author name
                try {
                    toastr.info(`Loading cards by ${escapeHTML(creator)}...`, '', { timeOut: 2000 });
                    // searchCharacterTavern already returns transformed cards
                    const cards = await searchCharacterTavern({
                        query: creator,
                        limit: 100
                    });

                    if (cards && cards.length > 0) {
                        await createCardBrowser(`Cards by ${creator}`, cards, state, extensionName, extension_settings, showCardDetailWrapper);
                        toastr.success(`Found ${cards.length} cards by ${escapeHTML(creator)}`);
                    } else {
                        toastr.info(`No cards found by ${escapeHTML(creator)}`);
                        state.isCreatorPage = false;
                    }
                    return;
                } catch (error) {
                    console.error('[Bot Browser] Failed to load Character Tavern creator cards:', error);
                    state.isCreatorPage = false;
                    // Fall through to local filter
                }
            }

            const isBackyard = card?.isBackyard || card?.service === 'backyard' || card?.sourceService?.includes('backyard');
            console.log('[Bot Browser] Backyard creator check:', { isBackyard, creator, cardService: card?.service, cardSourceService: card?.sourceService });
            if (isBackyard && creator) {
                // Use Backyard user profile API to get all cards by creator
                toastr.info(`Loading cards by ${escapeHTML(creator)}...`, '', { timeOut: 2000 });

                try {
                    console.log('[Bot Browser] Fetching Backyard user profile for:', creator);
                    const result = await getBackyardUserProfile(creator, {
                        sortBy: BACKYARD_SORT_TYPES.POPULAR
                    });
                    console.log('[Bot Browser] Backyard user profile result:', result);

                    const cards = result.characters.map(transformBackyardCard);
                    console.log('[Bot Browser] Transformed Backyard cards:', cards.length);

                    if (cards.length > 0) {
                        state.isCreatorPage = true;
                        await createCardBrowser(`Cards by ${creator}`, cards, state, extensionName, extension_settings, showCardDetailWrapper);
                        toastr.success(`Found ${cards.length} cards by ${escapeHTML(creator)}`);
                    } else {
                        toastr.info(`No cards found by ${escapeHTML(creator)}`);
                        state.isCreatorPage = false;
                    }
                    return;
                } catch (error) {
                    console.error('[Bot Browser] Failed to load Backyard creator cards:', error);
                    toastr.error(`Failed to load cards by ${escapeHTML(creator)}: ${error.message}`);
                    state.isCreatorPage = false;
                    // Fall through to local filter
                }
            }

            const isPygmalion = card?.isPygmalion || card?.service === 'pygmalion' || card?.sourceService?.includes('pygmalion');
            const creatorId = card?.creatorId || card?._rawData?.owner?.id;
            console.log('[Bot Browser] Pygmalion creator check:', { isPygmalion, creator, creatorId, cardService: card?.service, cardSourceService: card?.sourceService });
            if (isPygmalion && creatorId) {
                // Use Pygmalion CharactersByOwnerID API to get all cards by creator
                toastr.info(`Loading cards by ${escapeHTML(creator)}...`, '', { timeOut: 2000 });

                try {
                    console.log('[Bot Browser] Fetching Pygmalion characters for owner:', creatorId);
                    const result = await getPygmalionCharactersByOwner(creatorId);
                    console.log('[Bot Browser] Pygmalion owner result:', result);

                    const cards = result.characters.map(transformPygmalionCard);
                    console.log('[Bot Browser] Transformed Pygmalion cards:', cards.length);

                    if (cards.length > 0) {
                        state.isCreatorPage = true;
                        await createCardBrowser(`Cards by ${creator}`, cards, state, extensionName, extension_settings, showCardDetailWrapper);
                        toastr.success(`Found ${cards.length} cards by ${escapeHTML(creator)}`);
                    } else {
                        toastr.info(`No cards found by ${escapeHTML(creator)}`);
                        state.isCreatorPage = false;
                    }
                    return;
                } catch (error) {
                    console.error('[Bot Browser] Failed to load Pygmalion creator cards:', error);
                    toastr.error(`Failed to load cards by ${escapeHTML(creator)}: ${error.message}`);
                    state.isCreatorPage = false;
                    // Fall through to local filter
                }
            }

            // Default: filter currently loaded cards locally
            // Note: API limitation warnings are shown via UI banner when source loads
            state.isCreatorPage = false;
            state.filters.creator = creator;
            const creatorFilterDropdown = document.querySelector('.bot-browser-creator-filter');
            if (creatorFilterDropdown) {
                creatorFilterDropdown.value = creator;
            }
            refreshCardGrid(state, extensionName, extension_settings, showCardDetailWrapper);

            toastr.success(`Showing cards by ${escapeHTML(creator)} (filtered locally)`, 'Filtered by Creator');
        });
    }

    // Tag click handlers
    detailModal.querySelectorAll('.bot-browser-tag-clickable').forEach(tagBtn => {
        tagBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const tag = tagBtn.dataset.tag;
            console.log('[Bot Browser] Filtering by tag:', tag);

            closeDetailModal();

            // Case-insensitive check
            const tagLower = tag.toLowerCase();
            if (!state.filters.tags.some(t => t.toLowerCase() === tagLower)) {
                state.filters.tags.push(tag);
            }

            const tagFilterDropdown = document.querySelector('.bot-browser-tag-filter');
            if (tagFilterDropdown) {
                Array.from(tagFilterDropdown.options).forEach(option => {
                    if (option.value === tag) {
                        option.selected = true;
                    }
                });
            }

            refreshCardGrid(state, extensionName, extension_settings, showCardDetailWrapper);

            toastr.success(`Added filter: ${escapeHTML(tag)}`, 'Filtered by Tag');
        });
    });

    // Image lightbox
    const clickableImage = detailModal.querySelector('.clickable-image');
    if (clickableImage) {
        clickableImage.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const imageUrl = clickableImage.dataset.imageUrl;
            if (imageUrl) {
                showImageLightbox(imageUrl);
            }
        });
    }
}

// Navigate back to collections browser (when viewing collection characters)
function navigateBackToCollections() {
    const menu = document.getElementById('bot-browser-menu');
    if (!menu) return;

    // Restore collections data from saved state
    if (collectionsState.lastCollectionData) {
        collectionsState.collections = collectionsState.lastCollectionData.collections;
        collectionsState.pagination = collectionsState.lastCollectionData.pagination;
        collectionsState.sort = collectionsState.lastCollectionData.sort;
        collectionsState.currentPage = collectionsState.lastCollectionData.currentPage;
    }

    // Clear the tracking flag
    collectionsState.viewingCollectionCharacters = false;
    collectionsState.lastCollectionData = null;

    // Re-create collections browser with saved data
    createCollectionsBrowser({
        collections: collectionsState.collections,
        pagination: collectionsState.pagination,
        sort: collectionsState.sort
    }, menu);

    console.log('[Bot Browser] Navigated back to collections browser');
}

// Navigate back to sources view
async function navigateToSources() {
    // Check if we should go back to collections browser instead
    if (collectionsState.viewingCollectionCharacters) {
        navigateBackToCollections();
        return;
    }

    // Check if we're on a creator page and should go back to previous cards
    if (state.isCreatorPage && state.previousCards && state.previousCards.length > 0) {
        state.isCreatorPage = false;
        state.currentCards = state.previousCards;
        state.previousCards = [];

        // Restore the card browser with previous cards
        const serviceName = state.previousService || state.creatorPageSource || 'Cards';
        await createCardBrowser(serviceName, state.currentCards, state, extensionName, extension_settings, showCardDetailWrapper);
        return;
    }

    // Reset creator page state
    state.isCreatorPage = false;
    state.previousCards = [];
    state.previousService = null;
    state.creatorPageSource = null;

    // Reset collections state when going back to main sources
    collectionsState.viewingCollectionCharacters = false;
    collectionsState.lastCollectionData = null;

    state.view = 'sources';
    state.currentService = null;
    state.currentCards = [];
    state.filters = { search: '', tags: [], creator: '' };

    const menu = document.getElementById('bot-browser-menu');
    if (!menu) return;

    const menuContent = menu.querySelector('.bot-browser-content');
    menuContent.innerHTML = getOriginalMenuHTML(state.recentlyViewed);

    // Add bottom action buttons to each tab content
    const tabContents = menuContent.querySelectorAll('.bot-browser-tab-content');
    tabContents.forEach(tabContent => {
        const bottomActions = document.createElement('div');
        bottomActions.className = 'bot-browser-bottom-actions';
        bottomActions.innerHTML = createBottomActions();
        tabContent.appendChild(bottomActions);
    });

    // Re-setup event handlers
    setupTabSwitching(menu);
    setupSourceButtons(menu);
    setupRecentlyViewedCards(menu);
    setupCloseButton(menu);
    setupBottomButtons(menu);

    // Restore the last active tab
    if (state.lastActiveTab && state.lastActiveTab !== 'bots') {
        const tabButtons = menu.querySelectorAll('.bot-browser-tab');
        const tabContents = menu.querySelectorAll('.bot-browser-tab-content');

        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        const targetTabBtn = menu.querySelector(`.bot-browser-tab[data-tab="${state.lastActiveTab}"]`);
        const targetTabContent = menu.querySelector(`.bot-browser-tab-content[data-content="${state.lastActiveTab}"]`);

        if (targetTabBtn && targetTabContent) {
            targetTabBtn.classList.add('active');
            targetTabContent.classList.add('active');

            // Populate bookmarks if that's the tab
            if (state.lastActiveTab === 'bookmarks') {
                populateBookmarksTab(menu);
            }
        }
    }

    // Apply blur setting
    applyBlurSetting();

    console.log('[Bot Browser] Navigated back to sources, tab:', state.lastActiveTab);
}

// Setup tab switching
function setupTabSwitching(menu) {
    const tabButtons = menu.querySelectorAll('.bot-browser-tab');
    const tabContents = menu.querySelectorAll('.bot-browser-tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Track the active tab
            state.lastActiveTab = targetTab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            menu.querySelector(`.bot-browser-tab-content[data-content="${targetTab}"]`).classList.add('active');

            // Populate bookmarks tab when switching to it
            if (targetTab === 'bookmarks') {
                populateBookmarksTab(menu);
            }
        });
    });
}

// Populate bookmarks tab with saved bookmarks
function populateBookmarksTab(menu) {
    const bookmarks = loadBookmarks();
    const bookmarksGrid = menu.querySelector('.bot-browser-bookmarks-grid');
    const bookmarksEmpty = menu.querySelector('.bot-browser-bookmarks-empty');

    if (!bookmarksGrid) return;

    if (bookmarks.length === 0) {
        bookmarksEmpty.style.display = 'flex';
        bookmarksGrid.style.display = 'none';
        bookmarksGrid.innerHTML = '';
        return;
    }

    bookmarksEmpty.style.display = 'none';
    bookmarksGrid.style.display = 'grid';

    bookmarksGrid.innerHTML = bookmarks.map(card => `
        <div class="bot-browser-bookmark-card" data-card-id="${card.id}" data-nsfw="${card.possibleNsfw ? 'true' : 'false'}">
            <div class="bookmark-image" style="background-image: url('${escapeHTML(card.avatar_url || '')}');"></div>
            <div class="bookmark-name">${escapeHTML(card.name)}</div>
            <button class="bookmark-remove" title="Remove bookmark">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
    `).join('');

    // Add click handlers
    bookmarksGrid.querySelectorAll('.bot-browser-bookmark-card').forEach(cardEl => {
        cardEl.addEventListener('click', async (e) => {
            if (e.target.closest('.bookmark-remove')) return;
            e.stopPropagation();
            e.preventDefault();

            const cardId = cardEl.dataset.cardId;
            const card = bookmarks.find(c => c.id === cardId);

            if (card) {
                console.log('[Bot Browser] Opening bookmarked card:', card.name);
                await showCardDetailWrapper(card);
            }
        });

        // Remove bookmark button
        const removeBtn = cardEl.querySelector('.bookmark-remove');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            const cardId = cardEl.dataset.cardId;
            removeBookmark(cardId);
            cardEl.remove();

            // Check if empty
            const remaining = bookmarksGrid.querySelectorAll('.bot-browser-bookmark-card');
            if (remaining.length === 0) {
                bookmarksEmpty.style.display = 'flex';
                bookmarksGrid.style.display = 'none';
            }

            toastr.info('Removed from bookmarks', '', { timeOut: 2000 });
        });
    });
}

// Setup recently viewed cards
function setupRecentlyViewedCards(menu) {
    const recentCards = menu.querySelectorAll('.bot-browser-recent-card');

    recentCards.forEach(cardEl => {
        cardEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            const cardId = cardEl.dataset.cardId;
            const card = state.recentlyViewed.find(c => c.id === cardId);

            if (card) {
                console.log('[Bot Browser] Opening recently viewed card:', card.name);
                await showCardDetailWrapper(card);
            } else {
                console.error('[Bot Browser] Recently viewed card not found:', cardId);
                toastr.error('Card not found in recently viewed');
            }
        });
    });

    // Add horizontal scroll support with mouse wheel
    const recentlyViewedGrid = menu.querySelector('.bot-browser-recently-viewed-grid');
    if (recentlyViewedGrid) {
        recentlyViewedGrid.addEventListener('wheel', (e) => {
            // Prevent default vertical scroll
            e.preventDefault();
            // Scroll horizontally instead
            recentlyViewedGrid.scrollLeft += e.deltaY;
        }, { passive: false });
    }
}

// Collections browser state
let collectionsState = {
    collections: [],
    pagination: null,
    sort: 'popular',
    currentPage: 1,
    // Track if we navigated from collections to a character browser
    viewingCollectionCharacters: false,
    lastCollectionData: null
};

// Create collections browser
function createCollectionsBrowser(collectionsData, menu) {
    state.view = 'collections';
    state.currentService = 'jannyai_collections';

    collectionsState.collections = collectionsData.collections;
    collectionsState.pagination = collectionsData.pagination;
    collectionsState.sort = collectionsData.sort;
    collectionsState.currentPage = collectionsData.pagination.currentPage;

    const menuContent = menu.querySelector('.bot-browser-content');
    const cardCountText = `${collectionsData.pagination.totalEntries} collections`;

    menuContent.innerHTML = createCollectionsBrowserHeader(collectionsState.sort, cardCountText);

    // Render collections
    renderCollectionsPage(menuContent);

    // Setup event listeners
    setupCollectionsBrowserEvents(menuContent, menu);

    console.log('[Bot Browser] Collections browser created');
}

// Render collections page
function renderCollectionsPage(menuContent) {
    const gridContainer = menuContent.querySelector('.bot-browser-card-grid');
    if (!gridContainer) return;

    const collectionsHTML = collectionsState.collections.map(c => createCollectionCardHTML(c)).join('');

    // Create pagination
    const paginationHTML = collectionsState.pagination.totalPages > 1 ? `
        <div class="bot-browser-pagination">
            <button class="bot-browser-pagination-btn" data-action="prev" ${collectionsState.currentPage === 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-angle-left"></i> Prev
            </button>
            <span class="bot-browser-pagination-info">Page ${collectionsState.currentPage} of ${collectionsState.pagination.totalPages}</span>
            <button class="bot-browser-pagination-btn" data-action="next" ${!collectionsState.pagination.hasMore ? 'disabled' : ''}>
                Next <i class="fa-solid fa-angle-right"></i>
            </button>
        </div>
    ` : '';

    gridContainer.innerHTML = collectionsHTML + paginationHTML;

    // Attach collection click handlers
    gridContainer.querySelectorAll('.bot-browser-collection-card').forEach(cardEl => {
        cardEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            const collectionId = cardEl.dataset.collectionId;
            const collectionSlug = cardEl.dataset.collectionSlug;

            console.log('[Bot Browser] Opening collection:', collectionId, collectionSlug);

            try {
                toastr.info('Loading collection...', '', { timeOut: 2000 });
                const collectionDetails = await fetchJannyCollectionDetails(collectionId, collectionSlug);

                if (collectionDetails.characters.length === 0) {
                    toastr.warning('This collection appears to be empty or could not be loaded');
                    return;
                }

                // Switch to card browser with collection characters
                const cards = collectionDetails.characters.map(char => ({
                    ...char,
                    sourceService: 'jannyai',
                    isJannyAI: true
                }));

                // Track that we're viewing collection characters (for back button)
                collectionsState.viewingCollectionCharacters = true;
                collectionsState.lastCollectionData = {
                    collections: collectionsState.collections,
                    pagination: collectionsState.pagination,
                    sort: collectionsState.sort,
                    currentPage: collectionsState.currentPage
                };

                await createCardBrowser(`${collectionDetails.name}`, cards, state, extensionName, extension_settings, showCardDetailWrapper);
            } catch (error) {
                console.error('[Bot Browser] Error loading collection:', error);
                toastr.error('Failed to load collection: ' + error.message);
            }
        });
    });

    // Attach pagination handlers
    gridContainer.querySelectorAll('.bot-browser-pagination-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            const action = btn.dataset.action;

            if (action === 'prev' && collectionsState.currentPage > 1) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                try {
                    const newData = await fetchJannyCollections({
                        page: collectionsState.currentPage - 1,
                        sort: collectionsState.sort
                    });

                    collectionsState.collections = newData.collections;
                    collectionsState.pagination = newData.pagination;
                    collectionsState.currentPage = newData.pagination.currentPage;

                    renderCollectionsPage(menuContent);
                } catch (error) {
                    console.error('[Bot Browser] Error loading prev page:', error);
                    toastr.error('Failed to load page');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-angle-left"></i> Prev';
                }
            } else if (action === 'next' && collectionsState.pagination.hasMore) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                try {
                    const newData = await fetchJannyCollections({
                        page: collectionsState.currentPage + 1,
                        sort: collectionsState.sort
                    });

                    collectionsState.collections = newData.collections;
                    collectionsState.pagination = newData.pagination;
                    collectionsState.currentPage = newData.pagination.currentPage;

                    renderCollectionsPage(menuContent);
                } catch (error) {
                    console.error('[Bot Browser] Error loading next page:', error);
                    toastr.error('Failed to load page');
                    btn.disabled = false;
                    btn.innerHTML = 'Next <i class="fa-solid fa-angle-right"></i>';
                }
            }
        });
    });

    // Scroll to top - scroll the wrapper which contains search + grid
    const wrapper = menuContent.querySelector('.bot-browser-card-grid-wrapper');
    if (wrapper) wrapper.scrollTop = 0;
}

// Setup collections browser events
function setupCollectionsBrowserEvents(menuContent, menu) {
    // Back button
    const backButton = menuContent.querySelector('.bot-browser-back-button');
    if (backButton) {
        backButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            navigateToSources();
        });
    }

    // Close button
    const closeButton = menuContent.querySelector('.bot-browser-close');
    if (closeButton) {
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            closeBotBrowserMenu();
        });
    }

    // Toggle search
    const toggleSearchBtn = menuContent.querySelector('.bot-browser-toggle-search');
    const searchSection = menuContent.querySelector('.bot-browser-search-section');
    if (toggleSearchBtn && searchSection) {
        toggleSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            searchSection.classList.toggle('collapsed');
            const icon = toggleSearchBtn.querySelector('i');
            icon.classList.toggle('fa-chevron-up');
            icon.classList.toggle('fa-chevron-down');
        });
    }

    // Sort dropdown
    const sortDropdown = menuContent.querySelector('#bot-browser-collections-sort');
    if (sortDropdown) {
        const trigger = sortDropdown.querySelector('.bot-browser-multi-select-trigger');
        const dropdown = sortDropdown.querySelector('.bot-browser-multi-select-dropdown');
        const options = sortDropdown.querySelectorAll('.bot-browser-multi-select-option');

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        options.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newSort = option.dataset.value;

                if (newSort === collectionsState.sort) {
                    dropdown.classList.remove('open');
                    return;
                }

                // Update UI
                options.forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                trigger.querySelector('.selected-text').textContent = option.querySelector('span').textContent;
                dropdown.classList.remove('open');

                // Reload with new sort
                try {
                    toastr.info('Reloading...', '', { timeOut: 1000 });
                    const newData = await fetchJannyCollections({
                        page: 1,
                        sort: newSort
                    });

                    collectionsState.collections = newData.collections;
                    collectionsState.pagination = newData.pagination;
                    collectionsState.sort = newSort;
                    collectionsState.currentPage = 1;

                    renderCollectionsPage(menuContent);
                } catch (error) {
                    console.error('[Bot Browser] Error changing sort:', error);
                    toastr.error('Failed to reload: ' + error.message);
                }
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            dropdown.classList.remove('open');
        });
    }
}

// Trending browser state
let trendingState = {
    source: null,
    sort: 'popular',
    cards: [],
    page: 1,
    hasMore: true
};

// Load trending source
async function loadTrendingSource(sourceName, menu) {
    console.log(`[Bot Browser] Loading trending source: ${sourceName}`);
    toastr.info('Loading trending...', '', { timeOut: 2000 });

    try {
        let cards = [];
        let displayName = 'Trending';

        if (sourceName === 'character_tavern_trending') {
            displayName = 'Character Tavern Trending';
            const result = await fetchCharacterTavernTrending();
            cards = (result.hits || []).map(transformCharacterTavernTrendingCard);

        } else if (sourceName === 'chub_trending') {
            displayName = 'Chub Trending';
            resetChubTrendingState();
            const result = await fetchChubTrending({ page: 1, limit: 48 });
            cards = (result.nodes || []).map(transformChubTrendingCard);
            trendingState.hasMore = result.hasMore;

        } else if (sourceName === 'wyvern_trending') {
            displayName = 'Wyvern Trending';
            resetWyvernTrendingState();
            const result = await fetchWyvernTrending({
                page: 1,
                limit: 40,
                sort: 'nsfw-popular',
                rating: extension_settings[extensionName].hideNsfw ? 'none' : 'all'
            });
            cards = (result.results || []).map(transformWyvernTrendingCard);
            trendingState.hasMore = result.hasMore;

        } else if (sourceName === 'jannyai_trending') {
            displayName = 'JanitorAI/JannyAI Trending';
            resetJannyTrendingState();
            const result = await fetchJannyTrending({ page: 1, limit: 40 });
            cards = (result.characters || []).map(transformJannyTrendingCard);
            trendingState.hasMore = result.hasMore;

        } else if (sourceName === 'risuai_realm_trending') {
            displayName = 'RisuRealm Trending';
            resetRisuRealmState();
            const result = await fetchRisuRealmTrending({
                page: 1,
                nsfw: !extension_settings[extensionName].hideNsfw
            });
            cards = result.cards.map(card => ({
                ...transformRisuRealmCard(card),
                sourceService: 'risuai_realm_trending',
                isTrending: true
            }));
            trendingState.hasMore = result.hasMore;

        } else if (sourceName === 'backyard_trending') {
            displayName = 'Backyard.ai Trending';
            resetBackyardTrendingState();
            const hideNsfw = extension_settings[extensionName].hideNsfw;
            const result = await fetchBackyardTrending({
                sortBy: BACKYARD_SORT_TYPES.TRENDING,
                type: hideNsfw ? 'sfw' : 'all'
            });
            cards = (result.characters || []).map(transformBackyardTrendingCard);
            trendingState.hasMore = result.hasMore;

        } else if (sourceName === 'pygmalion_trending') {
            displayName = 'Pygmalion Trending';
            resetPygmalionApiState();
            const hideNsfw = extension_settings[extensionName].hideNsfw;
            const result = await browsePygmalionCharacters({
                orderBy: PYGMALION_SORT_TYPES.VIEWS,
                includeSensitive: !hideNsfw
            });
            cards = result.characters.map(card => ({
                ...card,
                sourceService: 'pygmalion_trending',
                isTrending: true
            }));
            trendingState.hasMore = result.hasMore;

        } else {
            toastr.warning('Unknown trending source');
            return;
        }

        trendingState.source = sourceName;
        trendingState.cards = cards;
        trendingState.page = 1;

        console.log(`[Bot Browser] Loaded ${cards.length} trending cards from ${sourceName}`);

        if (cards.length === 0) {
            toastr.info('No trending cards found');
            return;
        }

        // Use the standard card browser with trending cards
        await createCardBrowser(displayName, cards, state, extensionName, extension_settings, showCardDetailWrapper);

    } catch (error) {
        console.error('[Bot Browser] Error loading trending:', error);
        toastr.error(`Failed to load trending`);
    }
}

// Setup source buttons
function setupSourceButtons(menu) {
    const sourceButtons = menu.querySelectorAll('.bot-browser-source');

    sourceButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const sourceName = button.dataset.source;
            if (!sourceName) return;

            // Track which tab this source belongs to
            const parentTab = button.closest('.bot-browser-tab-content');
            if (parentTab) {
                state.lastActiveTab = parentTab.dataset.content || 'bots';
            }

            console.log(`[Bot Browser] Loading source: ${sourceName} (from tab: ${state.lastActiveTab})`);

            // Auto-clear filters when switching sources (if enabled)
            if (extension_settings[extensionName].autoClearFilters !== false) {
                state.filters = { search: '', tags: [], creator: '' };
                state.sortBy = extension_settings[extensionName].defaultSortBy || 'relevance';
            }

            // Check if live Chub API is enabled
            const useLiveChubApi = extension_settings[extensionName].useChubLiveApi !== false;

            try {
                let cards = [];

                if (sourceName === 'all') {
                    toastr.info('Loading all cards (including live APIs)...', '', { timeOut: 2000 });

                    // Services that use static archives only
                    const staticServices = ['anchorhold', 'catbox', 'nyai_me', 'webring', 'desuarchive'];

                    // Add Chub only if using archive mode (not live API)
                    if (!useLiveChubApi) {
                        staticServices.push('chub');
                    }

                    // Add RisuRealm only if using archive mode
                    const useRisuRealmLiveApi = extension_settings[extensionName].useRisuRealmLiveApi !== false;
                    if (!useRisuRealmLiveApi) {
                        staticServices.push('risuai_realm');
                    }

                    // Add Character Tavern only if using archive mode
                    const useCharacterTavernLiveApi = extension_settings[extensionName].useCharacterTavernLiveApi !== false;
                    if (!useCharacterTavernLiveApi) {
                        staticServices.push('character_tavern');
                    }

                    // Add Wyvern only if using archive mode
                    const useWyvernLiveApi = extension_settings[extensionName].useWyvernLiveApi !== false;
                    if (!useWyvernLiveApi) {
                        staticServices.push('wyvern');
                    }

                    // Add MLPchag only if using archive mode
                    const useMlpchagLiveApi = extension_settings[extensionName].useMlpchagLiveApi !== false;
                    if (!useMlpchagLiveApi) {
                        staticServices.push('mlpchag');
                    }

                    // Load all static services in parallel
                    const servicePromises = staticServices.map(service => {
                        return loadServiceIndex(service, false).then(serviceCards =>
                            serviceCards.map(card => ({
                                ...card,
                                sourceService: service
                            }))
                        ).catch(err => {
                            console.warn(`[Bot Browser] Failed to load ${service}:`, err);
                            return [];
                        });
                    });

                    // Also load live APIs in parallel
                    const liveApiPromises = [];

                    if (useLiveChubApi) {
                        liveApiPromises.push(
                            searchChubCards({
                                search: '',
                                limit: 100,
                                sort: 'download_count',
                                nsfw: !extension_settings[extensionName].hideNsfw
                            }).then(result => {
                                // Chub API returns { data: { nodes: [...] } }
                                const nodes = result?.data?.nodes || result?.nodes || [];
                                return nodes.map(node => ({
                                    ...transformChubCard(node),
                                    sourceService: 'chub',
                                    isLiveChub: true
                                }));
                            }).catch(err => {
                                console.warn('[Bot Browser] Failed to load Chub live API:', err);
                                return [];
                            })
                        );
                    }

                    if (useRisuRealmLiveApi) {
                        liveApiPromises.push(
                            searchRisuRealm({
                                search: '',
                                page: 1,
                                sort: 'recommended',
                                nsfw: !extension_settings[extensionName].hideNsfw
                            }).then(result =>
                                result.cards.map(card => ({
                                    ...transformRisuRealmCard(card),
                                    sourceService: 'risuai_realm',
                                    isLiveApi: true
                                }))
                            ).catch(err => {
                                console.warn('[Bot Browser] Failed to load RisuRealm live API:', err);
                                return [];
                            })
                        );
                    }

                    // Pygmalion - always live API
                    liveApiPromises.push(
                        searchPygmalionCharacters({
                            orderBy: PYGMALION_SORT_TYPES.VIEWS,
                            includeSensitive: !extension_settings[extensionName].hideNsfw,
                            pageSize: 60
                        }).then(result =>
                            result.characters.map(card => ({
                                ...transformPygmalionCard(card),
                                sourceService: 'pygmalion',
                                isLiveApi: true
                            }))
                        ).catch(err => {
                            console.warn('[Bot Browser] Failed to load Pygmalion live API:', err);
                            return [];
                        })
                    );

                    // Backyard.ai - always live API
                    liveApiPromises.push(
                        searchBackyardCharacters({
                            sortBy: BACKYARD_SORT_TYPES.TRENDING,
                            type: extension_settings[extensionName].hideNsfw ? 'sfw' : 'all'
                        }).then(result =>
                            result.characters.map(card => ({
                                ...transformBackyardCard(card),
                                sourceService: 'backyard',
                                isLiveApi: true
                            }))
                        ).catch(err => {
                            console.warn('[Bot Browser] Failed to load Backyard.ai live API:', err);
                            return [];
                        })
                    );

                    // Character Tavern - live API if enabled
                    if (useCharacterTavernLiveApi) {
                        liveApiPromises.push(
                            searchCharacterTavern({
                                sort: 'trending',
                                nsfw: !extension_settings[extensionName].hideNsfw
                            }).then(result =>
                                result.characters.map(card => ({
                                    ...card,
                                    sourceService: 'character_tavern',
                                    isLiveApi: true
                                }))
                            ).catch(err => {
                                console.warn('[Bot Browser] Failed to load Character Tavern live API:', err);
                                return [];
                            })
                        );
                    }

                    // Wyvern - live API if enabled
                    if (useWyvernLiveApi) {
                        liveApiPromises.push(
                            import('./modules/services/wyvernApi.js').then(({ searchWyvernCards, transformWyvernCard }) =>
                                searchWyvernCards({ sort: 'downloads', nsfw: !extension_settings[extensionName].hideNsfw })
                                    .then(result =>
                                        (result.characters || []).map(card => ({
                                            ...transformWyvernCard(card),
                                            sourceService: 'wyvern',
                                            isLiveApi: true
                                        }))
                                    )
                            ).catch(err => {
                                console.warn('[Bot Browser] Failed to load Wyvern live API:', err);
                                return [];
                            })
                        );
                    }

                    // MLPchag - live API if enabled
                    if (useMlpchagLiveApi) {
                        liveApiPromises.push(
                            import('./modules/services/mlpchagApi.js').then(({ loadMlpchagLive }) =>
                                loadMlpchagLive().then(cards =>
                                    cards.map(card => ({
                                        ...card,
                                        sourceService: 'mlpchag',
                                        isLiveApi: true
                                    }))
                                )
                            ).catch(err => {
                                console.warn('[Bot Browser] Failed to load MLPchag live API:', err);
                                return [];
                            })
                        );
                    }

                    // Wait for all sources in parallel
                    const [allServiceCards, ...liveApiCards] = await Promise.all([
                        Promise.all(servicePromises),
                        ...liveApiPromises
                    ]);

                    // Combine static and live API results
                    cards = allServiceCards.flat();
                    liveApiCards.forEach(apiCards => {
                        cards = cards.concat(apiCards);
                    });

                    // JannyAI is always excluded (blocked by anti-bot)
                    toastr.info('JanitorAI excluded (blocked by anti-bot protection)', '', { timeOut: 3000 });

                    console.log(`[Bot Browser] Loaded ${cards.length} cards from all sources (${staticServices.length} archives + ${liveApiPromises.length} live APIs)`);
                } else if (sourceName === 'my_imports') {
                    // Load imported cards from local storage
                    toastr.info('Loading your imports...', '', { timeOut: 2000 });

                    const { loadLocalLibrary } = await import('./modules/services/localLibrary.js');
                    cards = await loadLocalLibrary();

                    if (cards.length === 0) {
                        toastr.info('No imports yet. Import characters using Bot Browser to see them here!', 'My Imports', { timeOut: 4000 });
                    }

                    console.log(`[Bot Browser] Loaded ${cards.length} imported cards`);
                } else if (sourceName === 'jannyai') {
                    // JannyAI uses its own live API
                    toastr.info('Loading JannyAI...', '', { timeOut: 2000 });

                    const autoClear = extension_settings[extensionName].autoClearFilters !== false;
                    const persistedSearch = autoClear ? null : loadPersistentSearch(extensionName, extension_settings, sourceName);
                    const sortBy = persistedSearch?.sortBy || extension_settings[extensionName].defaultSortBy || 'relevance';

                    // Map sort options to JannyAI format
                    let jannySort = 'createdAtStamp:desc';
                    switch (sortBy) {
                        case 'date_desc': jannySort = 'createdAtStamp:desc'; break;
                        case 'date_asc': jannySort = 'createdAtStamp:asc'; break;
                        case 'tokens_desc': jannySort = 'totalToken:desc'; break;
                        case 'tokens_asc': jannySort = 'totalToken:asc'; break;
                        default: jannySort = 'createdAtStamp:desc';
                    }

                    const searchResults = await searchJannyCharacters({
                        search: persistedSearch?.filters?.search || '',
                        page: 1,
                        limit: 40,
                        sort: jannySort
                    });

                    // Transform results to card format
                    const results = searchResults.results?.[0] || {};
                    cards = (results.hits || []).map(hit => transformJannyCard(hit));

                    console.log(`[Bot Browser] Loaded ${cards.length} JannyAI cards`);
                } else if (sourceName === 'jannyai_collections') {
                    // JannyAI Collections - browse user-created collections
                    toastr.info('Loading JannyAI Collections...', '', { timeOut: 2000 });

                    const collectionsData = await fetchJannyCollections({
                        page: 1,
                        sort: 'popular'
                    });

                    console.log(`[Bot Browser] Loaded ${collectionsData.collections.length} JannyAI collections`);

                    // Create collections browser instead of card browser
                    createCollectionsBrowser(collectionsData, menu);
                    return; // Don't call createCardBrowser
                } else if (sourceName === 'jannyai_trending') {
                    // JanitorAI trending is unavailable due to anti-bot protection
                    toastr.warning('JanitorAI Trending is currently unavailable. JanitorAI blocks automated access to their trending API.', 'Unavailable', { timeOut: 5000 });
                    return;
                } else if (sourceName.endsWith('_trending')) {
                    // Trending sources - load from respective APIs
                    await loadTrendingSource(sourceName, menu);
                    return;
                } else if (sourceName === 'risuai_realm') {
                    // RisuRealm - try live API first, fallback to archive
                    const useRisuRealmLiveApi = extension_settings[extensionName].useRisuRealmLiveApi !== false;

                    if (useRisuRealmLiveApi) {
                        try {
                            toastr.info('Loading RisuRealm (Live)...', '', { timeOut: 2000 });
                            resetRisuRealmState();

                            const autoClear = extension_settings[extensionName].autoClearFilters !== false;
                            const persistedSearch = autoClear ? null : loadPersistentSearch(extensionName, extension_settings, sourceName);

                            // Map sort options
                            let risuSort = 'recommended';
                            const sortBy = persistedSearch?.sortBy || extension_settings[extensionName].defaultSortBy || 'relevance';
                            if (sortBy === 'date_desc' || sortBy === 'date_asc') risuSort = 'date';
                            else if (sortBy === 'relevance') risuSort = 'download';

                            const result = await searchRisuRealm({
                                search: persistedSearch?.filters?.search || '',
                                page: 1,
                                sort: risuSort,
                                nsfw: !extension_settings[extensionName].hideNsfw
                            });

                            cards = result.cards.map(transformRisuRealmCard);
                            console.log(`[Bot Browser] Loaded ${cards.length} RisuRealm cards (live API)`);
                        } catch (error) {
                            console.warn('[Bot Browser] RisuRealm live API failed, falling back to archive:', error.message);
                            toastr.warning('Live API failed, loading archive...', '', { timeOut: 2000 });
                            cards = await loadServiceIndex(sourceName, false);
                        }
                    } else {
                        toastr.info('Loading RisuRealm (Archive)...', '', { timeOut: 2000 });
                        cards = await loadServiceIndex(sourceName, false);
                    }
                } else if (sourceName === 'backyard') {
                    // Backyard.ai uses its own live API
                    toastr.info('Loading Backyard.ai...', '', { timeOut: 2000 });
                    resetBackyardApiState();

                    const autoClear = extension_settings[extensionName].autoClearFilters !== false;
                    const persistedSearch = autoClear ? null : loadPersistentSearch(extensionName, extension_settings, sourceName);

                    // Map sort options to Backyard format
                    let backyardSort = BACKYARD_SORT_TYPES.TRENDING;
                    const sortBy = persistedSearch?.sortBy || extension_settings[extensionName].defaultSortBy || 'relevance';
                    switch (sortBy) {
                        case 'date_desc': backyardSort = BACKYARD_SORT_TYPES.NEW; break;
                        case 'tokens_desc':
                        case 'relevance':
                        default: backyardSort = BACKYARD_SORT_TYPES.TRENDING; break;
                    }

                    const result = await searchBackyardCharacters({
                        search: persistedSearch?.filters?.search || '',
                        sortBy: backyardSort,
                        type: extension_settings[extensionName].hideNsfw ? 'sfw' : 'all'
                    });

                    cards = result.characters.map(transformBackyardCard);

                    // Update API state for pagination
                    backyardApiState.cursor = result.nextCursor;
                    backyardApiState.hasMore = result.hasMore;
                    backyardApiState.lastSearch = persistedSearch?.filters?.search || '';
                    backyardApiState.lastSort = backyardSort;
                    backyardApiState.lastType = extension_settings[extensionName].hideNsfw ? 'sfw' : 'all';

                    console.log(`[Bot Browser] Loaded ${cards.length} Backyard.ai cards, hasMore: ${result.hasMore}`);
                } else if (sourceName === 'pygmalion') {
                    // Pygmalion uses its own live API
                    toastr.info('Loading Pygmalion...', '', { timeOut: 2000 });
                    resetPygmalionApiState();

                    const autoClear = extension_settings[extensionName].autoClearFilters !== false;
                    const persistedSearch = autoClear ? null : loadPersistentSearch(extensionName, extension_settings, sourceName);

                    // Map sort options to Pygmalion format
                    let pygmalionSort = PYGMALION_SORT_TYPES.VIEWS;
                    const sortBy = persistedSearch?.sortBy || extension_settings[extensionName].defaultSortBy || 'relevance';
                    switch (sortBy) {
                        case 'date_desc': pygmalionSort = PYGMALION_SORT_TYPES.NEWEST; break;
                        case 'tokens_desc': pygmalionSort = PYGMALION_SORT_TYPES.TOKEN_COUNT; break;
                        case 'relevance':
                        default: pygmalionSort = PYGMALION_SORT_TYPES.VIEWS; break;
                    }

                    const result = await searchPygmalionCharacters({
                        query: persistedSearch?.filters?.search || '',
                        orderBy: pygmalionSort,
                        includeSensitive: !extension_settings[extensionName].hideNsfw
                    });

                    cards = result.characters.map(transformPygmalionCard);

                    // Update API state for pagination
                    pygmalionApiState.page = 1;
                    pygmalionApiState.hasMore = result.hasMore;
                    pygmalionApiState.lastSearch = persistedSearch?.filters?.search || '';
                    pygmalionApiState.lastSort = pygmalionSort;
                    pygmalionApiState.totalItems = result.totalItems;

                    console.log(`[Bot Browser] Loaded ${cards.length} Pygmalion cards, hasMore: ${result.hasMore}, total: ${result.totalItems}`);
                } else {
                    toastr.info(`Loading ${sourceName}...`, '', { timeOut: 2000 });

                    // Determine if live API should be used
                    const isChubService = sourceName === 'chub' || sourceName === 'chub_lorebooks';
                    const isCharacterTavern = sourceName === 'character_tavern';
                    const isMlpchag = sourceName === 'mlpchag';
                    const isWyvern = sourceName === 'wyvern' || sourceName === 'wyvern_lorebooks';
                    const useLiveCharacterTavernApi = extension_settings[extensionName].useCharacterTavernLiveApi !== false;
                    const useLiveMlpchagApi = extension_settings[extensionName].useMlpchagLiveApi !== false;
                    const useWyvernLiveApi = extension_settings[extensionName].useWyvernLiveApi !== false;

                    let useLive = false;
                    if (isChubService) {
                        useLive = useLiveChubApi;
                    } else if (isCharacterTavern) {
                        useLive = useLiveCharacterTavernApi;
                    } else if (isMlpchag) {
                        useLive = useLiveMlpchagApi;
                    } else if (isWyvern) {
                        useLive = useWyvernLiveApi;
                    }

                    // For live APIs, pass persisted filters to API (including advanced filters)
                    let loadOptions = {};
                    if ((isChubService || isCharacterTavern || isWyvern) && useLive) {
                        const autoClear = extension_settings[extensionName].autoClearFilters !== false;
                        const persistedSearch = autoClear ? null : loadPersistentSearch(extensionName, extension_settings, sourceName);
                        const sortBy = persistedSearch?.sortBy || extension_settings[extensionName].defaultSortBy || 'relevance';
                        loadOptions = {
                            sort: sortBy,
                            search: persistedSearch?.filters?.search || '',
                            hideNsfw: extension_settings[extensionName].hideNsfw,
                            ...(autoClear ? {} : (persistedSearch?.advancedFilters || {}))
                        };
                    }

                    cards = await loadServiceIndex(sourceName, useLive, loadOptions);
                }

                await createCardBrowser(sourceName, cards, state, extensionName, extension_settings, showCardDetailWrapper);
            } catch (error) {
                console.error('[Bot Browser] Error loading source:', error);
                toastr.error(`Failed to load ${sourceName}`);
            }
        });
    });
}

// Setup close button
function setupCloseButton(menu) {
    const closeButton = menu.querySelector('.bot-browser-close');
    if (closeButton) {
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            closeBotBrowserMenu();
        });
    }
}

// Setup bottom buttons (settings, stats, random)
function setupBottomButtons(menu) {
    const settingsButtons = menu.querySelectorAll('.bot-browser-settings');
    settingsButtons.forEach(settingsButton => {
        settingsButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showSettingsModal();
        });
    });

    const statsButtons = menu.querySelectorAll('.bot-browser-stats');
    statsButtons.forEach(statsButton => {
        statsButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showStatsModal();
        });
    });

    const randomButtons = menu.querySelectorAll('.bot-browser-random');
    randomButtons.forEach(randomButton => {
        randomButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await playServiceRoulette(menu);
        });
    });
}

// Store current random service for "same source" random button
let currentRandomService = null;

function getEnabledRandomServiceIds() {
    const configured = extension_settings[extensionName]?.randomServices || {};
    return randomServiceOptions
        .map(s => s.id)
        .filter(id => configured[id] !== false);
}

// Play service roulette - instant random selection (no animation)
async function playServiceRoulette(menu, preferSameService = null) {
    const serviceNames = getEnabledRandomServiceIds();
    if (serviceNames.length === 0) {
        toastr.warning('No random sources enabled. Enable at least one in Settings > Random.');
        return;
    }

    // Disable the random button during loading
    const randomButtons = menu.querySelectorAll('.bot-browser-random');
    randomButtons.forEach(btn => btn.disabled = true);

    try {
        // Select service - either same as before or random
        let selectedService;
        if (preferSameService && serviceNames.includes(preferSameService)) {
            selectedService = preferSameService;
        } else {
            selectedService = serviceNames[Math.floor(Math.random() * serviceNames.length)];
        }

        // Store for "same source" button
        currentRandomService = selectedService;

        // Load a random card from the selected service
        let cards;
        const useLiveChubApi = extension_settings[extensionName].useChubLiveApi !== false;
        const useRisuRealmLiveApi = extension_settings[extensionName].useRisuRealmLiveApi !== false;

        // Special handling for live APIs - use random pages for true randomness
        if (selectedService === 'jannyai') {
            const searchResults = await searchJannyCharacters({
                search: '',
                page: Math.floor(Math.random() * 10) + 1, // Random page 1-10
                limit: 40,
                sort: 'createdAtStamp:desc'
            });
            const results = searchResults.results?.[0] || {};
            cards = (results.hits || []).map(hit => transformJannyCard(hit));
        } else if (selectedService === 'chub' && useLiveChubApi) {
            // Chub live API - use random page for variety
            const randomPage = Math.floor(Math.random() * 50) + 1; // Random page 1-50
            const result = await searchChubCards({
                search: '',
                limit: 48,
                page: randomPage,
                sort: 'random', // Chub supports random sort
                nsfw: !extension_settings[extensionName].hideNsfw
            });
            const nodes = result?.data?.nodes || result?.nodes || [];
            cards = nodes.map(node => ({
                ...transformChubCard(node),
                sourceService: 'chub',
                isLiveChub: true
            }));
        } else if (selectedService === 'risuai_realm' && useRisuRealmLiveApi) {
            // RisuRealm live API - use random page for variety
            const randomPage = Math.floor(Math.random() * 20) + 1; // Random page 1-20
            const result = await searchRisuRealm({
                search: '',
                page: randomPage,
                sort: 'download', // Mix it up with download sort
                nsfw: !extension_settings[extensionName].hideNsfw
            });
            cards = result.cards.map(card => ({
                ...transformRisuRealmCard(card),
                sourceService: 'risuai_realm',
                isLiveApi: true
            }));
        } else {
            cards = await loadServiceIndex(selectedService);
        }

        const randomCard = await getRandomCard(selectedService, cards, loadServiceIndex);

        if (randomCard) {
            await showCardDetailWrapper(randomCard, true, true); // save=true, isRandom=true
        } else {
            toastr.warning('No cards available from this service');
        }
    } catch (error) {
        console.error('[Bot Browser] Error loading random card:', error);
        toastr.error('Failed to load random card');
    }

    // Re-enable buttons
    randomButtons.forEach(btn => btn.disabled = false);
}

// Get random card from any service (for "any source" button)
async function getRandomCardFromAnyService() {
    const menu = document.getElementById('bot-browser-menu');
    if (menu) {
        await playServiceRoulette(menu, null);
    }
}

// Get random card from same service (for "same source" button)
async function getRandomCardFromSameService() {
    const menu = document.getElementById('bot-browser-menu');
    if (menu && currentRandomService) {
        await playServiceRoulette(menu, currentRandomService);
    } else if (menu) {
        // Fallback to any if no current service
        await playServiceRoulette(menu, null);
    }
}

// Show settings modal
function showSettingsModal() {
    const settings = extension_settings[extensionName];

    // Create a completely new modal structure with dedicated classes
    const modalHTML = `
        <div id="bb-settings-backdrop" class="bb-settings-backdrop">
            <div id="bb-settings-panel" class="bb-settings-panel">
                <div class="bb-settings-header">
                    <h2><i class="fa-solid fa-gear"></i> Settings</h2>
                    <button class="bb-settings-close-btn" id="bb-settings-close">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>

                <div class="bb-settings-tabs">
                    <button class="bb-settings-tab active" data-tab="filtering">
                        <i class="fa-solid fa-filter"></i> <span>Filtering</span>
                    </button>
                    <button class="bb-settings-tab" data-tab="display">
                        <i class="fa-solid fa-eye"></i> <span>Display</span>
                    </button>
                    <button class="bb-settings-tab" data-tab="search">
                        <i class="fa-solid fa-magnifying-glass"></i> <span>Search</span>
                    </button>
                    <button class="bb-settings-tab" data-tab="random">
                        <i class="fa-solid fa-cube"></i> <span>Random</span>
                    </button>
                    <button class="bb-settings-tab" data-tab="api">
                        <i class="fa-solid fa-cloud"></i> <span>API</span>
                    </button>
                </div>

                <div class="bb-settings-body">
                    <!-- FILTERING TAB -->
                    <div class="bb-settings-tab-content active" data-content="filtering">
                        <div class="bb-setting-group">
                            <label><i class="fa-solid fa-ban"></i> Tag Blocklist</label>
                            <textarea id="bb-setting-tag-blocklist" rows="5" placeholder="Enter tags or terms to block, one per line...">${(settings.tagBlocklist || []).join('\n')}</textarea>
                            <small>Cards with these tags/terms will be hidden. One per line.</small>
                        </div>

                        <div class="bb-setting-group">
                            <label class="bb-checkbox">
                                <input type="checkbox" id="bb-setting-hide-nsfw" ${settings.hideNsfw ? 'checked' : ''}>
                                <span>Hide NSFW Cards</span>
                            </label>
                            <small>Completely hide cards marked as possibly NSFW.</small>
                        </div>

                        <div class="bb-setting-note">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <span>NSFW detection is not 100% accurate.</span>
                        </div>
                    </div>

                    <!-- DISPLAY TAB -->
                    <div class="bb-settings-tab-content" data-content="display">
                        <div class="bb-setting-group">
                            <label class="bb-checkbox">
                                <input type="checkbox" id="bb-setting-blur-cards" ${settings.blurCards ? 'checked' : ''}>
                                <span>Blur All Card Images</span>
                            </label>
                        </div>

                        <div class="bb-setting-group">
                            <label class="bb-checkbox">
                                <input type="checkbox" id="bb-setting-blur-nsfw" ${settings.blurNsfw ? 'checked' : ''}>
                                <span>Blur NSFW Card Images</span>
                            </label>
                        </div>

                        <div class="bb-setting-group">
                            <label>Cards Per Page: <span id="bb-cards-per-page-value">${settings.cardsPerPage}</span></label>
                            <input type="range" id="bb-setting-cards-per-page" min="50" max="500" step="50" value="${settings.cardsPerPage}">
                        </div>

                        <div class="bb-setting-group">
                            <label class="bb-checkbox">
                                <input type="checkbox" id="bb-setting-recently-viewed" ${settings.recentlyViewedEnabled ? 'checked' : ''}>
                                <span>Show Recently Viewed</span>
                            </label>
                        </div>

                        <div class="bb-setting-group">
                            <label>Max Recent Cards: <span id="bb-max-recent-value">${settings.maxRecentlyViewed}</span></label>
                            <input type="range" id="bb-setting-max-recent" min="5" max="20" value="${settings.maxRecentlyViewed}">
                        </div>

                        <button id="bb-clear-recent" class="bb-setting-action-btn danger">
                            <i class="fa-solid fa-trash"></i> Clear Recently Viewed
                        </button>
                    </div>

                    <!-- SEARCH TAB -->
                    <div class="bb-settings-tab-content" data-content="search">
                        <div class="bb-setting-group">
                            <label class="bb-checkbox">
                                <input type="checkbox" id="bb-setting-persistent-search" ${settings.persistentSearchEnabled ? 'checked' : ''}>
                                <span>Remember Last Search</span>
                            </label>
                        </div>

                        <div class="bb-setting-group">
                            <label class="bb-checkbox">
                                <input type="checkbox" id="bb-setting-auto-clear-filters" ${settings.autoClearFilters !== false ? 'checked' : ''}>
                                <span>Clear Filters on Source Change</span>
                            </label>
                            <small style="color: rgba(255,255,255,0.5); display: block; margin-top: 5px; margin-left: 28px;">
                                Auto-clears search, tags, and sort when switching sources
                            </small>
                        </div>

                        <div class="bb-setting-group">
                            <label>Default Sort:</label>
                            <select id="bb-setting-default-sort">
                                <option value="relevance" ${settings.defaultSortBy === 'relevance' ? 'selected' : ''}>Relevance</option>
                                <option value="date_desc" ${settings.defaultSortBy === 'date_desc' ? 'selected' : ''}>Newest First</option>
                                <option value="date_asc" ${settings.defaultSortBy === 'date_asc' ? 'selected' : ''}>Oldest First</option>
                                <option value="name_asc" ${settings.defaultSortBy === 'name_asc' ? 'selected' : ''}>Name (A-Z)</option>
                                <option value="name_desc" ${settings.defaultSortBy === 'name_desc' ? 'selected' : ''}>Name (Z-A)</option>
                                <option value="tokens_desc" ${settings.defaultSortBy === 'tokens_desc' ? 'selected' : ''}>Most Tokens</option>
                                <option value="tokens_asc" ${settings.defaultSortBy === 'tokens_asc' ? 'selected' : ''}>Least Tokens</option>
                            </select>
                        </div>

                        <div class="bb-setting-group">
                            <label>Fuzzy Search Tolerance: <span id="bb-threshold-value">${(settings.fuzzySearchThreshold * 100).toFixed(0)}%</span></label>
                            <input type="range" id="bb-setting-threshold" min="0" max="100" value="${settings.fuzzySearchThreshold * 100}">
                            <small>Lower = exact matches, Higher = allow typos</small>
                        </div>

                        <button id="bb-clear-search" class="bb-setting-action-btn danger">
                            <i class="fa-solid fa-eraser"></i> Clear Search History
                        </button>

                        <button id="bb-clear-imports" class="bb-setting-action-btn danger" style="margin-top: 10px;">
                            <i class="fa-solid fa-trash-can"></i> Clear Import Tracking
                        </button>
                        <small style="color: rgba(255,255,255,0.5); display: block; margin-top: 5px;">
                            Clears the "My Imports" list (doesn't delete actual characters)
                        </small>
                    </div>

                    <!-- RANDOM TAB -->
                    <div class="bb-settings-tab-content" data-content="random">
                        <div class="bb-setting-group">
                            <label><i class="fa-solid fa-cube"></i> Allowed Random Sources</label>
                            <small>Choose which services can be used when fetching a random card.</small>
                            <div class="bb-random-service-list" id="bb-random-service-list">
                                ${randomServiceOptions.map(service => {
                                    const enabled = settings.randomServices?.[service.id] !== false;
                                    const iconBg = service.iconBg ? `background-color: ${service.iconBg};` : '';
                                    const iconSize = service.iconSize ? `background-size: ${service.iconSize};` : '';
                                    return `
                                        <button type="button"
                                                class="bb-random-service-item${enabled ? ' enabled' : ''}"
                                                data-service="${service.id}"
                                                aria-pressed="${enabled ? 'true' : 'false'}">
                                            <span class="bb-random-service-icon"
                                                  style="background-image: url('${service.iconUrl}'); ${iconBg} ${iconSize}"></span>
                                            <span class="bb-random-service-name">${escapeHTML(service.name)}</span>
                                            <span class="bb-random-service-check"><i class="fa-solid fa-check"></i></span>
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>

                    <!-- API TAB -->
                    <div class="bb-settings-tab-content" data-content="api">
                        <div class="bb-setting-group" style="text-align: center;">
                            <div style="display: inline-block; background: white; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px;">
                                <img src="https://avatars.charhub.io/icons/assets/full_logo.png" alt="Chub" style="height: 28px;">
                            </div>
                            <label class="bb-checkbox" style="justify-content: center;">
                                <input type="checkbox" id="bb-setting-chub-live-api" ${settings.useChubLiveApi !== false ? 'checked' : ''}>
                                <span>Use Live Chub API</span>
                            </label>
                        </div>

                        <div class="bb-api-options">
                            <div class="bb-api-option live">
                                <i class="fa-solid fa-bolt"></i>
                                <strong>Live API</strong>
                                <small>Latest cards with advanced filters</small>
                            </div>
                            <div class="bb-api-option archive">
                                <i class="fa-solid fa-archive"></i>
                                <strong>Archive</strong>
                                <small>Static index, works if Chub goes down</small>
                            </div>
                        </div>

                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">

                        <div class="bb-setting-group" style="text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #2d1b4e, #1a1a2e); border-radius: 8px; padding: 8px 16px; margin-bottom: 10px;">
                                <span style="font-size: 18px; font-weight: bold; color: #c9a0ff;">Character Tavern</span>
                            </div>
                            <label class="bb-checkbox" style="justify-content: center;">
                                <input type="checkbox" id="bb-setting-ct-live-api" ${settings.useCharacterTavernLiveApi ? 'checked' : ''}>
                                <span>Use Live Character Tavern API</span>
                            </label>
                            <small style="color: rgba(255,255,255,0.5); display: block; margin-top: 8px;">
                                Enable for live search with advanced filters (token range, lorebook, OC)
                            </small>
                        </div>

                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">

                        <div class="bb-setting-group" style="text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #1e3a5f, #2d1b4e); border-radius: 8px; padding: 8px 16px; margin-bottom: 10px;">
                                <span style="font-size: 18px; font-weight: bold; color: #7dd3fc;">RisuRealm</span>
                            </div>
                            <label class="bb-checkbox" style="justify-content: center;">
                                <input type="checkbox" id="bb-setting-risurealm-live-api" ${settings.useRisuRealmLiveApi !== false ? 'checked' : ''}>
                                <span>Use Live RisuRealm API</span>
                            </label>
                            <small style="color: rgba(255,255,255,0.5); display: block; margin-top: 8px;">
                                Fetch characters from realm.risuai.net (live search, creator pages not supported)
                            </small>
                        </div>

                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">

                        <div class="bb-setting-group" style="text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #2d1b4e, #1a2e1a); border-radius: 8px; padding: 8px 16px; margin-bottom: 10px;">
                                <span style="font-size: 18px; font-weight: bold; color: #c9ffda;">MLPChag</span>
                            </div>
                            <label class="bb-checkbox" style="justify-content: center;">
                                <input type="checkbox" id="bb-setting-mlpchag-live-api" ${settings.useMlpchagLiveApi ? 'checked' : ''}>
                                <span>Use Live MLPChag API</span>
                            </label>
                            <small style="color: rgba(255,255,255,0.5); display: block; margin-top: 8px;">
                                Enable to fetch characters directly from mlpchag.neocities.org
                            </small>
                        </div>

                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">

                        <div class="bb-setting-group" style="text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #4a1d6e, #1a2e4e); border-radius: 8px; padding: 8px 16px; margin-bottom: 10px;">
                                <span style="font-size: 18px; font-weight: bold; color: #d4a0ff;">Wyvern Chat</span>
                            </div>
                            <label class="bb-checkbox" style="justify-content: center;">
                                <input type="checkbox" id="bb-setting-wyvern-live-api" ${settings.useWyvernLiveApi !== false ? 'checked' : ''}>
                                <span>Use Live Wyvern API</span>
                            </label>
                            <small style="color: rgba(255,255,255,0.5); display: block; margin-top: 8px;">
                                Fetch characters and lorebooks from api.wyvern.chat
                            </small>
                        </div>

                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">

                        <div class="bb-setting-group" style="text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 8px; padding: 8px 12px; margin-bottom: 10px;">
                                <img src="https://quillgen.app/logo-dark.png" alt="QuillGen" style="height: 32px; display: block;">
                            </div>
                            <div style="margin-bottom: 10px;">
                                <strong style="color: rgba(255,255,255,0.9);">QuillGen</strong>
                            </div>
                            <small style="color: rgba(255,255,255,0.6); display: block; margin-bottom: 15px;">
                                Browse public characters from QuillGen. Add your API key to also see your own characters.
                                <a href="https://quillgen.app" target="_blank" style="color: rgba(100, 150, 255, 0.9);">Get your API key →</a>
                            </small>
                        </div>

                        <div class="bb-setting-group">
                            <label for="bb-setting-quillgen-key">QuillGen API Key (optional):</label>
                            <input type="password" id="bb-setting-quillgen-key" class="text_pole" 
                                   placeholder="sk_..." 
                                   value="${settings.quillgenApiKey || ''}"
                                   style="width: 100%; font-family: monospace;">
                        </div>
                    </div>
                </div>

                <div class="bb-settings-footer">
                    <button id="bb-settings-save" class="bb-settings-save-btn">
                        <i class="fa-solid fa-save"></i> Save Settings
                    </button>
                </div>
            </div>
        </div>
    `;

    // Insert into body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const backdrop = document.getElementById('bb-settings-backdrop');
    const panel = document.getElementById('bb-settings-panel');

    // Tab switching
    const tabs = panel.querySelectorAll('.bb-settings-tab');
    const contents = panel.querySelectorAll('.bb-settings-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            const tabName = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            contents.forEach(content => {
                content.classList.toggle('active', content.dataset.content === tabName);
            });
        });
    });

    // Close handlers
    document.getElementById('bb-settings-close').addEventListener('click', closeSettingsModal);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeSettingsModal();
    });

    // Prevent panel clicks from closing
    panel.addEventListener('click', (e) => e.stopPropagation());

    // Random services toggle list
    panel.querySelectorAll('.bb-random-service-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const enabled = item.classList.toggle('enabled');
            item.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        });
    });

    // Range sliders
    document.getElementById('bb-setting-max-recent').addEventListener('input', (e) => {
        document.getElementById('bb-max-recent-value').textContent = e.target.value;
    });

    document.getElementById('bb-setting-threshold').addEventListener('input', (e) => {
        document.getElementById('bb-threshold-value').textContent = e.target.value + '%';
    });

    document.getElementById('bb-setting-cards-per-page').addEventListener('input', (e) => {
        document.getElementById('bb-cards-per-page-value').textContent = e.target.value;
    });

    // Clear buttons
    document.getElementById('bb-clear-recent').addEventListener('click', () => {
        if (confirm('Clear all recently viewed cards?')) {
            state.recentlyViewed = [];
            localStorage.removeItem('botBrowser_recentlyViewed');
            toastr.success('Recently viewed cleared');
        }
    });

    document.getElementById('bb-clear-search').addEventListener('click', () => {
        if (confirm('Clear search history?')) {
            localStorage.removeItem('botBrowser_lastSearch');
            state.filters = { search: '', tags: [], creator: '' };
            state.sortBy = 'relevance';
            toastr.success('Search history cleared');
        }
    });

    document.getElementById('bb-clear-imports').addEventListener('click', () => {
        if (confirm('Clear import tracking? This removes the "My Imports" list but does not delete any actual characters.')) {
            clearImportedCards();
            toastr.success('Import tracking cleared');
        }
    });

    // Save button
    document.getElementById('bb-settings-save').addEventListener('click', () => {
        settings.recentlyViewedEnabled = document.getElementById('bb-setting-recently-viewed').checked;
        settings.maxRecentlyViewed = parseInt(document.getElementById('bb-setting-max-recent').value);
        settings.persistentSearchEnabled = document.getElementById('bb-setting-persistent-search').checked;
        settings.autoClearFilters = document.getElementById('bb-setting-auto-clear-filters').checked;
        settings.defaultSortBy = document.getElementById('bb-setting-default-sort').value;
        settings.fuzzySearchThreshold = parseInt(document.getElementById('bb-setting-threshold').value) / 100;
        settings.cardsPerPage = parseInt(document.getElementById('bb-setting-cards-per-page').value);
        settings.blurCards = document.getElementById('bb-setting-blur-cards').checked;
        settings.blurNsfw = document.getElementById('bb-setting-blur-nsfw').checked;
        settings.hideNsfw = document.getElementById('bb-setting-hide-nsfw').checked;

        const blocklistText = document.getElementById('bb-setting-tag-blocklist').value;
        settings.tagBlocklist = blocklistText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        settings.useChubLiveApi = document.getElementById('bb-setting-chub-live-api').checked;
        settings.useCharacterTavernLiveApi = document.getElementById('bb-setting-ct-live-api').checked;
        settings.useRisuRealmLiveApi = document.getElementById('bb-setting-risurealm-live-api').checked;
        settings.useMlpchagLiveApi = document.getElementById('bb-setting-mlpchag-live-api').checked;
        settings.useWyvernLiveApi = document.getElementById('bb-setting-wyvern-live-api').checked;

        // Random services
        const randomServices = {};
        panel.querySelectorAll('.bb-random-service-item').forEach((item) => {
            const serviceId = item.dataset.service;
            if (!serviceId) return;
            randomServices[serviceId] = item.classList.contains('enabled');
        });
        settings.randomServices = randomServices;

        // QuillGen settings
        const oldApiKey = settings.quillgenApiKey;
        settings.quillgenApiKey = document.getElementById('bb-setting-quillgen-key').value.trim();

        // Clear QuillGen cache if settings changed
        if (oldApiKey !== settings.quillgenApiKey) {
            clearQuillgenCache();
        }

        saveSettingsDebounced();
        applyBlurSetting();

        toastr.success('Settings saved!');
        closeSettingsModal();

        if (settings.recentlyViewedEnabled) {
            state.recentlyViewed = loadRecentlyViewed(extensionName, extension_settings);
        } else {
            state.recentlyViewed = [];
        }

        if (state.view === 'browser') {
            refreshCardGrid(state, extensionName, extension_settings, showCardDetailWrapper);
        }
    });

    console.log('[Bot Browser] Settings modal opened');
}

// Close settings modal
function closeSettingsModal() {
    const backdrop = document.getElementById('bb-settings-backdrop');
    if (backdrop) backdrop.remove();
    console.log('[Bot Browser] Settings modal closed');
}

// Show stats modal
function showStatsModal() {
    const overlay = document.createElement('div');
    overlay.id = 'bot-browser-stats-overlay';
    overlay.className = 'bot-browser-detail-overlay';
    document.body.appendChild(overlay);

    const topSources = Object.entries(importStats.bySource)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const topCreators = Object.entries(importStats.byCreator)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const recentImports = importStats.imports.slice(0, 10);

    const firstImport = importStats.imports.length > 0
        ? new Date(Math.min(...importStats.imports.map(i => i.timestamp)))
        : null;

    const modal = document.createElement('div');
    modal.id = 'bot-browser-stats-modal';
    modal.className = 'bot-browser-detail-modal';
    modal.innerHTML = `
        <div class="bot-browser-detail-header">
            <h2><i class="fa-solid fa-chart-bar"></i> Import Statistics</h2>
            <button class="bot-browser-detail-close">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>

        <div class="bot-browser-detail-content" style="display: block; overflow-y: auto;">
            <div style="padding: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;">
                    <div style="background: linear-gradient(135deg, rgba(100, 200, 100, 0.2), rgba(60, 180, 60, 0.2)); border: 1px solid rgba(100, 200, 100, 0.4); border-radius: 10px; padding: 20px; text-align: center;">
                        <div style="font-size: 2.5em; font-weight: 700; color: rgba(100, 200, 100, 1);">${importStats.totalCharacters}</div>
                        <div style="color: rgba(255, 255, 255, 0.8); margin-top: 8px;">Characters Imported</div>
                    </div>
                    <div style="background: linear-gradient(135deg, rgba(100, 150, 255, 0.2), rgba(120, 100, 255, 0.2)); border: 1px solid rgba(100, 150, 255, 0.4); border-radius: 10px; padding: 20px; text-align: center;">
                        <div style="font-size: 2.5em; font-weight: 700; color: rgba(100, 150, 255, 1);">${importStats.totalLorebooks}</div>
                        <div style="color: rgba(255, 255, 255, 0.8); margin-top: 8px;">Lorebooks Imported</div>
                    </div>
                    <div style="background: linear-gradient(135deg, rgba(255, 150, 100, 0.2), rgba(255, 100, 150, 0.2)); border: 1px solid rgba(255, 150, 100, 0.4); border-radius: 10px; padding: 20px; text-align: center;">
                        <div style="font-size: 2.5em; font-weight: 700; color: rgba(255, 150, 100, 1);">${importStats.totalCharacters + importStats.totalLorebooks}</div>
                        <div style="color: rgba(255, 255, 255, 0.8); margin-top: 8px;">Total Imports</div>
                    </div>
                </div>

                ${firstImport ? `
                <div style="text-align: center; margin-bottom: 30px; padding: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
                    <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.9em;">Member since</div>
                    <div style="color: rgba(255, 255, 255, 0.9); font-size: 1.1em; font-weight: 600; margin-top: 5px;">${firstImport.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
                ` : ''}

                ${topSources.length > 0 ? `
                <div style="margin-bottom: 30px;">
                    <h3 style="color: rgba(255, 255, 255, 0.95); margin-bottom: 15px; font-size: 1.2em;"><i class="fa-solid fa-globe"></i> Top Sources</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${topSources.map(([source, count]) => {
                            const percentage = ((count / (importStats.totalCharacters + importStats.totalLorebooks)) * 100).toFixed(1);
                            return `
                                <div style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <span style="color: rgba(255, 255, 255, 0.9); font-weight: 500;">${escapeHTML(source)}</span>
                                        <span style="color: rgba(255, 255, 255, 0.7); font-size: 0.9em;">${count} imports (${percentage}%)</span>
                                    </div>
                                    <div style="background: rgba(0, 0, 0, 0.3); height: 8px; border-radius: 4px; overflow: hidden;">
                                        <div style="background: linear-gradient(90deg, rgba(100, 150, 255, 0.8), rgba(120, 100, 255, 0.8)); height: 100%; width: ${percentage}%; border-radius: 4px; transition: width 0.3s ease;"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}

                ${topCreators.length > 0 ? `
                <div style="margin-bottom: 30px;">
                    <h3 style="color: rgba(255, 255, 255, 0.95); margin-bottom: 15px; font-size: 1.2em;"><i class="fa-solid fa-user"></i> Top Creators</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px;">
                        ${topCreators.map(([creator, count]) => `
                            <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px; text-align: center;">
                                <div style="color: rgba(255, 255, 255, 0.9); font-weight: 500; font-size: 0.95em; margin-bottom: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(creator)}">${escapeHTML(creator)}</div>
                                <div style="color: rgba(100, 150, 255, 0.9); font-size: 1.3em; font-weight: 600;">${count}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                ${recentImports.length > 0 ? `
                <div>
                    <h3 style="color: rgba(255, 255, 255, 0.95); margin-bottom: 15px; font-size: 1.2em;"><i class="fa-solid fa-clock"></i> Recent Imports</h3>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${recentImports.map(imp => {
                            const date = new Date(imp.timestamp);
                            const timeAgo = getTimeAgo(imp.timestamp);
                            return `
                                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="color: rgba(255, 255, 255, 0.9); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(imp.name)}</div>
                                        <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.85em; margin-top: 3px;">
                                            ${escapeHTML(imp.creator)} • ${escapeHTML(imp.source)} • ${imp.type === 'character' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-book"></i>'} ${imp.type}
                                        </div>
                                    </div>
                                    <div style="color: rgba(255, 255, 255, 0.5); font-size: 0.85em; white-space: nowrap; margin-left: 15px;" title="${date.toLocaleString()}">${timeAgo}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : '<div style="text-align: center; padding: 40px; color: rgba(255, 255, 255, 0.5);">No imports yet. Start importing characters and lorebooks to see your stats!</div>'}
            </div>
        </div>

        <div class="bot-browser-detail-actions">
            <button class="bot-browser-detail-back" id="clear-stats-button" style="background: rgba(255, 100, 100, 0.2); border-color: rgba(255, 100, 100, 0.4); flex: 0 0 auto;">
                <i class="fa-solid fa-trash"></i> Clear All Stats
            </button>
            <button class="bot-browser-detail-back">
                <i class="fa-solid fa-times"></i> Close
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.bot-browser-detail-close');
    const backButtons = modal.querySelectorAll('.bot-browser-detail-back');

    const closeModal = () => {
        modal.remove();
        overlay.remove();
    };

    // Comprehensive click prevention
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        closeModal();
    });

    backButtons.forEach((btn) => {
        if (btn.id !== 'clear-stats-button') {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
                closeModal();
            });
        }
    });

    overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        closeModal();
    });

    // Prevent all events from bubbling through the overlay
    overlay.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    overlay.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    // Prevent modal clicks from closing it
    modal.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    modal.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    modal.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    const clearStatsBtn = modal.querySelector('#clear-stats-button');
    clearStatsBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all import statistics? This cannot be undone.')) {
            importStats = {
                totalCharacters: 0,
                totalLorebooks: 0,
                imports: [],
                bySource: {},
                byCreator: {}
            };
            saveImportStats(importStats);
            toastr.success('Import statistics cleared');
            closeModal();
        }
    });

    console.log('[Bot Browser] Stats modal opened');
}

// Create and show the bot browser menu
function createBotBrowserMenu() {
    if ($('#bot-browser-menu').length > 0) {
        return;
    }

    state.recentlyViewed = loadRecentlyViewed(extensionName, extension_settings);

    const overlay = document.createElement('div');
    overlay.id = 'bot-browser-overlay';
    overlay.className = 'bot-browser-overlay';
    overlay.style.setProperty('position', 'fixed', 'important');
    overlay.style.setProperty('inset', '0', 'important');
    overlay.style.setProperty('z-index', '5000', 'important');

    const menu = document.createElement('div');
    menu.id = 'bot-browser-menu';
    menu.className = 'bot-browser-menu';
    menu.style.setProperty('position', 'fixed', 'important');
    menu.style.setProperty('top', '50vh', 'important');
    menu.style.setProperty('left', '50vw', 'important');
    menu.style.setProperty('z-index', '5001', 'important');

    const menuContent = document.createElement('div');
    menuContent.className = 'bot-browser-content';
    menuContent.innerHTML = getOriginalMenuHTML(state.recentlyViewed);

    // Add bottom action buttons to each tab content
    const tabContents = menuContent.querySelectorAll('.bot-browser-tab-content');
    tabContents.forEach(tabContent => {
        const bottomActions = document.createElement('div');
        bottomActions.className = 'bot-browser-bottom-actions';
        bottomActions.innerHTML = createBottomActions();
        tabContent.appendChild(bottomActions);
    });

    menu.appendChild(menuContent);

    document.body.appendChild(overlay);
    document.body.appendChild(menu);

    overlay.addEventListener('click', closeBotBrowserMenu);
    menu.addEventListener('click', (e) => e.stopPropagation());
    menu.addEventListener('mousedown', (e) => e.stopPropagation());
    menu.addEventListener('mouseup', (e) => e.stopPropagation());

    // Block pointer events on background
    document.body.style.pointerEvents = 'none';
    overlay.style.pointerEvents = 'all';
    menu.style.pointerEvents = 'all';

    // Watch for dialogs
    const dialogObserver = new MutationObserver((mutations) => {
        const openDialogs = document.querySelectorAll('dialog[open]');
        if (openDialogs.length > 0) {
            document.body.style.pointerEvents = '';
            overlay.style.pointerEvents = 'none';
            menu.style.pointerEvents = 'none';
            const detailOverlay = document.getElementById('bot-browser-detail-overlay');
            const detailModal = document.getElementById('bot-browser-detail-modal');
            if (detailOverlay) detailOverlay.style.pointerEvents = 'none';
            if (detailModal) detailModal.style.pointerEvents = 'none';
        } else {
            document.body.style.pointerEvents = 'none';
            overlay.style.pointerEvents = 'all';
            menu.style.pointerEvents = 'all';
            const detailOverlay = document.getElementById('bot-browser-detail-overlay');
            const detailModal = document.getElementById('bot-browser-detail-modal');
            if (detailOverlay) detailOverlay.style.pointerEvents = 'all';
            if (detailModal) detailModal.style.pointerEvents = 'all';
        }
    });

    dialogObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['open'],
        subtree: true,
        childList: true
    });

    menu.dialogObserver = dialogObserver;

    setupTabSwitching(menu);
    setupSourceButtons(menu);
    setupRecentlyViewedCards(menu);
    setupCloseButton(menu);
    setupBottomButtons(menu);

    applyBlurSetting();

    // Check for updates (non-blocking, shows banner if update available)
    const updateContainer = menu.querySelector('.bot-browser-content');
    if (updateContainer) {
        initUpdateChecker(updateContainer, EXTENSION_VERSION);
    }

    console.log('[Bot Browser] Menu created and displayed');
}

// Close bot browser menu
function closeBotBrowserMenu() {
    const menu = document.getElementById('bot-browser-menu');
    const overlay = document.getElementById('bot-browser-overlay');

    if (!menu || !overlay) return;

    if (menu.dialogObserver) {
        menu.dialogObserver.disconnect();
    }

    // Reset collections state when menu is closed
    collectionsState.viewingCollectionCharacters = false;
    collectionsState.lastCollectionData = null;

    menu.classList.add('closing');
    overlay.classList.add('closing');

    setTimeout(() => {
        menu.remove();
        overlay.remove();
        document.body.style.pointerEvents = '';
        console.log('[Bot Browser] Menu closed');
    }, 200);
}

// Prepare browser resources
async function cache() {
    if (!state.cacheInitialized) {
        state.cacheInitialized = true;
        await initializeServiceCache(showCardDetailWrapper);
    }
}

// Toggle bot menu
function toggleBotMenu() {
    if ($('#bot-browser-menu').length > 0) {
        closeBotBrowserMenu();
    } else {
        createBotBrowserMenu();
    }
    console.log('[Bot Browser] Bot menu toggled');
}

// Add bot button to character list panel
function addBotButton() {
    if ($('#rm_button_bot').length > 0) {
        return;
    }

    const botButton = $('<div>', {
        id: 'rm_button_bot',
        class: 'menu_button fa-solid fa-robot',
        title: 'Bot Browser',
        'data-i18n': '[title]Bot Browser'
    });

    botButton.on('click', function(event) {
        event.stopPropagation();
        toggleBotMenu();
    });

    cache();

    $('#rm_button_group_chats').after(botButton);

    console.log('[Bot Browser] Bot button added to character list panel');
}

// Listen for navigation events from browser.js
window.addEventListener('bot-browser-navigate-sources', navigateToSources);
window.addEventListener('bot-browser-close', closeBotBrowserMenu);

// Initialize extension
jQuery(async () => {
    console.log('[Bot Browser] Extension loading...');

    // Preload Puter.js for CORS-free fetching (loads in background)
    preloadPuter();

    loadSettings();

    // Load import stats and recently viewed
    importStats = loadImportStats();
    state.recentlyViewed = loadRecentlyViewed(extensionName, extension_settings);

    addBotButton();

    console.log('[Bot Browser] Extension loaded successfully!');

    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (extension_settings[extensionName].enabled) {
            console.log('[Bot Browser] Chat changed!');
        }
    });
});
