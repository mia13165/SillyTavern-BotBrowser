const CHUB_API_BASE = 'https://api.chub.ai';

/**
 * Search Chub cards using the live API (no authentication required)
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with nodes array
 */
export async function searchChubCards(options = {}) {
    const params = new URLSearchParams({
        search: options.search || '',
        first: String(options.limit || 200),
        page: String(options.page || 1),
        sort: options.sort || 'download_count',
        asc: String(options.asc ?? false),
        nsfw: String(options.nsfw ?? true),
        nsfl: String(options.nsfl ?? true),
    });

    // Tag filters
    if (options.tags) {
        params.append('tags', options.tags);
    }
    if (options.excludeTags) {
        params.append('exclude_tags', options.excludeTags);
    }

    // Advanced filters
    if (options.minTokens) params.append('min_tokens', String(options.minTokens));
    if (options.maxTokens) params.append('max_tokens', String(options.maxTokens));
    if (options.username) params.append('username', options.username);
    if (options.maxDaysAgo) params.append('max_days_ago', String(options.maxDaysAgo));
    if (options.minAiRating) params.append('min_ai_rating', String(options.minAiRating));
    if (options.requireExamples) params.append('require_example_dialogues', 'true');
    if (options.requireLore) params.append('require_lore', 'true');
    if (options.requireGreetings) params.append('require_alternate_greetings', 'true');

    const response = await fetch(`${CHUB_API_BASE}/search?${params}`, {
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Chub API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('[Bot Browser] Chub API response data:', data);
    return data;
}

/**
 * Get full character data from Chub Gateway API
 * @param {string} fullPath - Character path (e.g., "username/character-name")
 * @returns {Promise<Object>} Full character data
 */
export async function getChubCharacter(fullPath) {
    // Use the gateway API which has the full definition data
    const response = await fetch(`https://gateway.chub.ai/api/characters/${fullPath}?full=true`, {
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch character ${fullPath}: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Bot Browser] Gateway API response for', fullPath, data);
    return data;
}

/**
 * Transform Chub API search result node to BotBrowser card format
 * @param {Object} node - Chub API node object
 * @returns {Object} Card in BotBrowser format
 */
export function transformChubCard(node) {
    const fullPath = node.fullPath || `${node.name}`;
    const creator = fullPath.includes('/') ? fullPath.split('/')[0] : 'Unknown';

    // Check for NSFW - API uses nsfw_image field, also check topics for "NSFW" tag
    const hasNsfwTag = (node.topics || []).some(t => t.toLowerCase() === 'nsfw');
    const isNsfw = node.nsfw_image || node.nsfw || hasNsfwTag;

    return {
        id: fullPath,
        name: node.name || 'Unnamed',
        creator: creator,
        // avatar_url is the actual PNG card for importing
        avatar_url: `https://avatars.charhub.io/avatars/${fullPath}/chara_card_v2.png`,
        // image_url is the Chub page URL
        image_url: `https://chub.ai/characters/${fullPath}`,
        tags: node.topics || [],
        description: node.tagline || node.description || '',
        desc_preview: node.tagline || '',
        desc_search: (node.tagline || '') + ' ' + (node.description || ''),
        created_at: node.createdAt,
        possibleNsfw: isNsfw,
        // Mark as live Chub card for special handling during import
        isLiveChub: true,
        fullPath: fullPath,
        service: 'chub',
        // Store additional metadata
        starCount: node.starCount || 0,
        downloadCount: node.nChats || 0,
        ratingCount: node.ratingCount || 0,
        nTokens: node.nTokens || 0
    };
}

/**
 * Transform full character data for import
 * @param {Object} charData - Full character data from getChubCharacter (gateway API)
 * @returns {Object} Card data ready for import
 */
export function transformFullChubCharacter(charData) {
    const node = charData.node || charData;
    const definition = node.definition || {};

    // Gateway API stores full character data in node.definition
    // NOTE: Chub's "description" field is changelog/notes, NOT the character description
    // The actual character description (what SillyTavern shows) is in "personality"
    return {
        name: node.name || definition.name || 'Unnamed',
        description: definition.personality || node.personality || '',
        personality: '', // Chub doesn't have a separate personality field
        scenario: definition.scenario || node.scenario || '',
        first_message: definition.first_message || node.first_message || node.firstMessage || '',
        mes_example: definition.example_dialogs || node.example_dialogs || node.exampleDialogs || '',
        creator_notes: definition.creator_notes || node.creator_notes || node.creatorNotes || '',
        system_prompt: definition.system_prompt || node.system_prompt || node.systemPrompt || '',
        post_history_instructions: definition.post_history_instructions || node.post_history_instructions || '',
        alternate_greetings: definition.alternate_greetings || node.alternate_greetings || node.alternateGreetings || [],
        tags: node.topics || [],
        creator: node.fullPath?.split('/')[0] || 'Unknown',
        character_version: node.version || '1.0',
        // Store tagline for preview
        tagline: node.tagline || '',
        // Store website description for display (tagline is the short description shown on Chub)
        website_description: node.tagline || '',
        extensions: {
            chub: {
                full_path: node.fullPath,
                id: node.id
            }
        }
    };
}

// ==================== LOREBOOKS API ====================

const CHUB_GATEWAY_BASE = 'https://gateway.chub.ai';

/**
 * Search Chub lorebooks using the Gateway API
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with nodes array
 */
export async function searchChubLorebooks(options = {}) {
    const params = new URLSearchParams({
        search: options.search || '',
        first: String(options.limit || 48),
        page: String(options.page || 1),
        namespace: 'lorebooks',
        include_forks: 'true',
        nsfw: String(options.nsfw ?? true),
        nsfw_only: 'false',
        nsfl: String(options.nsfl ?? true),
        asc: String(options.asc ?? false),
        sort: options.sort || 'star_count',
        count: 'false'
    });

    // Tag filters
    if (options.tags) {
        params.append('topics', options.tags);
    }
    if (options.excludeTags) {
        params.append('excludetopics', options.excludeTags);
    }

    // Username filter
    if (options.username) {
        params.append('username', options.username);
    }

    console.log('[Bot Browser] Fetching Chub lorebooks:', `${CHUB_GATEWAY_BASE}/search?${params}`);

    const response = await fetch(`${CHUB_GATEWAY_BASE}/search?${params}`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Chub Lorebooks API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('[Bot Browser] Chub Lorebooks API response:', data);
    return data;
}

/**
 * Get full lorebook data from Chub Gateway repository API
 * @param {string} nodeId - The lorebook node ID
 * @returns {Promise<Object|null>} Full lorebook data or null if unavailable
 */
export async function getChubLorebook(nodeId) {
    const nocache = Math.random().toString().substring(2);
    const repoUrl = `${CHUB_GATEWAY_BASE}/api/v4/projects/${nodeId}/repository/files/raw%252Fsillytavern_raw.json/raw?ref=main&response_type=blob&nocache=0.${nocache}`;

    console.log('[Bot Browser] Fetching lorebook data:', repoUrl);

    const response = await fetch(repoUrl, {
        headers: {
            'Accept': 'application/json'
        }
    });

    // 404 or 500 means private/deleted/not processed
    if (response.status === 404 || response.status === 500) {
        console.log(`[Bot Browser] Lorebook unavailable (${response.status})`);
        return null;
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch lorebook ${nodeId}: ${response.status}`);
    }

    const data = await response.json();
    return data;
}

/**
 * Transform Chub lorebook search result node to BotBrowser card format
 * @param {Object} node - Chub API lorebook node object
 * @returns {Object} Card in BotBrowser format
 */
export function transformChubLorebook(node) {
    let fullPath = node.fullPath || `${node.name}`;

    // Strip "lorebooks/" prefix if present (API sometimes includes it)
    if (fullPath.startsWith('lorebooks/')) {
        fullPath = fullPath.substring('lorebooks/'.length);
    }

    // Extract creator from full_path (format: creator/name)
    let creator = 'Unknown';
    if (fullPath) {
        const parts = fullPath.split('/');
        if (parts.length >= 2) {
            creator = parts[0];
        }
    }

    // Check for NSFW
    const hasNsfwTag = (node.topics || []).some(t => t.toLowerCase() === 'nsfw');
    const isNsfw = node.nsfw || hasNsfwTag;

    return {
        id: `https://chub.ai/lorebooks/${fullPath}`,
        name: node.name || 'Unnamed Lorebook',
        creator: creator,
        avatar_url: `https://avatars.charhub.io/avatars/lorebooks/${fullPath}/avatar.webp`,
        image_url: `https://chub.ai/lorebooks/${fullPath}`,
        tags: node.topics || [],
        description: node.tagline || node.description || '',
        desc_preview: node.tagline || '',
        desc_search: (node.tagline || '') + ' ' + (node.description || ''),
        created_at: node.createdAt,
        possibleNsfw: isNsfw,
        // Mark as live Chub lorebook for special handling
        isLiveChub: true,
        isLorebook: true,
        fullPath: fullPath,
        nodeId: node.id,
        service: 'chub_lorebooks',
        // Store additional metadata
        starCount: node.starCount || 0,
        downloadCount: node.nChats || 0
    };
}
