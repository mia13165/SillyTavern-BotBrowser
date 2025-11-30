export function getAllTags(cards) {
    const tagsSet = new Set();
    cards.forEach(card => {
        if (Array.isArray(card.tags)) {
            card.tags.forEach(tag => tagsSet.add(tag));
        }
    });
    return Array.from(tagsSet).sort();
}

// Get all unique creators from cards
export function getAllCreators(cards) {
    const creatorsSet = new Set();
    cards.forEach(card => {
        if (card.creator) {
            creatorsSet.add(card.creator);
        }
    });
    return Array.from(creatorsSet).sort();
}

// Sort cards based on current sort option
export function sortCards(cards, sortBy) {
    const sorted = [...cards]; // Create a copy to avoid mutating original

    switch (sortBy) {
        case 'name_asc':
            return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        case 'name_desc':
            return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        case 'creator_asc':
            return sorted.sort((a, b) => (a.creator || '').localeCompare(b.creator || ''));
        case 'creator_desc':
            return sorted.sort((a, b) => (b.creator || '').localeCompare(a.creator || ''));
        case 'date_desc':
            return sorted.sort((a, b) => {
                const dateA = new Date(a.created_at || a.createdAt || 0);
                const dateB = new Date(b.created_at || b.createdAt || 0);
                return dateB - dateA;
            });
        case 'date_asc':
            return sorted.sort((a, b) => {
                const dateA = new Date(a.created_at || a.createdAt || 0);
                const dateB = new Date(b.created_at || b.createdAt || 0);
                return dateA - dateB;
            });
        case 'tokens_desc':
            return sorted.sort((a, b) => (b.nTokens || 0) - (a.nTokens || 0));
        case 'tokens_asc':
            return sorted.sort((a, b) => (a.nTokens || 0) - (b.nTokens || 0));
        case 'relevance':
        default:
            // If using search, Fuse.js already sorted by relevance
            // Otherwise, keep original order
            return sorted;
    }
}

// Filter cards based on current filter state
export function filterCards(cards, filters, fuse, extensionName, extension_settings) {
    let filteredCards = cards;

    const blocklist = extension_settings[extensionName].tagBlocklist || [];
    const hideNsfw = extension_settings[extensionName].hideNsfw || false;
    console.log(`[Bot Browser] filterCards: blocklist=[${blocklist.join(', ')}], hideNsfw=${hideNsfw}, search="${filters.search || ''}", tags=[${filters.tags?.join(', ') || ''}], creator="${filters.creator || ''}", input=${cards.length} cards`);

    // Text search using Fuse.js for fuzzy matching
    if (filters.search && fuse) {
        const searchResults = fuse.search(filters.search);
        // Extract the items from Fuse results (Fuse returns objects with { item, score, matches })
        filteredCards = searchResults.map(result => result.item);
    }

    // Apply additional filters (tags, creator, and NSFW)
    filteredCards = filteredCards.filter(card => {
        // Tag filter (must have ALL selected tags)
        if (filters.tags.length > 0) {
            if (!card.tags || !filters.tags.every(tag => card.tags.includes(tag))) {
                return false;
            }
        }

        // Creator filter
        if (filters.creator && card.creator !== filters.creator) {
            return false;
        }

        // NSFW filter - hide NSFW cards if hideNsfw is enabled
        if (extension_settings[extensionName].hideNsfw && card.possibleNsfw) {
            return false;
        }

        // Tag blocklist filter - hide cards with blocked tags or terms in description
        const blocklist = extension_settings[extensionName].tagBlocklist || [];
        if (blocklist.length > 0) {
            // Normalize blocklist terms (lowercase, trim)
            const normalizedBlocklist = blocklist.map(term => term.toLowerCase().trim()).filter(term => term.length > 0);

            if (normalizedBlocklist.length > 0) {
                // Check if card has any blocked tags (exact match)
                if (card.tags && Array.isArray(card.tags)) {
                    const normalizedTags = card.tags.map(tag => tag.toLowerCase().trim());
                    const matchedTag = normalizedBlocklist.find(blocked => normalizedTags.includes(blocked));
                    if (matchedTag) {
                        console.log(`[Bot Browser] Blocklist: Hiding "${card.name}" - tag match: "${matchedTag}"`);
                        return false;
                    }
                }

                // Check if description contains any blocked terms (word boundary match)
                // Use word boundaries to prevent "male" matching inside "female"
                const desc = (card.desc_search || card.desc_preview || card.description || '').toLowerCase();
                const matchedDescTerm = normalizedBlocklist.find(blocked => {
                    // Escape special regex characters in the blocked term
                    const escapedTerm = blocked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const wordBoundaryRegex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
                    return wordBoundaryRegex.test(desc);
                });
                if (matchedDescTerm) {
                    console.log(`[Bot Browser] Blocklist: Hiding "${card.name}" - desc match: "${matchedDescTerm}" in "${desc.substring(0, 100)}..."`);
                    return false;
                }

                // Check if name contains any blocked terms (word boundary match)
                const name = (card.name || '').toLowerCase();
                const matchedNameTerm = normalizedBlocklist.find(blocked => {
                    const escapedTerm = blocked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const wordBoundaryRegex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
                    return wordBoundaryRegex.test(name);
                });
                if (matchedNameTerm) {
                    console.log(`[Bot Browser] Blocklist: Hiding "${card.name}" - name match: "${matchedNameTerm}"`);
                    return false;
                }
            }
        }

        return true;
    });

    return filteredCards;
}

export function deduplicateCards(cards) {
    const seen = new Map();
    const deduplicated = [];

    for (const card of cards) {
        // Use card ID as primary key if available (most reliable)
        // Fall back to name+creator only when ID is not present
        let key;
        if (card.id) {
            key = `id:${card.id}`;
        } else {
            const normalizedName = (card.name || '').toLowerCase().trim();
            const normalizedCreator = (card.creator || 'unknown').toLowerCase().trim();
            key = `name:${normalizedName}|${normalizedCreator}`;
        }

        if (seen.has(key)) {
            const firstCard = seen.get(key);
            console.log('[Bot Browser] Removing duplicate card:', card.name, 'id:', card.id,
                       '(keeping first from', firstCard.service || firstCard.sourceService, ')');
        } else {
            seen.set(key, card);
            deduplicated.push(card);
        }
    }

    const removedCount = cards.length - deduplicated.length;
    if (removedCount > 0) {
        console.log(`[Bot Browser] Removed ${removedCount} duplicate cards, kept ${deduplicated.length} unique cards`);
    }

    return deduplicated;
}

// Global Intersection Observer for lazy image validation
let imageObserver = null;

function getImageObserver() {
    if (!imageObserver) {
        imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const imageDiv = entry.target;
                    const bgImage = imageDiv.style.backgroundImage;

                    if (bgImage && bgImage !== 'none' && !imageDiv.dataset.validated) {
                        imageDiv.dataset.validated = 'true';

                        // Extract URL from background-image style
                        const urlMatch = bgImage.match(/url\(["']?(.+?)["']?\)/);
                        if (urlMatch && urlMatch[1]) {
                            const imageUrl = urlMatch[1];

                            // Use an actual Image object to test loading
                            const testImg = new Image();

                            testImg.onerror = () => {
                                // Image failed to load
                                // Skip fetch for JannyAI images - their CDN blocks CORS
                                // The image might actually work for display but fail validation
                                if (imageUrl.includes('image.jannyai.com')) {
                                    // For JannyAI, show a generic fallback silently (don't spam console)
                                    showImageError(imageDiv, 'Unavailable', imageUrl, true);
                                    return;
                                }

                                fetch(imageUrl, { method: 'HEAD' })
                                    .then(response => {
                                        const errorCode = response.ok ? 'Unknown Error' : `Error ${response.status}`;
                                        showImageError(imageDiv, errorCode, imageUrl);
                                    })
                                    .catch(() => {
                                        showImageError(imageDiv, 'Network Error', imageUrl);
                                    });
                            };

                            testImg.src = imageUrl;
                        }
                    }

                    // Stop observing after validation
                    imageObserver.unobserve(imageDiv);
                }
            });
        }, {
            rootMargin: '50px', // Start loading slightly before visible
            threshold: 0.01
        });
    }
    return imageObserver;
}

// Validate and show fallback for cards with failed image loads (optimized with Intersection Observer)
export function validateCardImages() {
    const observer = getImageObserver();
    const cardImages = document.querySelectorAll('.bot-browser-card-image');

    cardImages.forEach(imageDiv => {
        // Only observe images that haven't been validated yet
        if (!imageDiv.dataset.validated) {
            observer.observe(imageDiv);
        }
    });
}

// Helper function to show image error
function showImageError(imageDiv, errorCode, imageUrl, silent = false) {
    imageDiv.style.backgroundImage = 'none';
    imageDiv.classList.add('image-load-failed');

    if (!imageDiv.querySelector('.image-failed-text')) {
        imageDiv.innerHTML = `
            <div class="image-failed-text">
                <i class="fa-solid fa-image-slash"></i>
                <span>Image Failed to Load</span>
                <span class="error-code">${errorCode}</span>
            </div>
        `;
    }

    if (!silent) {
        console.log(`[Bot Browser] Showing fallback for card with failed image (${errorCode}):`, imageUrl);
    }
}

export async function getRandomCard(source, currentCards, loadServiceIndexFunc) {
    try {
        let cards = [];

        if (source === 'current' && currentCards.length > 0) {
            // Random from current view
            cards = currentCards.filter(card => {
                const imageUrl = card.avatar_url || card.image_url;
                return imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
            });
        } else if (source === 'all' || !source) {
            // Random from all sources
            toastr.info('Loading all cards...', '', { timeOut: 1500 });
            const serviceNames = ['anchorhold', 'catbox', 'character_tavern', 'chub', 'nyai_me', 'risuai_realm', 'webring', 'mlpchag', 'desuarchive'];

            for (const service of serviceNames) {
                const serviceCards = await loadServiceIndexFunc(service);
                const cardsWithSource = serviceCards.map(card => ({
                    ...card,
                    sourceService: service
                })).filter(card => {
                    const imageUrl = card.avatar_url || card.image_url;
                    return imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
                });
                cards = cards.concat(cardsWithSource);
            }
        } else {
            // Random from specific service
            cards = currentCards.filter(card => {
                const imageUrl = card.avatar_url || card.image_url;
                return imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
            });
        }

        if (cards.length === 0) {
            toastr.warning('No cards available');
            return null;
        }

        // Pick random
        const randomIndex = Math.floor(Math.random() * cards.length);
        const randomCard = cards[randomIndex];

        console.log('[Bot Browser] Selected random card:', randomCard.name);
        return randomCard;
    } catch (error) {
        console.error('[Bot Browser] Error getting random card:', error);
        toastr.error('Failed to get random card');
        return null;
    }
}
