// Wyvern Chat API Service
// API: https://api.wyvern.chat/exploreSearch/characters
// Lorebooks: https://api.wyvern.chat/exploreSearch/lorebooks

const CORS_PROXY = 'https://corsproxy.io/?url=';
const WYVERN_API_BASE = 'https://api.wyvern.chat/exploreSearch';

// API state for pagination
export let wyvernApiState = {
    page: 1,
    hasMore: true,
    isLoading: false,
    totalHits: 0,
    lastSearch: '',
    lastSort: 'votes',
    lastOrder: 'DESC'
};

export let wyvernLorebooksApiState = {
    page: 1,
    hasMore: true,
    isLoading: false,
    totalHits: 0,
    lastSearch: '',
    lastSort: 'created_at',
    lastOrder: 'DESC'
};

export function resetWyvernApiState() {
    wyvernApiState = {
        page: 1,
        hasMore: true,
        isLoading: false,
        totalHits: 0,
        lastSearch: '',
        lastSort: 'votes',
        lastOrder: 'DESC'
    };
}

export function resetWyvernLorebooksApiState() {
    wyvernLorebooksApiState = {
        page: 1,
        hasMore: true,
        isLoading: false,
        totalHits: 0,
        lastSearch: '',
        lastSort: 'created_at',
        lastOrder: 'DESC'
    };
}

export function getWyvernApiState() {
    return wyvernApiState;
}

export function getWyvernLorebooksApiState() {
    return wyvernLorebooksApiState;
}

/**
 * Search Wyvern Chat characters
 * @param {Object} options - Search options
 * @param {string} options.search - Search query
 * @param {number} options.page - Page number (1-indexed)
 * @param {number} options.limit - Results per page
 * @param {string} options.sort - Sort field: created_at, popular, nsfw-popular, votes, name
 * @param {string} options.order - Sort order: ASC or DESC
 * @param {string[]} options.tags - Tags to filter by
 * @param {string} options.rating - Rating filter: none, mature, explicit, or omit for all
 * @param {boolean} options.hideNsfw - If true, set rating=none
 */
export async function searchWyvernCharacters(options = {}) {
    const {
        search = '',
        page = 1,
        limit = 20,
        sort = 'votes',
        order = 'DESC',
        tags = [],
        rating,
        hideNsfw = false
    } = options;

    wyvernApiState.isLoading = true;

    try {
        const params = new URLSearchParams();
        if (search) params.set('q', search);
        params.set('page', page.toString());
        params.set('limit', limit.toString());
        params.set('sort', sort);
        params.set('order', order);

        if (tags.length > 0) {
            params.set('tags', tags.join(','));
        }

        // Rating filter: none = SFW only, omit = all content
        if (hideNsfw) {
            params.set('rating', 'none');
        } else if (rating && rating !== 'all') {
            params.set('rating', rating);
        }

        const url = `${WYVERN_API_BASE}/characters?${params.toString()}`;
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
        console.log('[Bot Browser] Wyvern API request:', url);

        const response = await fetch(proxyUrl, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`Wyvern API error: ${response.status}`);
        }

        const data = await response.json();

        // Update state
        wyvernApiState.page = data.page;
        wyvernApiState.hasMore = data.hasMore;
        wyvernApiState.totalHits = data.total;
        wyvernApiState.lastSearch = search;
        wyvernApiState.lastSort = sort;
        wyvernApiState.lastOrder = order;
        wyvernApiState.isLoading = false;

        console.log(`[Bot Browser] Wyvern API returned ${data.results?.length || 0} characters (page ${data.page}/${data.totalPages}, total: ${data.total})`);

        return {
            results: data.results || [],
            total: data.total,
            page: data.page,
            totalPages: data.totalPages,
            hasMore: data.hasMore
        };
    } catch (error) {
        wyvernApiState.isLoading = false;
        console.error('[Bot Browser] Wyvern API error:', error);
        throw error;
    }
}

/**
 * Search Wyvern Chat lorebooks
 */
export async function searchWyvernLorebooks(options = {}) {
    const {
        search = '',
        page = 1,
        limit = 20,
        sort = 'created_at',
        order = 'DESC',
        tags = [],
        rating,
        hideNsfw = false
    } = options;

    wyvernLorebooksApiState.isLoading = true;

    try {
        const params = new URLSearchParams();
        if (search) params.set('q', search);
        params.set('page', page.toString());
        params.set('limit', limit.toString());
        params.set('sort', sort);
        params.set('order', order);

        if (tags.length > 0) {
            params.set('tags', tags.join(','));
        }

        if (hideNsfw) {
            params.set('rating', 'none');
        } else if (rating && rating !== 'all') {
            params.set('rating', rating);
        }

        const url = `${WYVERN_API_BASE}/lorebooks?${params.toString()}`;
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
        console.log('[Bot Browser] Wyvern Lorebooks API request:', url);

        const response = await fetch(proxyUrl, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`Wyvern Lorebooks API error: ${response.status}`);
        }

        const data = await response.json();

        wyvernLorebooksApiState.page = data.page;
        wyvernLorebooksApiState.hasMore = data.hasMore;
        wyvernLorebooksApiState.totalHits = data.total;
        wyvernLorebooksApiState.lastSearch = search;
        wyvernLorebooksApiState.lastSort = sort;
        wyvernLorebooksApiState.lastOrder = order;
        wyvernLorebooksApiState.isLoading = false;

        console.log(`[Bot Browser] Wyvern Lorebooks API returned ${data.results?.length || 0} lorebooks (page ${data.page}/${data.totalPages})`);

        return {
            results: data.results || [],
            total: data.total,
            page: data.page,
            totalPages: data.totalPages,
            hasMore: data.hasMore
        };
    } catch (error) {
        wyvernLorebooksApiState.isLoading = false;
        console.error('[Bot Browser] Wyvern Lorebooks API error:', error);
        throw error;
    }
}

/**
 * Transform Wyvern character to BotBrowser card format
 *
 * ACTUAL Wyvern API fields (verified from real API response):
 * - name: character name
 * - description: character definition/personality (NOT first message!)
 * - first_mes: the actual first message/greeting
 * - scenario: scenario text
 * - personality: personality (usually empty, info in description)
 * - mes_example: example messages (usually empty)
 * - character_note: additional notes (usually empty)
 * - creator_notes: creator's notes about the character
 * - post_history_instructions: post history instructions
 * - pre_history_instructions: system prompt
 * - alternate_greetings: array of alternate greetings
 * - tagline: short tagline for display
 * - shared_info: shared info/creator notes
 * - tags, rating, avatar, creator, etc.
 */
export function transformWyvernCard(node) {
    const creatorName = node.creator?.displayName || node.creator?.vanityUrl || 'Unknown';
    const creatorUrl = node.creator?.vanityUrl || node.creator?._id;

    // Determine NSFW status from rating
    const isNsfw = node.rating === 'mature' || node.rating === 'explicit';

    // Wyvern API field mapping (verified from actual API response):
    // - node.description = FULL character definition with {{char}} macros, backstory (ST description)
    // - node.personality = SHORT trait list like "tsundere, grumpy, lonely" (ST personality)
    // - node.tagline / node.creator_notes = Short display text for UI preview
    // - node.character_note = Additional character info
    // - node.visual_description = Physical appearance
    const charDescription = node.description || '';      // FULL character definition (ST description)
    const personality = node.personality || '';          // Short trait list (ST personality)
    const firstMessage = node.first_mes || '';           // First message/greeting
    const scenario = node.scenario || '';                // Scenario
    const mesExample = node.mes_example || '';           // Example messages
    const characterNote = node.character_note || '';     // Additional notes
    const creatorNotes = node.creator_notes || node.shared_info || '';
    const systemPrompt = node.pre_history_instructions || '';
    const postHistoryInstructions = node.post_history_instructions || '';

    // Debug logging
    console.log(`[Bot Browser] transformWyvernCard for "${node.name}":`, {
        'description (char def)': charDescription?.substring(0, 80),
        'first_mes': firstMessage?.substring(0, 80),
        'scenario': scenario?.substring(0, 80),
        'personality': personality?.substring(0, 50),
        'mes_example': mesExample?.substring(0, 50),
        'character_note': characterNote?.substring(0, 50),
        'creator_notes': creatorNotes?.substring(0, 50),
        'alternate_greetings': node.alternate_greetings?.length || 0,
    });

    return {
        id: node.id || node._id,
        name: node.name || node.chat_name || 'Unknown',
        creator: creatorName,
        creatorUrl: creatorUrl,
        avatar_url: node.avatar,
        image_url: node.avatar,
        background_url: node.backgroundURL || null,
        tags: node.tags || [],
        // Match other services: description = full character definition
        description: charDescription,
        // Short preview text for card grid thumbnails
        website_description: node.tagline || charDescription.substring(0, 300) || '',
        tagline: node.tagline || '',
        // Character card fields (direct mapping from Wyvern API)
        personality: personality,
        scenario: scenario,
        first_message: firstMessage,
        mes_example: mesExample,
        character_note: characterNote,
        alternate_greetings: node.alternate_greetings || [],
        creator_notes: creatorNotes,
        system_prompt: systemPrompt,
        post_history_instructions: postHistoryInstructions,
        // Metadata
        created_at: node.created_at,
        updated_at: node.updated_at,
        rating: node.rating,
        possibleNsfw: isNsfw,
        chat_name: node.chat_name || node.name,
        // Stats
        views: node.statistics_record?.views || node.entity_statistics?.total_views || 0,
        likes: node.statistics_record?.likes || node.entity_statistics?.total_likes || 0,
        messages: node.statistics_record?.messages || node.entity_statistics?.total_messages || 0,
        // Service identification
        service: 'wyvern',
        sourceService: 'wyvern_live',
        isWyvern: true,
        // Store raw data for import - preserves all Wyvern fields
        _rawData: {
            name: node.name || node.chat_name || '',
            // Character definition goes to ST 'description'
            description: charDescription,
            // First message
            first_mes: firstMessage,
            // Scenario
            scenario: scenario,
            // Personality
            personality: personality,
            // Example messages
            mes_example: mesExample,
            // Character note
            character_note: characterNote,
            // Alternate greetings
            alternate_greetings: node.alternate_greetings || [],
            // Creator notes
            creator_notes: creatorNotes,
            // System prompt
            system_prompt: systemPrompt,
            // Post history instructions
            post_history_instructions: postHistoryInstructions,
            // Other metadata
            tags: node.tags || [],
            creator: creatorName,
            chat_name: node.chat_name || node.name
        }
    };
}

/**
 * Transform Wyvern lorebook to BotBrowser format
 */
export function transformWyvernLorebook(node) {
    const creatorName = node.creator?.displayName || node.creator?.vanityUrl || 'Unknown';
    const fullDescription = node.description || '';

    return {
        id: node.id || node._id,
        name: node.name,
        creator: creatorName,
        avatar_url: node.photoURL,
        image_url: node.photoURL,
        tags: node.tags || [],
        // Match other services: description = full description
        description: fullDescription,
        // Short preview text for card grid thumbnails
        website_description: node.tagline || fullDescription.substring(0, 300) || '',
        created_at: node.created_at,
        updated_at: node.updated_at,
        rating: node.rating,
        possibleNsfw: node.rating === 'mature' || node.rating === 'explicit',
        // Lorebook specific
        entries: node.entries || [],
        scan_depth: node.scan_depth,
        token_budget: node.token_budget,
        recursive_scanning: node.recursive_scanning,
        // Service identification
        service: 'wyvern_lorebooks',
        sourceService: 'wyvern_lorebooks_live',
        isWyvern: true,
        isLorebook: true,
        // Store raw data for import
        _rawData: node
    };
}

/**
 * Load initial Wyvern characters
 */
export async function loadWyvernCharacters(options = {}) {
    resetWyvernApiState();
    const result = await searchWyvernCharacters({
        page: 1,
        limit: 40,
        sort: options.sort || 'votes',
        order: options.order || 'DESC',
        search: options.search || '',
        tags: options.tags || [],
        rating: options.rating,
        hideNsfw: options.hideNsfw || false
    });

    return result.results.map(transformWyvernCard);
}

/**
 * Load more Wyvern characters (next page)
 */
export async function loadMoreWyvernCharacters(options = {}) {
    if (!wyvernApiState.hasMore || wyvernApiState.isLoading) {
        return [];
    }

    const result = await searchWyvernCharacters({
        page: wyvernApiState.page + 1,
        limit: 40,
        sort: options.sort || wyvernApiState.lastSort,
        order: options.order || wyvernApiState.lastOrder,
        search: options.search ?? wyvernApiState.lastSearch,
        tags: options.tags || [],
        rating: options.rating,
        hideNsfw: options.hideNsfw || false
    });

    return result.results.map(transformWyvernCard);
}

/**
 * Load initial Wyvern lorebooks
 */
export async function loadWyvernLorebooks(options = {}) {
    resetWyvernLorebooksApiState();
    const result = await searchWyvernLorebooks({
        page: 1,
        limit: 20,
        sort: options.sort || 'created_at',
        order: options.order || 'DESC',
        search: options.search || '',
        tags: options.tags || [],
        rating: options.rating,
        hideNsfw: options.hideNsfw || false
    });

    return result.results.map(transformWyvernLorebook);
}

/**
 * Load more Wyvern lorebooks (next page)
 */
export async function loadMoreWyvernLorebooks(options = {}) {
    if (!wyvernLorebooksApiState.hasMore || wyvernLorebooksApiState.isLoading) {
        return [];
    }

    const result = await searchWyvernLorebooks({
        page: wyvernLorebooksApiState.page + 1,
        limit: 20,
        sort: options.sort || wyvernLorebooksApiState.lastSort,
        order: options.order || wyvernLorebooksApiState.lastOrder,
        search: options.search ?? wyvernLorebooksApiState.lastSearch,
        tags: options.tags || [],
        rating: options.rating,
        hideNsfw: options.hideNsfw || false
    });

    return result.results.map(transformWyvernLorebook);
}
