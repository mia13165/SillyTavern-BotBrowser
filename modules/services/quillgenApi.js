import { extension_settings } from '../../../../../extensions.js';

const QUILLGEN_API_URL = 'https://quillgen.app/v1/public/api/browse';

/**
 * Load characters from QuillGen API.
 * Without API key: returns public characters only.
 * With API key: returns public characters + user's own characters (marked with is_own).
 * @returns {Promise<Array>} Array of QuillGen cards in BotBrowser format
 */
export async function loadQuillgenIndex() {
    const settings = extension_settings?.['BotBrowser'] || {};
    const apiKey = settings.quillgenApiKey;

    try {
        const headers = { 'Accept': 'application/json' };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${QUILLGEN_API_URL}/characters?limit=500`, { headers });

        if (response.status === 401) {
            if (apiKey) {
                console.error('[Bot Browser] QuillGen API key is invalid');
                toastr.error('QuillGen API key is invalid. Check your settings.', 'Authentication Failed');
            } else {
                console.warn('[Bot Browser] QuillGen requires authentication for this request');
            }
            return [];
        }

        if (!response.ok) {
            console.error(`[Bot Browser] QuillGen API error: ${response.status}`);
            toastr.error(`Failed to load QuillGen characters: ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        const cards = data.cards || [];

        const mappedCards = cards.map(card => transformQuillgenCard(card, apiKey));

        const ownCount = mappedCards.filter(c => c.is_own).length;
        const publicCount = mappedCards.length - ownCount;
        console.log(`[Bot Browser] Loaded ${mappedCards.length} cards from QuillGen (${publicCount} public, ${ownCount} own)`);

        if (mappedCards.length === 0) {
            const msg = apiKey
                ? 'No characters found. Create some on QuillGen.app!'
                : 'No public characters available yet.';
            toastr.info(msg, 'QuillGen');
        }

        return mappedCards;
    } catch (error) {
        console.error('[Bot Browser] Error loading QuillGen index:', error);
        toastr.error('Failed to connect to QuillGen');
        return [];
    }
}

/**
 * Fetch a QuillGen card PNG blob for import.
 * @param {Object} card - Card object with image_url
 * @returns {Promise<Blob>} The card image blob
 */
export async function fetchQuillgenCard(card) {
    const settings = extension_settings?.['BotBrowser'] || {};
    const apiKey = settings.quillgenApiKey;

    const cardUrl = card.image_url;
    // Log the URL without the key for security
    const logUrl = cardUrl.split('?')[0];
    console.log('[Bot Browser] Fetching QuillGen card from:', logUrl);

    const fetchOptions = {};
    if (apiKey && apiKey.trim() !== '') {
        fetchOptions.headers = { 'Authorization': `Bearer ${apiKey}` };
    }

    try {
        const response = await fetch(cardUrl, fetchOptions);

        if (response.status === 401) {
            console.error('[Bot Browser] QuillGen authentication failed', response);
            toastr.error('QuillGen API key is invalid. Check your settings.', 'Invalid API key');
            return null;
        }

        if (!response.ok) {
            console.error(`[Bot Browser] Failed to fetch QuillGen card: ${response.status}`, response);
            toastr.error(`Failed to fetch QuillGen card: ${response.statusText}`);
            return null;
        }

        console.log('[Bot Browser] ✓ Successfully fetched QuillGen card');
        return await response.blob();
    } catch (err) {
        console.error('[Bot Browser] Error fetching QuillGen card:', err);
        toastr.error('Failed to fetch QuillGen card');
        return null;
    }
}

/**
 * Transform a QuillGen card to BotBrowser format
 * @param {Object} card - Raw card from QuillGen API
 * @param {string} apiKey - Optional API key for authenticated URLs
 * @returns {Object} Card in BotBrowser format
 */
function transformQuillgenCard(card, apiKey) {
    const appendApiKey = (url) => {
        if (!apiKey || !url) return url;
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}key=${encodeURIComponent(apiKey)}`;
    };

    // Use the optimized avatar endpoint for browsing (bandwidth saving)
    // Default to 300px WebP as per API docs
    let avatarUrl = card.avatar_url;
    if (card.id) {
        avatarUrl = `https://quillgen.app/v1/public/api/browse/characters/${card.id}/avatar?size=300&format=webp`;
    } else {
        // Fallback if no ID (shouldn't happen)
        avatarUrl = appendApiKey(card.avatar_url);
    }

    return {
        ...card,
        avatar_url: avatarUrl,
        image_url: appendApiKey(card.image_url),
        service: 'quillgen',
        chunk: null // QuillGen cards don't use chunks - they're fetched directly
    };
}