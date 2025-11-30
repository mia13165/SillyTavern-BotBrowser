const JANNY_SEARCH_URL = 'https://search.jannyai.com/multi-search';
const JANNY_FALLBACK_TOKEN = '88a6463b66e04fb07ba87ee3db06af337f492ce511d93df6e2d2968cb2ff2b30';
const JANNY_IMAGE_BASE = 'https://image.jannyai.com/bot-avatars/';
const CORS_PROXY = 'https://corsproxy.io/?url=';

// Cached token state
let cachedToken = null;
let tokenFetchPromise = null;

/**
 * Fetch the MeiliSearch API token from JannyAI's client config
 * @returns {Promise<string>} The API token
 */
async function getSearchToken() {
    // Return cached token if available
    if (cachedToken) {
        return cachedToken;
    }

    // If already fetching, wait for that promise
    if (tokenFetchPromise) {
        return tokenFetchPromise;
    }

    tokenFetchPromise = (async () => {
        try {
            // First fetch the search page to get the config file name
            const searchPageUrl = `${CORS_PROXY}${encodeURIComponent('https://jannyai.com/characters/search')}`;
            const pageResponse = await fetch(searchPageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            if (!pageResponse.ok) {
                throw new Error(`Failed to fetch search page: ${pageResponse.status}`);
            }

            const pageHtml = await pageResponse.text();

            // Try to find client-config or SearchPage JS file
            let configMatch = pageHtml.match(/client-config\.[a-zA-Z0-9_-]+\.js/);
            let configPath;

            if (configMatch) {
                const configFilename = configMatch[0];
                configPath = '/_astro/' + configFilename;
            } else {
                // Fallback: find SearchPage.js which imports client-config
                const searchPageMatch = pageHtml.match(/SearchPage\.[a-zA-Z0-9_-]+\.js/);
                if (!searchPageMatch) {
                    // Debug: log what scripts we found
                    const allScripts = pageHtml.match(/\/_astro\/[^"'\s]+\.js/g) || [];
                    console.log('[Bot Browser] Available scripts:', allScripts.slice(0, 10));
                    throw new Error('Could not find client-config or SearchPage JS file');
                }

                // Fetch SearchPage.js first to find the client-config import
                const searchPageUrl = `${CORS_PROXY}${encodeURIComponent('https://jannyai.com/_astro/' + searchPageMatch[0])}`;
                const searchPageResponse = await fetch(searchPageUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                if (searchPageResponse.ok) {
                    const searchPageJs = await searchPageResponse.text();
                    // Look for client-config import
                    const importMatch = searchPageJs.match(/client-config\.[a-zA-Z0-9_-]+\.js/);
                    if (importMatch) {
                        configPath = '/_astro/' + importMatch[0];
                    }
                }

                if (!configPath) {
                    throw new Error('Could not find client-config reference');
                }
            }

            // Fetch the config JS file
            const configUrl = `${CORS_PROXY}${encodeURIComponent('https://jannyai.com' + configPath)}`;
            const configResponse = await fetch(configUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            if (!configResponse.ok) {
                throw new Error(`Failed to fetch config: ${configResponse.status}`);
            }

            const configJs = await configResponse.text();

            // Extract the 64-char hex token (it's the MeiliSearch public search key)
            const tokenMatch = configJs.match(/"([a-f0-9]{64})"/);
            if (!tokenMatch) {
                throw new Error('Could not find token in config');
            }

            cachedToken = tokenMatch[1];
            console.log('[Bot Browser] Fetched fresh JannyAI search token');
            return cachedToken;
        } catch (error) {
            console.warn('[Bot Browser] Failed to fetch JannyAI token, using fallback:', error.message);
            cachedToken = JANNY_FALLBACK_TOKEN;
            return cachedToken;
        } finally {
            tokenFetchPromise = null;
        }
    })();

    return tokenFetchPromise;
}

// JannyAI tag ID to name mapping
export const JANNYAI_TAGS = {
    1: 'Male', 2: 'Female', 3: 'Non-binary', 4: 'Celebrity', 5: 'OC',
    6: 'Fictional', 7: 'Real', 8: 'Game', 9: 'Anime', 10: 'Historical',
    11: 'Royalty', 12: 'Detective', 13: 'Hero', 14: 'Villain', 15: 'Magical',
    16: 'Non-human', 17: 'Monster', 18: 'Monster Girl', 19: 'Alien', 20: 'Robot',
    21: 'Politics', 22: 'Vampire', 23: 'Giant', 24: 'OpenAI', 25: 'Elf',
    26: 'Multiple', 27: 'VTuber', 28: 'Dominant', 29: 'Submissive', 30: 'Scenario',
    31: 'Pokemon', 32: 'Assistant', 34: 'Non-English', 36: 'Philosophy',
    38: 'RPG', 39: 'Religion', 41: 'Books', 42: 'AnyPOV', 43: 'Angst',
    44: 'Demi-Human', 45: 'Enemies to Lovers', 46: 'Smut', 47: 'MLM',
    48: 'WLW', 49: 'Action', 50: 'Romance', 51: 'Horror', 52: 'Slice of Life',
    53: 'Fantasy', 54: 'Drama', 55: 'Comedy', 56: 'Mystery', 57: 'Sci-Fi',
    59: 'Yandere', 60: 'Furry', 61: 'Movies/TV'
};

// Reverse mapping for filtering by tag name
export const JANNYAI_TAG_IDS = Object.fromEntries(
    Object.entries(JANNYAI_TAGS).map(([id, name]) => [name.toLowerCase(), parseInt(id)])
);

/**
 * Search JannyAI characters using MeiliSearch API
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
export async function searchJannyCharacters(options = {}) {
    const {
        search = '',
        page = 1,
        limit = 40,
        sort = 'createdAtStamp:desc',
        nsfw = true,
        minTokens = 29,
        maxTokens = 4101,
        tagIds = []
    } = options;

    // Build filter array
    const filters = [`totalToken <= ${maxTokens} AND totalToken >= ${minTokens}`];

    // Add tag filters if provided
    if (tagIds.length > 0) {
        const tagFilter = tagIds.map(id => `tagIds = ${id}`).join(' OR ');
        filters.push(`(${tagFilter})`);
    }

    const requestBody = {
        queries: [{
            indexUid: 'janny-characters',
            q: search,
            facets: ['isLowQuality', 'tagIds', 'totalToken'],
            attributesToCrop: ['description:300'],
            cropMarker: '...',
            filter: filters,
            attributesToHighlight: ['name', 'description'],
            highlightPreTag: '__ais-highlight__',
            highlightPostTag: '__/ais-highlight__',
            hitsPerPage: limit,
            page: page,
            sort: sort ? [sort] : undefined
        }]
    };

    console.log('[Bot Browser] JannyAI search request:', requestBody);

    const response = await fetch(JANNY_SEARCH_URL, {
        method: 'POST',
        headers: {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getSearchToken()}`,
            'Origin': 'https://jannyai.com',
            'Referer': 'https://jannyai.com/',
            'x-meilisearch-client': 'Meilisearch instant-meilisearch (v0.19.0) ; Meilisearch JavaScript (v0.41.0)'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`JannyAI search error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('[Bot Browser] JannyAI search response:', data);
    return data;
}

/**
 * Fetch character details from JannyAI via CORS proxy
 * @param {string} characterId - Character UUID
 * @param {string} slug - Character slug (name-slugified)
 * @returns {Promise<Object>} Character data
 */
export async function fetchJannyCharacterDetails(characterId, slug) {
    const characterUrl = `https://jannyai.com/characters/${characterId}_${slug}`;
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(characterUrl)}`;

    console.log('[Bot Browser] Fetching JannyAI character:', proxyUrl);

    const response = await fetch(proxyUrl, {
        headers: {
            'Accept': 'text/html',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch JannyAI character: ${response.status}`);
    }

    const html = await response.text();
    return parseAstroCharacterProps(html);
}

/**
 * Parse Astro island props from HTML to extract character data
 * @param {string} html - HTML content from JannyAI page
 * @returns {Object} Character data
 */
function parseAstroCharacterProps(html) {
    // Find the astro-island with CharacterButtons which contains full character data
    const astroMatch = html.match(/astro-island[^>]*component-export="CharacterButtons"[^>]*props="([^"]+)"/);

    if (!astroMatch) {
        throw new Error('Could not find character data in JannyAI page');
    }

    // Decode HTML entities in the props string
    const propsEncoded = astroMatch[1];
    const propsDecoded = propsEncoded
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");

    let propsJson;
    try {
        propsJson = JSON.parse(propsDecoded);
    } catch (e) {
        console.error('[Bot Browser] Failed to parse JannyAI props:', e);
        throw new Error('Failed to parse character data from JannyAI page');
    }

    // Astro serializes data in format: [type, value] where type 0 = primitive, 1 = array
    const character = decodeAstroValue(propsJson.character);
    const imageUrl = decodeAstroValue(propsJson.imageUrl);

    return { character, imageUrl };
}

/**
 * Decode Astro's serialized value format
 * @param {any} value - Astro serialized value [type, data]
 * @returns {any} Decoded value
 */
function decodeAstroValue(value) {
    if (!Array.isArray(value)) return value;

    const [type, data] = value;

    if (type === 0) {
        // Primitive value or object
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            // Recursively decode object properties
            const decoded = {};
            for (const [key, val] of Object.entries(data)) {
                decoded[key] = decodeAstroValue(val);
            }
            return decoded;
        }
        return data;
    } else if (type === 1) {
        // Array - decode each element
        return data.map(item => decodeAstroValue(item));
    }

    return data;
}

/**
 * Transform JannyAI search result to BotBrowser card format
 * @param {Object} hit - MeiliSearch hit object
 * @returns {Object} Card in BotBrowser format
 */
export function transformJannyCard(hit) {
    // Map tag IDs to tag names
    const tags = (hit.tagIds || []).map(id => JANNYAI_TAGS[id] || `Tag ${id}`);

    // Add NSFW tag if applicable
    if (hit.isNsfw && !tags.includes('NSFW')) {
        tags.unshift('NSFW');
    }

    // Generate slug from name
    const slug = generateSlug(hit.name);

    // The description from search is the short website description/tagline
    const websiteDesc = stripHtml(hit.description) || '';

    return {
        id: hit.id,
        name: hit.name || 'Unnamed',
        creator: '', // JannyAI doesn't provide creator in search results without extra API calls
        avatar_url: hit.avatar ? `${JANNY_IMAGE_BASE}${hit.avatar}` : '',
        image_url: `https://jannyai.com/characters/${hit.id}_character-${slug}`,
        tags: tags,
        description: websiteDesc,
        website_description: websiteDesc, // Short tagline shown on JannyAI website
        desc_preview: websiteDesc.substring(0, 150),
        desc_search: (hit.name || '') + ' ' + websiteDesc,
        created_at: hit.createdAt,
        possibleNsfw: hit.isNsfw || false,
        // Mark as JannyAI card for special handling
        isJannyAI: true,
        service: 'jannyai',
        slug: slug,
        // Store additional metadata
        totalToken: hit.totalToken || 0,
        permanentToken: hit.permanentToken || 0,
        chatCount: hit.stats?.chatCount || 0,
        messageCount: hit.stats?.messageCount || 0
    };
}

/**
 * Transform full JannyAI character data for import
 * @param {Object} charData - Full character data from fetchJannyCharacterDetails
 * @returns {Object} Card data ready for import
 */
export function transformFullJannyCharacter(charData) {
    const char = charData.character || charData;

    // Map tag IDs to tag names
    const tags = (char.tagIds || []).map(id => JANNYAI_TAGS[id] || `Tag ${id}`);
    if (char.isNsfw && !tags.includes('NSFW')) {
        tags.unshift('NSFW');
    }

    // JannyAI's "description" field is the short website description/tagline
    // JannyAI's "personality" field is the main character description/definition
    // JannyAI's "firstMessage" is the first greeting
    // JannyAI's "exampleDialogs" is the example messages
    // JannyAI's "scenario" is the scenario
    const websiteDesc = stripHtml(char.description) || '';
    const personality = char.personality || '';
    const firstMessage = char.firstMessage || '';
    const exampleDialogs = char.exampleDialogs || '';
    const scenario = char.scenario || '';

    return {
        name: char.name || 'Unnamed',
        // Main character description/definition goes in description field
        description: personality,
        website_description: websiteDesc, // Short tagline shown on JannyAI website
        desc_preview: websiteDesc.substring(0, 150), // Keep desc_preview for card display
        personality: '', // Already included in description
        scenario: scenario,
        first_message: firstMessage,
        mes_example: exampleDialogs,
        creator_notes: websiteDesc, // Also store in creator_notes for import
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        tags: tags,
        creator: '', // JannyAI doesn't expose creator name reliably
        character_version: '1.0',
        extensions: {
            jannyai: {
                id: char.id,
                creatorId: char.creatorId
            }
        }
    };
}

/**
 * Generate URL slug from character name
 * @param {string} name - Character name
 * @returns {string} URL slug
 */
function generateSlug(name) {
    return (name || 'character')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
}

/**
 * Strip HTML tags from string
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}
