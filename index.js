import { extension_settings } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced, processDroppedFiles, getRequestHeaders } from '../../../../script.js';

// Import modules
import { loadImportStats, saveImportStats, loadRecentlyViewed } from './modules/storage/storage.js';
import { getTimeAgo } from './modules/storage/stats.js';
import { loadServiceIndex, initializeServiceCache, clearQuillgenCache } from './modules/services/cache.js';
import { getRandomCard } from './modules/services/cards.js';
import { importCardToSillyTavern } from './modules/services/import.js';
import { showCardDetail, closeDetailModal, showImageLightbox } from './modules/modals/detail.js';
import { createCardBrowser, refreshCardGrid } from './modules/browser.js';
import { getOriginalMenuHTML, createBottomActions } from './modules/templates/templates.js';
import { escapeHTML } from './modules/utils/utils.js';

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
    cacheInitialized: false
};

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
    quillgenApiKey: ''
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
async function showCardDetailWrapper(card, save = true) {
    await showCardDetail(card, extensionName, extension_settings, state, save);

    // After modal is created, attach additional handlers that need access to state
    const detailModal = document.getElementById('bot-browser-detail-modal');
    if (!detailModal) return;

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
        creatorLink.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const creator = creatorLink.dataset.creator;
            console.log('[Bot Browser] Filtering by creator:', creator);

            closeDetailModal();

            state.filters.creator = creator;
            const creatorFilterDropdown = document.querySelector('.bot-browser-creator-filter');
            if (creatorFilterDropdown) {
                creatorFilterDropdown.value = creator;
            }
            refreshCardGrid(state, extensionName, extension_settings, showCardDetailWrapper);

            toastr.success(`Showing all cards by ${escapeHTML(creator)}`, 'Filtered by Creator');
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

            if (!state.filters.tags.includes(tag)) {
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

// Navigate back to sources view
function navigateToSources() {
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

    // Apply blur setting
    applyBlurSetting();

    console.log('[Bot Browser] Navigated back to sources');
}

// Setup tab switching
function setupTabSwitching(menu) {
    const tabButtons = menu.querySelectorAll('.bot-browser-tab');
    const tabContents = menu.querySelectorAll('.bot-browser-tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            menu.querySelector(`.bot-browser-tab-content[data-content="${targetTab}"]`).classList.add('active');
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

// Setup source buttons
function setupSourceButtons(menu) {
    const sourceButtons = menu.querySelectorAll('.bot-browser-source');

    sourceButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const sourceName = button.dataset.source;
            if (!sourceName) return;

            console.log(`[Bot Browser] Loading source: ${sourceName}`);

            try {
                let cards = [];

                if (sourceName === 'all') {
                    toastr.info('Loading all cards...', '', { timeOut: 2000 });
                    const serviceNames = ['anchorhold', 'catbox', 'character_tavern', 'chub', 'nyai_me', 'risuai_realm', 'webring', 'mlpchag', 'desuarchive'];

                    for (const service of serviceNames) {
                        const serviceCards = await loadServiceIndex(service);
                        const cardsWithSource = serviceCards.map(card => ({
                            ...card,
                            sourceService: service
                        }));
                        cards = cards.concat(cardsWithSource);
                    }

                    console.log(`[Bot Browser] Loaded ${cards.length} cards from all sources`);
                } else {
                    toastr.info(`Loading ${sourceName}...`, '', { timeOut: 2000 });
                    cards = await loadServiceIndex(sourceName);
                }

                createCardBrowser(sourceName, cards, state, extensionName, extension_settings, showCardDetailWrapper);
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

// Play service roulette animation and select random card
async function playServiceRoulette(menu) {
    const serviceNames = ['risuai_realm', 'webring', 'nyai_me', 'chub', 'character_tavern', 'catbox', 'anchorhold', 'mlpchag', 'desuarchive'];
    const serviceButtons = menu.querySelectorAll('.bot-browser-source[data-source]');

    // Filter out the "all" button and lorebook buttons
    const validButtons = Array.from(serviceButtons).filter(btn => {
        const source = btn.dataset.source;
        return serviceNames.includes(source);
    });

    if (validButtons.length === 0) return;

    // Disable the random button during animation
    const randomButtons = menu.querySelectorAll('.bot-browser-random');
    randomButtons.forEach(btn => btn.disabled = true);

    // Animation parameters
    let currentIndex = 0;
    let interval = 50; // Start fast
    const maxInterval = 300; // End slow
    const intervalIncrease = 1.15; // Speed decrease factor
    const totalSpins = 15 + Math.floor(Math.random() * 10); // 15-24 spins
    let spinCount = 0;

    // Remove any existing highlights
    validButtons.forEach(btn => btn.classList.remove('roulette-highlight'));

    return new Promise((resolve) => {
        const spin = () => {
            // Remove previous highlight
            validButtons.forEach(btn => btn.classList.remove('roulette-highlight'));

            // Add highlight to current button
            validButtons[currentIndex].classList.add('roulette-highlight');

            // Move to next button
            currentIndex = (currentIndex + 1) % validButtons.length;
            spinCount++;

            if (spinCount >= totalSpins) {
                // Animation complete - select the highlighted service
                setTimeout(async () => {
                    const selectedButton = validButtons.find(btn => btn.classList.contains('roulette-highlight'));
                    const selectedService = selectedButton.dataset.source;

                    // Load a random card from the selected service
                    try {
                        const cards = await loadServiceIndex(selectedService);
                        const randomCard = await getRandomCard(selectedService, cards, loadServiceIndex);

                        if (randomCard) {
                            await showCardDetailWrapper(randomCard);
                        } else {
                            toastr.warning('No cards available from this service');
                        }
                    } catch (error) {
                        console.error('[Bot Browser] Error loading random card:', error);
                        toastr.error('Failed to load random card');
                    }

                    // Remove highlight and re-enable buttons
                    validButtons.forEach(btn => btn.classList.remove('roulette-highlight'));
                    randomButtons.forEach(btn => btn.disabled = false);
                    resolve();
                }, 500);
            } else {
                // Continue spinning with increasing interval (slowing down)
                interval = Math.min(interval * intervalIncrease, maxInterval);
                setTimeout(spin, interval);
            }
        };

        // Start the animation
        spin();
    });
}

// Show settings modal
function showSettingsModal() {
    const settingsOverlay = document.createElement('div');
    settingsOverlay.id = 'bot-browser-settings-overlay';
    settingsOverlay.className = 'bot-browser-detail-overlay';

    const settingsModal = document.createElement('div');
    settingsModal.id = 'bot-browser-settings-modal';
    settingsModal.className = 'bot-browser-detail-modal';

    const settings = extension_settings[extensionName];

    settingsModal.innerHTML = `
        <div class="bot-browser-detail-header">
            <h2><i class="fa-solid fa-gear"></i> Bot Browser Settings</h2>
            <button class="bot-browser-detail-close">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>

        <div class="bot-browser-detail-content" style="padding: 30px;">
            <div class="bot-browser-settings-section">
                <h3>Recently Viewed Cards</h3>

                <label class="checkbox_label">
                    <input type="checkbox" id="bb-setting-recently-viewed" ${settings.recentlyViewedEnabled ? 'checked' : ''}>
                    <span>Enable Recently Viewed Tracking</span>
                </label>

                <div class="bot-browser-setting-group">
                    <label for="bb-setting-max-recent">Max Recently Viewed Cards: <span id="bb-max-recent-value">${settings.maxRecentlyViewed}</span></label>
                    <input type="range" id="bb-setting-max-recent" min="5" max="20" value="${settings.maxRecentlyViewed}" class="bot-browser-slider">
                </div>

                <button id="bb-clear-recent" class="bot-browser-action-button">
                    <i class="fa-solid fa-trash"></i> Clear Recently Viewed
                </button>
            </div>

            <div class="bot-browser-settings-section">
                <h3>Search & Filters</h3>

                <label class="checkbox_label">
                    <input type="checkbox" id="bb-setting-persistent-search" ${settings.persistentSearchEnabled ? 'checked' : ''}>
                    <span>Remember Last Search & Filters</span>
                </label>

                <div class="bot-browser-setting-group">
                    <label for="bb-setting-default-sort">Default Sort Option:</label>
                    <select id="bb-setting-default-sort" class="text_pole">
                        <option value="relevance" ${settings.defaultSortBy === 'relevance' ? 'selected' : ''}>Relevance</option>
                        <option value="name_asc" ${settings.defaultSortBy === 'name_asc' ? 'selected' : ''}>Name (A-Z)</option>
                        <option value="name_desc" ${settings.defaultSortBy === 'name_desc' ? 'selected' : ''}>Name (Z-A)</option>
                        <option value="creator_asc" ${settings.defaultSortBy === 'creator_asc' ? 'selected' : ''}>Creator (A-Z)</option>
                        <option value="creator_desc" ${settings.defaultSortBy === 'creator_desc' ? 'selected' : ''}>Creator (Z-A)</option>
                    </select>
                </div>

                <div class="bot-browser-setting-group">
                    <label for="bb-setting-threshold">Fuzzy Search Strictness: <span id="bb-threshold-value">${(settings.fuzzySearchThreshold * 100).toFixed(0)}%</span></label>
                    <input type="range" id="bb-setting-threshold" min="0" max="100" value="${settings.fuzzySearchThreshold * 100}" class="bot-browser-slider">
                    <small style="color: rgba(255,255,255,0.6);">Lower = stricter matching, Higher = more lenient</small>
                </div>

                <div class="bot-browser-setting-group">
                    <label for="bb-setting-cards-per-page">Cards Per Page: <span id="bb-cards-per-page-value">${settings.cardsPerPage}</span></label>
                    <input type="range" id="bb-setting-cards-per-page" min="50" max="500" step="50" value="${settings.cardsPerPage}" class="bot-browser-slider">
                    <small style="color: rgba(255,255,255,0.6);">Number of cards to display on each page. Lower = faster loading, Higher = less page switching</small>
                </div>

                <button id="bb-clear-search" class="bot-browser-action-button">
                    <i class="fa-solid fa-eraser"></i> Clear Search History
                </button>
            </div>

            <div class="bot-browser-settings-section">
                <h3>Display & Privacy</h3>

                <label class="checkbox_label">
                    <input type="checkbox" id="bb-setting-blur-cards" ${settings.blurCards ? 'checked' : ''}>
                    <span>Blur All Card Images</span>
                </label>
                <small style="color: rgba(255,255,255,0.6); display: block; margin-top: 5px; margin-left: 28px;">Hide card images for privacy. Images remain blurred until clicked.</small>

                <label class="checkbox_label" style="margin-top: 15px;">
                    <input type="checkbox" id="bb-setting-blur-nsfw" ${settings.blurNsfw ? 'checked' : ''}>
                    <span>Blur NSFW Card Images</span>
                </label>
                <small style="color: rgba(255,255,255,0.6); display: block; margin-top: 5px; margin-left: 28px;">Blur only cards marked as possibly NSFW. Images remain blurred until clicked.</small>

                <label class="checkbox_label" style="margin-top: 15px;">
                    <input type="checkbox" id="bb-setting-hide-nsfw" ${settings.hideNsfw ? 'checked' : ''}>
                    <span>Hide NSFW Cards</span>
                </label>
                <small style="color: rgba(255,255,255,0.6); display: block; margin-top: 5px; margin-left: 28px;">Completely hide cards marked as possibly NSFW from results.</small>

                <div style="margin-top: 15px; padding: 10px; background: rgba(255, 150, 50, 0.1); border: 1px solid rgba(255, 150, 50, 0.3); border-radius: 6px;">
                    <small style="color: rgba(255, 200, 100, 0.9); display: block; line-height: 1.4;">
                        <i class="fa-solid fa-triangle-exclamation" style="margin-right: 5px;"></i>
                        <strong>Note:</strong> NSFW detection is not 100% accurate. Some NSFW content may still appear, and some SFW content may be incorrectly flagged.
                    </small>
                </div>

                <div style="margin-top: 20px;">
                    <label for="bb-setting-tag-blocklist" style="display: block; margin-bottom: 8px; color: rgba(255, 255, 255, 0.9); font-weight: 500;">
                        <i class="fa-solid fa-ban"></i> Tag Blocklist
                    </label>
                    <textarea id="bb-setting-tag-blocklist" class="text_pole" rows="4" style="width: 100%; resize: vertical; font-family: monospace; font-size: 0.9em;" placeholder="Enter tags or terms to block, one per line">${(settings.tagBlocklist || []).join('\n')}</textarea>
                    <small style="color: rgba(255,255,255,0.6); display: block; margin-top: 5px;">Cards with these tags or terms in their name/description will be hidden. Enter one term per line (case-insensitive).</small>
                </div>
            </div>

            <div class="bot-browser-settings-section">
                <h3><i class="fa-solid fa-feather-pointed"></i> QuillGen</h3>
                <small style="color: rgba(255,255,255,0.6); display: block; margin-bottom: 15px;">
                    Browse public characters from QuillGen. Add your API key to also see your own characters.
                    <a href="https://quillgen.app" target="_blank" style="color: rgba(100, 150, 255, 0.9);">Get your API key →</a>
                </small>

                <div class="bot-browser-setting-group">
                    <label for="bb-setting-quillgen-key">QuillGen API Key (optional):</label>
                    <input type="password" id="bb-setting-quillgen-key" class="text_pole" 
                           placeholder="sk_..." 
                           value="${settings.quillgenApiKey || ''}"
                           style="width: 100%; font-family: monospace;">
                </div>
            </div>
        </div>

        <div class="bot-browser-detail-actions">
            <button class="bot-browser-settings-save">
                <i class="fa-solid fa-save"></i> Save Settings
            </button>
        </div>
    `;

    document.body.appendChild(settingsOverlay);
    document.body.appendChild(settingsModal);

    // Event listeners - comprehensive click prevention
    const closeButton = settingsModal.querySelector('.bot-browser-detail-close');
    closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        closeSettingsModal();
    });

    settingsOverlay.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        closeSettingsModal();
    });

    // Prevent all events from bubbling through the overlay
    settingsOverlay.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    settingsOverlay.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    // Prevent modal clicks from closing it
    settingsModal.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    settingsModal.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    settingsModal.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    // Range sliders
    const maxRecentSlider = document.getElementById('bb-setting-max-recent');
    const maxRecentValue = document.getElementById('bb-max-recent-value');
    maxRecentSlider.addEventListener('input', (e) => {
        maxRecentValue.textContent = e.target.value;
    });

    const thresholdSlider = document.getElementById('bb-setting-threshold');
    const thresholdValue = document.getElementById('bb-threshold-value');
    thresholdSlider.addEventListener('input', (e) => {
        thresholdValue.textContent = e.target.value + '%';
    });

    const cardsPerPageSlider = document.getElementById('bb-setting-cards-per-page');
    const cardsPerPageValue = document.getElementById('bb-cards-per-page-value');
    cardsPerPageSlider.addEventListener('input', (e) => {
        cardsPerPageValue.textContent = e.target.value;
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

    // Save button
    const saveButton = settingsModal.querySelector('.bot-browser-settings-save');
    saveButton.addEventListener('click', () => {
        settings.recentlyViewedEnabled = document.getElementById('bb-setting-recently-viewed').checked;
        settings.maxRecentlyViewed = parseInt(document.getElementById('bb-setting-max-recent').value);
        settings.persistentSearchEnabled = document.getElementById('bb-setting-persistent-search').checked;
        settings.defaultSortBy = document.getElementById('bb-setting-default-sort').value;
        settings.fuzzySearchThreshold = parseInt(document.getElementById('bb-setting-threshold').value) / 100;
        settings.cardsPerPage = parseInt(document.getElementById('bb-setting-cards-per-page').value);
        settings.blurCards = document.getElementById('bb-setting-blur-cards').checked;
        settings.blurNsfw = document.getElementById('bb-setting-blur-nsfw').checked;
        settings.hideNsfw = document.getElementById('bb-setting-hide-nsfw').checked;

        // Parse tag blocklist from textarea (split by newlines, trim, filter empty)
        const blocklistText = document.getElementById('bb-setting-tag-blocklist').value;
        settings.tagBlocklist = blocklistText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

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
    const modal = document.getElementById('bot-browser-settings-modal');
    const overlay = document.getElementById('bot-browser-settings-overlay');

    if (modal) modal.remove();
    if (overlay) overlay.remove();

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
