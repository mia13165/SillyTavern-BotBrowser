// Local Library Service - loads BotBrowser imported cards for browsing
import { loadImportedCards, clearImportedCards } from '../storage/storage.js';

/**
 * Load all imported cards from localStorage for browsing
 * @returns {Promise<Array>} Array of card objects formatted for the browser
 */
export async function loadLocalLibrary() {
    const importedCards = loadImportedCards();

    // Transform to standard card format
    return importedCards.map(card => transformImportedCard(card));
}

/**
 * Transform a stored import record to standard card format for display
 * @param {object} record - The import record from localStorage
 * @returns {object} Card object formatted for the browser
 */
export function transformImportedCard(record) {
    return {
        id: record.id,
        name: record.name,
        creator: record.creator || 'Unknown',
        avatar_url: record.avatar_url,
        image_url: record.image_url || record.avatar_url,
        tags: record.tags || [],
        description: record.description || '',
        desc_preview: record.desc_preview || (record.description ? record.description.substring(0, 200) : ''),
        desc_search: record.description || '',
        created_at: record.created_at,
        imported_at: record.imported_at,
        nTokens: record.nTokens,
        possibleNsfw: record.possibleNsfw || false,
        service: 'my_imports',
        sourceService: record.sourceService || record.service || 'unknown',
        originalService: record.sourceService || record.service,
        type: record.type || 'character',
        isImported: true,
        // Preserve identifiers for potential re-fetch from original source
        isLiveChub: record.isLiveChub || false,
        fullPath: record.fullPath || null,
        isJannyAI: record.isJannyAI || false,
        slug: record.slug || null,
        isCharacterTavern: record.isCharacterTavern || false,
        isMlpchag: record.isMlpchag || false
    };
}

/**
 * Clear all import history
 */
export function clearLocalLibrary() {
    return clearImportedCards();
}

/**
 * Get import count
 * @returns {number} Number of tracked imports
 */
export function getImportCount() {
    const cards = loadImportedCards();
    return cards.length;
}
