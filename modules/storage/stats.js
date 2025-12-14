// Statistics tracking for Bot Browser extension
import { saveImportStats, trackImportedCard } from './storage.js';

// Track an import
export function trackImport(extensionName, extension_settings, importStats, card, type) {
    // Always track the full card data for "My Imports" browsing
    trackImportedCard(card, type);

    // Only track stats if enabled
    if (!extension_settings[extensionName].trackStats) return importStats;

    const importRecord = {
        name: card.name,
        creator: card.creator || 'Unknown',
        source: card.sourceService || card.service || 'Unknown',
        type: type, // 'character' or 'lorebook'
        timestamp: Date.now()
    };

    importStats.imports.unshift(importRecord);

    // Update totals
    if (type === 'character') {
        importStats.totalCharacters++;
    } else if (type === 'lorebook') {
        importStats.totalLorebooks++;
    }

    // Update by source
    if (!importStats.bySource[importRecord.source]) {
        importStats.bySource[importRecord.source] = 0;
    }
    importStats.bySource[importRecord.source]++;

    // Update by creator
    if (!importStats.byCreator[importRecord.creator]) {
        importStats.byCreator[importRecord.creator] = 0;
    }
    importStats.byCreator[importRecord.creator]++;

    // Keep last 100 imports
    if (importStats.imports.length > 100) {
        importStats.imports = importStats.imports.slice(0, 100);
    }

    saveImportStats(importStats);
    return importStats;
}

// Helper function to get time ago string
export function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
    return `${Math.floor(seconds / 31536000)}y ago`;
}
