// JannyAI Collections API - fetches and parses collections via CORS proxy
const CORS_PROXY = 'https://corsproxy.io/?url=';
const JANNY_COLLECTIONS_URL = 'https://jannyai.com/collections';
const JANNY_IMAGE_BASE = 'https://image.jannyai.com/bot-avatars/';

/**
 * Fetch JannyAI collections list
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Collections data with items and pagination info
 */
export async function fetchJannyCollections(options = {}) {
    const {
        page = 1,
        sort = 'popular' // 'popular' or 'new'
    } = options;

    const url = `${JANNY_COLLECTIONS_URL}?sort=${sort}&page=${page}`;
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;

    console.log('[Bot Browser] Fetching JannyAI collections:', url);

    const response = await fetch(proxyUrl, {
        headers: {
            'Accept': 'text/html',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch JannyAI collections: ${response.status}`);
    }

    const html = await response.text();
    return parseCollectionsPage(html, page, sort);
}

/**
 * Strip HTML comments from text
 * @param {string} text - Text with HTML comments
 * @returns {string} Text without comments
 */
function stripHtmlComments(text) {
    return text.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Parse collections list HTML page
 * @param {string} html - HTML content
 * @param {number} currentPage - Current page number
 * @param {string} sort - Current sort option
 * @returns {Object} Parsed collections data
 */
function parseCollectionsPage(html, currentPage, sort) {
    const collections = [];

    // Parse pagination info from "Showing X to Y of Z entries"
    const paginationMatch = html.match(/Showing\s*<span[^>]*>(\d+)<\/span>\s*to\s*<span[^>]*>(\d+)<\/span>\s*of\s*<span[^>]*>(\d+)<\/span>/);
    const totalEntries = paginationMatch ? parseInt(paginationMatch[3]) : 0;
    const entriesPerPage = 20;
    const totalPages = Math.ceil(totalEntries / entriesPerPage);

    // Parse each collection card
    // Collections are in divs with class containing "relative inline-flex flex-col rounded-lg"
    const collectionRegex = /<div class="relative inline-flex flex-col rounded-lg[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*(?=<div class="relative inline-flex|<\/div>\s*<div class="mb-4|$)/g;

    // Simpler approach - find all collection links and work from there
    const collectionLinkRegex = /href="\/collections\/([^"]+)"[^>]*>\s*<h3[^>]*>([^<]+)/g;
    let linkMatch;

    while ((linkMatch = collectionLinkRegex.exec(html)) !== null) {
        const fullPath = linkMatch[1];
        const name = linkMatch[2].trim();

        // Extract collection ID and slug from path like "e8dfcb5f-40ce-45da-8dda-a3e0b294a853_favourite--977"
        const pathParts = fullPath.match(/^([a-f0-9-]+)_(.+)$/);
        if (!pathParts) continue;

        const id = pathParts[1];
        const slug = pathParts[2];

        // Find the section of HTML for this collection
        const collectionSection = findCollectionSection(html, fullPath);
        if (!collectionSection) continue;

        // Strip HTML comments before parsing (JannyAI uses <!-- --> between elements)
        const cleanSection = stripHtmlComments(collectionSection);

        // Parse character count - now works after stripping comments
        const countMatch = cleanSection.match(/\(\s*(\d+)\s*characters?\)/i);
        const characterCount = countMatch ? parseInt(countMatch[1]) : 0;

        // Parse description
        const descMatch = collectionSection.match(/<p class="mt-4 text-sm text-gray-500[^"]*">([^<]+)<\/p>/);
        const description = descMatch ? decodeHtmlEntities(descMatch[1].trim()) : '';

        // Parse last updated date
        const dateMatch = collectionSection.match(/Last updated:\s*(?:<!--[^>]*-->)?\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
        const lastUpdated = dateMatch ? dateMatch[1] : '';

        // Parse creator info
        const creatorMatch = collectionSection.match(/href="\/collectors\/([^"]+)"[^>]*class="hyperlink">([^<]+)<\/a>/);
        const creatorUsername = creatorMatch ? creatorMatch[1] : '';
        const creatorName = creatorMatch ? decodeHtmlEntities(creatorMatch[2].trim()) : 'Unknown';

        // Parse creator avatar
        const creatorAvatarMatch = collectionSection.match(/<img class="h-6 w-6 rounded-full"[^>]*src="([^"]+)"/);
        const creatorAvatar = creatorAvatarMatch ? creatorAvatarMatch[1] : '';

        // Parse view count
        const viewsMatch = collectionSection.match(/<strong>(\d+)<\/strong>\s*views/);
        const views = viewsMatch ? parseInt(viewsMatch[1]) : 0;

        // Parse preview images (up to 5 character avatars)
        const previewImages = [];
        const imgRegex = /<img class="h-14 w-14 rounded-full[^"]*"[^>]*src="([^"]+)"/g;
        let imgMatch;
        while ((imgMatch = imgRegex.exec(collectionSection)) !== null && previewImages.length < 5) {
            previewImages.push(imgMatch[1]);
        }

        collections.push({
            id,
            slug,
            fullPath,
            name,
            description,
            characterCount,
            lastUpdated,
            creator: {
                username: creatorUsername,
                name: creatorName,
                avatar: creatorAvatar
            },
            views,
            previewImages,
            url: `https://jannyai.com/collections/${fullPath}`
        });
    }

    console.log(`[Bot Browser] Parsed ${collections.length} collections from page ${currentPage}`);

    return {
        collections,
        pagination: {
            currentPage,
            totalPages,
            totalEntries,
            hasMore: currentPage < totalPages
        },
        sort
    };
}

/**
 * Find the HTML section for a specific collection
 * @param {string} html - Full HTML
 * @param {string} fullPath - Collection path
 * @returns {string|null} HTML section for this collection
 */
function findCollectionSection(html, fullPath) {
    // Find the position of the collection link
    const linkPos = html.indexOf(`href="/collections/${fullPath}"`);
    if (linkPos === -1) return null;

    // Search backwards for the start of the card (relative inline-flex flex-col)
    let startPos = linkPos;
    const cardStartPattern = '<div class="relative inline-flex flex-col';
    while (startPos > 0) {
        const foundPos = html.lastIndexOf(cardStartPattern, startPos);
        if (foundPos === -1) break;
        startPos = foundPos;
        break;
    }

    // Search forwards for the end of the card
    // Look for the next card start or end of grid
    let endPos = html.indexOf(cardStartPattern, linkPos);
    if (endPos === -1) {
        endPos = html.indexOf('</div>\n                </div>', linkPos);
        if (endPos === -1) endPos = html.length;
    }

    return html.substring(startPos, endPos);
}

/**
 * Fetch a single collection's details and characters
 * @param {string} collectionId - Collection UUID
 * @param {string} slug - Collection slug
 * @returns {Promise<Object>} Collection details with characters
 */
export async function fetchJannyCollectionDetails(collectionId, slug) {
    const url = `https://jannyai.com/collections/${collectionId}_${slug}`;
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;

    console.log('[Bot Browser] Fetching JannyAI collection details:', url);

    const response = await fetch(proxyUrl, {
        headers: {
            'Accept': 'text/html',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch collection details: ${response.status}`);
    }

    const html = await response.text();
    return parseCollectionDetailsPage(html, collectionId, slug);
}

/**
 * Parse collection details page HTML
 * @param {string} html - HTML content
 * @param {string} collectionId - Collection UUID
 * @param {string} slug - Collection slug
 * @returns {Object} Parsed collection details
 */
function parseCollectionDetailsPage(html, collectionId, slug) {
    const characters = [];
    const seenIds = new Set();

    // Strip HTML comments from the entire page for cleaner parsing
    const cleanHtml = stripHtmlComments(html);

    // Parse collection name from title or h1
    const titleMatch = cleanHtml.match(/<title>([^<]+)<\/title>/) || cleanHtml.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const collectionName = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(' - JannyAI', '').trim()) : 'Collection';

    // Find all character card anchor tags - they contain everything we need
    // Pattern: <a ... href="/characters/{uuid}_{slug}" ...>...card content...</a>
    const cardRegex = /<a[^>]*href="\/characters\/([a-f0-9-]+)_([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let cardMatch;

    while ((cardMatch = cardRegex.exec(cleanHtml)) !== null) {
        const charId = cardMatch[1];

        // Skip duplicates
        if (seenIds.has(charId)) continue;
        seenIds.add(charId);

        const charSlug = cardMatch[2];
        const cardContent = cardMatch[3];

        // Extract name from h5 tag with specific class
        // Pattern: <h5 class="mb-2 text-xl font-bold tracking-tight text-gray-900">{name}</h5>
        let name = '';
        const h5Match = cardContent.match(/<h5[^>]*class="[^"]*font-bold[^"]*"[^>]*>([^<]+)<\/h5>/);
        if (h5Match) {
            name = decodeHtmlEntities(h5Match[1].trim());
        } else {
            // Fallback: try alt attribute from img
            const altMatch = cardContent.match(/alt="Avatar of ([^"]+)"/);
            if (altMatch) {
                name = decodeHtmlEntities(altMatch[1].trim());
            } else {
                // Last resort: use slug without "character-" prefix
                name = charSlug.replace(/^character-/, '').replace(/-/g, ' ');
            }
        }

        // Extract avatar URL from img tag
        let avatarUrl = '';
        const imgMatch = cardContent.match(/<img[^>]*src="(https:\/\/image\.jannyai\.com\/[^"]+)"[^>]*>/);
        if (imgMatch) {
            avatarUrl = imgMatch[1];
        }

        // Extract tags from the li > span elements
        const tags = [];
        const tagRegex = /<li[^>]*>[\s\S]*?<span[^>]*class="[^"]*text-xs[^"]*"[^>]*>([^<]+)<\/span>[\s\S]*?<\/li>/g;
        let tagMatch;
        while ((tagMatch = tagRegex.exec(cardContent)) !== null) {
            const tagText = decodeHtmlEntities(tagMatch[1].trim());
            // Remove emoji prefix if present (e.g., "🔞 NSFW" -> "NSFW")
            const cleanTag = tagText.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, '').trim();
            if (cleanTag && cleanTag.length > 0) {
                tags.push(cleanTag);
            }
        }

        characters.push({
            id: charId,
            slug: charSlug,
            name,
            avatar_url: avatarUrl,
            image_url: `https://jannyai.com/characters/${charId}_${charSlug}`,
            service: 'jannyai',
            isJannyAI: true,
            description: '',
            tags
        });
    }

    console.log(`[Bot Browser] Parsed ${characters.length} characters from collection`);

    return {
        id: collectionId,
        slug,
        name: collectionName,
        characters,
        url: `https://jannyai.com/collections/${collectionId}_${slug}`
    };
}

/**
 * Decode HTML entities
 * @param {string} text - Text with HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
    if (!text) return '';
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

/**
 * Transform collection to card format for display
 * @param {Object} collection - Collection data
 * @returns {Object} Card-like format for grid display
 */
export function transformCollectionToCard(collection) {
    return {
        id: collection.id,
        name: collection.name,
        creator: collection.creator?.name || '',
        avatar_url: collection.previewImages?.[0] || '',
        image_url: collection.url,
        tags: [`${collection.characterCount} characters`, `${collection.views} views`],
        description: collection.description,
        desc_preview: collection.description?.substring(0, 150) || '',
        created_at: collection.lastUpdated,
        isCollection: true,
        isJannyAI: true,
        service: 'jannyai_collections',
        collectionData: collection
    };
}
