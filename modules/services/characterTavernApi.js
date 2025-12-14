/**
 * Character Tavern API Service
 * Live API for searching and importing characters from character-tavern.com
 */

const CORS_PROXY = 'https://corsproxy.io/?url=';
const CT_API_BASE = 'https://character-tavern.com/api/search/cards';

// API state for pagination
export const characterTavernApiState = {
    page: 1,
    hasMore: true,
    isLoading: false,
    totalHits: 0,
    totalPages: 1,
    lastSearch: '',
    lastSort: ''
};

/**
 * Search Character Tavern for cards
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of transformed cards
 */
export async function searchCharacterTavern(options = {}) {
    const {
        query = '',
        page = 1,
        limit = 30,
        hasLorebook,
        isOC,
        minTokens,
        maxTokens,
        tags = [],
        sort
    } = options;

    characterTavernApiState.isLoading = true;

    try {
        const params = new URLSearchParams();

        if (query) params.set('query', query);
        params.set('limit', limit.toString());
        params.set('page', page.toString());

        if (hasLorebook === true) params.set('hasLorebook', 'true');
        if (isOC === true) params.set('isOC', 'true');
        if (minTokens) params.set('minimum_tokens', minTokens.toString());
        if (maxTokens) params.set('maximum_tokens', maxTokens.toString());
        if (tags.length > 0) params.set('tags', tags.join(','));

        const url = `${CT_API_BASE}?${params}`;
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
        console.log('[Bot Browser] Character Tavern API request:', url);

        const response = await fetch(proxyUrl, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Character Tavern API error: ${response.status}`);
        }

        const data = await response.json();

        // Update pagination state
        characterTavernApiState.page = data.page || 1;
        characterTavernApiState.totalPages = data.totalPages || 1;
        characterTavernApiState.hasMore = (data.page || 1) < (data.totalPages || 1);
        characterTavernApiState.totalHits = data.totalHits || 0;
        characterTavernApiState.lastSearch = query;

        console.log('[Bot Browser] Character Tavern API response:', {
            hits: data.hits?.length || 0,
            totalHits: data.totalHits,
            page: data.page,
            totalPages: data.totalPages
        });

        return (data.hits || []).map(transformCharacterTavernCard);
    } catch (error) {
        console.error('[Bot Browser] Character Tavern API error:', error);
        throw error;
    } finally {
        characterTavernApiState.isLoading = false;
    }
}

/**
 * Transform a Character Tavern card to BotBrowser format
 * @param {Object} node - Raw card data from API
 * @returns {Object} Transformed card
 */
export function transformCharacterTavernCard(node) {
    // Build image URL from cards subdomain (correct CT image format)
    const imageUrl = node.path
        ? `https://cards.character-tavern.com/${node.path}.png`
        : null;

    // Use characterDefinition as the real description, tagline is just website meta
    const description = node.characterDefinition || '';
    const descPreview = description ? description.substring(0, 300) : (node.tagline || '');

    return {
        id: node.id,
        name: node.name || node.inChatName || 'Unknown',
        creator: node.author || 'Unknown',
        avatar_url: imageUrl,
        image_url: imageUrl,
        tags: node.tags || [],
        // Use actual character definition as description
        description: description,
        desc_preview: descPreview,
        desc_search: description,
        // Character fields for detail modal display
        personality: node.characterPersonality || '',
        scenario: node.characterScenario || '',
        first_message: node.characterFirstMessage || '',
        mes_example: node.characterExampleMessages || '',
        alternate_greetings: node.alternativeFirstMessage || [],
        post_history_instructions: node.characterPostHistoryPrompt || '',
        system_prompt: node.characterPostHistoryPrompt || '',
        creator_notes: node.tagline || '',
        // Metadata
        created_at: node.createdAt ? new Date(node.createdAt * 1000).toISOString() : null,
        updated_at: node.lastUpdateAt ? new Date(node.lastUpdateAt * 1000).toISOString() : null,
        nTokens: node.totalTokens || 0,
        possibleNsfw: node.isNSFW || false,
        service: 'character_tavern',
        sourceService: 'character_tavern_live',
        isCharacterTavern: true,
        hasLorebook: node.hasLorebook || false,
        isOC: node.isOC || false,
        views: node.views || 0,
        downloads: node.downloads || 0,
        likes: node.likes || 0,
        dislikes: node.dislikes || 0,
        messages: node.messages || 0,
        fullPath: node.path,
        // Store full data for import
        _rawData: {
            characterDefinition: node.characterDefinition || '',
            characterPersonality: node.characterPersonality || '',
            characterScenario: node.characterScenario || '',
            characterFirstMessage: node.characterFirstMessage || '',
            characterExampleMessages: node.characterExampleMessages || '',
            characterPostHistoryPrompt: node.characterPostHistoryPrompt || '',
            alternativeFirstMessage: node.alternativeFirstMessage || [],
            inChatName: node.inChatName || ''
        }
    };
}

/**
 * Transform Character Tavern card to SillyTavern import format
 * @param {Object} card - BotBrowser card format
 * @returns {Object} SillyTavern character format
 */
export function transformFullCharacterTavernCard(card) {
    const raw = card._rawData || {};

    return {
        name: card.name,
        description: raw.characterDefinition || '',
        personality: raw.characterPersonality || '',
        scenario: raw.characterScenario || '',
        first_mes: raw.characterFirstMessage || '',
        mes_example: raw.characterExampleMessages || '',
        system_prompt: raw.characterPostHistoryPrompt || '',
        post_history_instructions: raw.characterPostHistoryPrompt || '',
        alternate_greetings: raw.alternativeFirstMessage || [],
        creator: card.creator,
        creator_notes: card.description,
        tags: card.tags || [],
        character_version: '',
        extensions: {
            talkativeness: '0.5',
            fav: false,
            world: '',
            depth_prompt: {
                prompt: '',
                depth: 4
            }
        },
        // Additional metadata
        character_book: card.hasLorebook ? {} : undefined
    };
}

/**
 * Reset pagination state
 */
export function resetCharacterTavernState() {
    characterTavernApiState.page = 1;
    characterTavernApiState.hasMore = true;
    characterTavernApiState.isLoading = false;
    characterTavernApiState.totalHits = 0;
    characterTavernApiState.totalPages = 1;
    characterTavernApiState.lastSearch = '';
    characterTavernApiState.lastSort = '';
}
