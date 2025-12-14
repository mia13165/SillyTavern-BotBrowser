// MLPChag Live API Service
// Fetches character data from https://mlpchag.neocities.org/mares.json

const MLPCHAG_API_URL = 'https://mlpchag.neocities.org/mares.json';

// Cache for API data
let cachedData = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// API state for tracking
export const mlpchagApiState = {
    isLoading: false,
    lastLoad: null,
    totalCards: 0
};

/**
 * Load all MLPChag cards from live API
 * @returns {Promise<Array>} Array of transformed card objects
 */
export async function loadMlpchagLive() {
    // Check cache
    if (cachedData && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL)) {
        console.log(`[Bot Browser] Using cached MLPChag data (${cachedData.length} cards)`);
        return cachedData;
    }

    if (mlpchagApiState.isLoading) {
        console.log('[Bot Browser] MLPChag API request already in progress');
        // Wait for existing request
        while (mlpchagApiState.isLoading) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return cachedData || [];
    }

    mlpchagApiState.isLoading = true;

    try {
        console.log('[Bot Browser] Fetching MLPChag live data...');

        const response = await fetch(MLPCHAG_API_URL);
        if (!response.ok) {
            throw new Error(`MLPChag API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Transform object entries to card array
        // Keys are "{author}/{filename}.png", values are character data
        cachedData = Object.entries(data).map(([key, value]) =>
            transformMlpchagCard(key, value)
        );

        cacheTimestamp = Date.now();
        mlpchagApiState.lastLoad = new Date().toISOString();
        mlpchagApiState.totalCards = cachedData.length;

        console.log(`[Bot Browser] MLPChag loaded ${cachedData.length} cards`);

        return cachedData;
    } catch (error) {
        console.error('[Bot Browser] MLPChag API error:', error);
        throw error;
    } finally {
        mlpchagApiState.isLoading = false;
    }
}

/**
 * Transform MLPChag API data to standard card format
 * @param {string} key - The key from mares.json (e.g., "author/filename.png")
 * @param {object} node - The character data object
 * @returns {object} Transformed card object
 */
export function transformMlpchagCard(key, node) {
    // Parse author from key (format: "author/filename.png")
    const parts = key.split('/');
    const author = parts.length > 1 ? parts[0] : 'Unknown';
    const filename = parts.length > 1 ? parts.slice(1).join('/') : key;

    // Build image URL
    const imageUrl = `https://mlpchag.neocities.org/cards/${key}`;

    // Parse dates safely
    let createdAt = null;
    let updatedAt = null;

    if (node.datecreate) {
        try {
            const timestamp = typeof node.datecreate === 'number' ? node.datecreate * 1000 : Date.parse(node.datecreate);
            if (!isNaN(timestamp)) {
                createdAt = new Date(timestamp).toISOString();
            }
        } catch (e) {
            // Invalid date, leave as null
        }
    }
    if (node.dateupdate) {
        try {
            const timestamp = typeof node.dateupdate === 'number' ? node.dateupdate * 1000 : Date.parse(node.dateupdate);
            if (!isNaN(timestamp)) {
                updatedAt = new Date(timestamp).toISOString();
            }
        } catch (e) {
            // Invalid date, leave as null
        }
    }

    // Extract tags from various fields
    const tags = [];
    if (node.tags && Array.isArray(node.tags)) {
        tags.push(...node.tags);
    }

    // Calculate token count estimate if available
    let tokenCount = null;
    if (node.tokens) {
        tokenCount = node.tokens;
    }

    return {
        id: `mlpchag_${key}`,
        name: node.name || filename.replace(/\.png$/i, ''),
        creator: node.author || author,
        avatar_url: imageUrl,
        image_url: imageUrl,
        tags: tags,
        description: node.description || '',
        desc_preview: node.description ? node.description.substring(0, 200) : '',
        desc_search: node.description || '',
        created_at: createdAt,
        updated_at: updatedAt,
        nTokens: tokenCount,
        scenario: node.scenario || '',
        personality: node.personality || '',
        first_message: node.greetings?.[0] || node.first_mes || '',
        alternate_greetings: node.greetings?.slice(1) || node.alternate_greetings || [],
        examples: node.examples || node.mes_example || '',
        creator_notes: node.creator_notes || '',
        system_prompt: node.system_prompt || '',
        post_history_instructions: node.post_history_instructions || '',
        possibleNsfw: node.nsfw === true,
        service: 'mlpchag',
        sourceService: 'mlpchag_live',
        isMlpchag: true,
        hasLorebook: !!(node.character_book || node.lorebook),
        // Store raw data for import
        _rawData: node,
        _rawKey: key
    };
}

/**
 * Get full character data for import
 * @param {object} card - The card object with _rawData
 * @returns {object} Full character data in SillyTavern format
 */
export function getFullMlpchagCharacter(card) {
    const raw = card._rawData || {};

    return {
        name: card.name,
        description: raw.description || '',
        personality: raw.personality || '',
        scenario: raw.scenario || '',
        first_mes: raw.greetings?.[0] || raw.first_mes || '',
        mes_example: raw.examples || raw.mes_example || '',
        creator_notes: raw.creator_notes || '',
        system_prompt: raw.system_prompt || '',
        post_history_instructions: raw.post_history_instructions || '',
        alternate_greetings: raw.greetings?.slice(1) || raw.alternate_greetings || [],
        tags: card.tags || [],
        creator: card.creator,
        character_version: raw.character_version || '',
        extensions: raw.extensions || {},
        character_book: raw.character_book || raw.lorebook || undefined
    };
}

/**
 * Clear the MLPChag cache
 */
export function clearMlpchagCache() {
    cachedData = null;
    cacheTimestamp = null;
    mlpchagApiState.totalCards = 0;
    console.log('[Bot Browser] MLPChag cache cleared');
}

/**
 * Get current API state
 * @returns {object} Current API state
 */
export function getMlpchagApiState() {
    return { ...mlpchagApiState };
}

/**
 * Reset API state
 */
export function resetMlpchagState() {
    mlpchagApiState.isLoading = false;
    mlpchagApiState.lastLoad = null;
    mlpchagApiState.totalCards = 0;
}
