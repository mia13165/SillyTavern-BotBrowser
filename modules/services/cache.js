import { default_avatar } from '../../../../../../script.js';
import { extension_settings } from '../../../../../extensions.js';

const baseUrl = 'https://raw.githubusercontent.com/mia13165/updated_cards/refs/heads/main';
const QUILLGEN_API_URL = 'https://quillgen.app/v1/public/api/browse';

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

export async function loadServiceIndex(serviceName) {
    // Handle QuillGen specially - it uses API-based loading
    if (serviceName === 'quillgen') {
        return loadQuillgenIndex();
    }

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
 * Load characters from QuillGen API.
 * Without API key: returns public characters only.
 * With API key: returns public characters + user's own characters (marked with is_own).
 */
export async function loadQuillgenIndex() {
    const settings = extension_settings?.['BotBrowser'] || {};
    const apiKey = settings.quillgenApiKey;

    // Return cached data if available
    if (loadedData.serviceIndexes['quillgen'] && loadedData.serviceIndexes['quillgen'].length > 0) {
        return loadedData.serviceIndexes['quillgen'];
    }

    try {
        const headers = { 'Accept': 'application/json' };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${QUILLGEN_API_URL}/characters?limit=500`, { headers });

        if (response.status === 401) {
            // Only show invalid key error if user actually provided a key
            if (apiKey) {
                console.error('[Bot Browser] QuillGen API key is invalid');
                toastr.error('QuillGen API key is invalid. Check your settings.', 'Authentication Failed');
            } else {
                console.warn('[Bot Browser] QuillGen requires authentication for this request');
            }
            loadedData.serviceIndexes['quillgen'] = [];
            return [];
        }

        if (!response.ok) {
            console.error(`[Bot Browser] QuillGen API error: ${response.status}`);
            toastr.error(`Failed to load QuillGen characters: ${response.statusText}`);
            loadedData.serviceIndexes['quillgen'] = [];
            return [];
        }

        const data = await response.json();
        const cards = data.cards || [];

        const appendApiKey = (url) => {
            if (!apiKey || !url) return url;
            const separator = url.includes('?') ? '&' : '?';
            return `${url}${separator}key=${encodeURIComponent(apiKey)}`;
        };

        // Map QuillGen cards to BotBrowser format
        const mappedCards = cards.map(card => ({
            ...card,
            avatar_url: appendApiKey(card.avatar_url),
            image_url: appendApiKey(card.image_url),
            service: 'quillgen',
            chunk: null // QuillGen cards don't use chunks - they're fetched directly
        }));

        const ownCount = mappedCards.filter(c => c.is_own).length;
        const publicCount = mappedCards.length - ownCount;
        console.log(`[Bot Browser] Loaded ${mappedCards.length} cards from QuillGen (${publicCount} public, ${ownCount} own)`);

        if (mappedCards.length === 0) {
            const msg = apiKey 
                ? 'No characters found. Create some on QuillGen.app!'
                : 'No public characters available yet.';
            toastr.info(msg, 'QuillGen');
        }

        loadedData.serviceIndexes['quillgen'] = mappedCards;

        return mappedCards;
    } catch (error) {
        console.error('[Bot Browser] Error loading QuillGen index:', error);
        toastr.error('Failed to connect to QuillGen');
        loadedData.serviceIndexes['quillgen'] = [];
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

        const allServices = ['character_tavern', 'catbox', 'webring', 'chub', 'anchorhold', 'risuai_realm', 'nyai_me', 'desuarchive', 'mlpchag'];
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
