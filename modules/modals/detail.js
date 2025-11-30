import { loadCardChunk } from '../services/cache.js';
import { addToRecentlyViewed, isBookmarked, addBookmark, removeBookmark } from '../storage/storage.js';
import { buildDetailModalHTML } from '../templates/detailModal.js';
import { prepareCardDataForModal } from '../data/cardPreparation.js';
import { getChubCharacter, transformFullChubCharacter, getChubLorebook } from '../services/chubApi.js';
import { fetchJannyCharacterDetails, transformFullJannyCharacter } from '../services/jannyApi.js';

let isOpeningModal = false;

export async function showCardDetail(card, extensionName, extension_settings, state, save=true) {
    if (isOpeningModal) {
        console.log('[Bot Browser] Modal already opening, ignoring duplicate click');
        return;
    }
    isOpeningModal = true;

    try {
        let fullCard = await loadFullCard(card);

        const clickedName = (card.name || '').trim().toLowerCase();
        const loadedName = (fullCard.name || '').trim().toLowerCase();
        if (clickedName && loadedName && clickedName !== loadedName) {
            console.warn('[Bot Browser] Card name mismatch - clicked:', card.name, 'but loaded:', fullCard.name);
            // Don't show error toast - this can happen with minor formatting differences
        }

        state.selectedCard = fullCard;

        if (save) {
            state.recentlyViewed = addToRecentlyViewed(extensionName, extension_settings, state.recentlyViewed, fullCard);
        }

        const { detailOverlay, detailModal } = createDetailModal(fullCard);

        document.body.appendChild(detailOverlay);
        document.body.appendChild(detailModal);

        setupDetailModalEvents(detailModal, detailOverlay, fullCard, state);

        isOpeningModal = false;
    } catch (error) {
        console.error('[Bot Browser] Error showing card detail:', error);
        isOpeningModal = false;
        throw error;
    }
}

async function loadFullCard(card) {
    let fullCard = card;
    const chunkService = card.sourceService || card.service;

    const looksLikeChubCard = (card.isLiveChub) ||
        (card.service === 'chub') ||
        (card.sourceService === 'chub') ||
        (card.id && /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(card.id) && !card.chunk);

    const chubFullPath = card.fullPath || (looksLikeChubCard ? card.id : null);

    if (card.isLiveChub && card.isLorebook && card.nodeId) {
        try {
            console.log('[Bot Browser] Fetching full Chub lorebook data for:', card.fullPath, 'nodeId:', card.nodeId);
            const lorebookData = await getChubLorebook(card.nodeId);
            if (lorebookData) {
                // The lorebook data should have entries in SillyTavern format
                // Preserve the original card's display name (search results name), but take entries from lorebookData
                fullCard = { ...card, ...lorebookData, name: card.name };
                console.log('[Bot Browser] Loaded full Chub lorebook data:', fullCard.name, 'entries:', Object.keys(lorebookData.entries || {}).length);
                return fullCard;
            } else {
                console.log('[Bot Browser] Lorebook data unavailable (private/deleted)');
            }
        } catch (error) {
            console.error('[Bot Browser] Failed to load full Chub lorebook:', error);
            // Fall through to return original card data
        }
    }
    else if (looksLikeChubCard && chubFullPath && !card.isLorebook) {
        try {
            console.log('[Bot Browser] Fetching full Chub character data for:', chubFullPath);
            const charData = await getChubCharacter(chubFullPath);
            const fullData = transformFullChubCharacter(charData);
            fullCard = { ...card, ...fullData, isLiveChub: true, fullPath: chubFullPath };
            console.log('[Bot Browser] Loaded full Chub character data:', fullCard.name);
            return fullCard;
        } catch (error) {
            console.error('[Bot Browser] Failed to load full Chub character:', error);
            // Fall through to return original card data
        }
    }

    const looksLikeJannyCard = (card.isJannyAI) ||
        (card.service === 'jannyai') ||
        (card.sourceService === 'jannyai');

    if (looksLikeJannyCard && card.id && card.slug) {
        try {
            console.log('[Bot Browser] Fetching full JannyAI character data for:', card.id);
            const jannyData = await fetchJannyCharacterDetails(card.id, card.slug);
            const fullData = transformFullJannyCharacter(jannyData);
            fullCard = { ...card, ...fullData, isJannyAI: true };
            console.log('[Bot Browser] Loaded full JannyAI character data:', fullCard.name);
            return fullCard;
        } catch (error) {
            console.error('[Bot Browser] Failed to load full JannyAI character:', error);
            // Fall through to return original card data
        }
    }

    if (card.entries && typeof card.entries === 'object' && Object.keys(card.entries).length > 0) {
        return card;
    }

    if (card.chunk && chunkService) {
        const chunkData = await loadCardChunk(chunkService, card.chunk);

        let cardsArray = null;
        if (chunkData && chunkData.cards && Array.isArray(chunkData.cards)) {
            cardsArray = chunkData.cards;
        } else if (chunkData && chunkData.lorebooks && Array.isArray(chunkData.lorebooks)) {
            cardsArray = chunkData.lorebooks;
        } else if (chunkData && Array.isArray(chunkData) && chunkData.length > 0) {
            cardsArray = chunkData;
        }

        if (cardsArray && cardsArray.length > 0) {
            let chunkCard = cardsArray.find(c =>
                c.id === card.id ||
                (c.image_url && c.image_url === card.id) ||
                (c.image_url && c.image_url === card.image_url)
            );

            if (!chunkCard) {
                chunkCard = cardsArray.find(c => c.name === card.name);
            }

            if (chunkCard) {
                fullCard = { ...chunkCard, ...card };
            } else {
                const fallbackCard = cardsArray[card.chunk_idx];
                if (fallbackCard) {
                    fullCard = { ...fallbackCard, ...card };
                }
            }
        } else if (chunkData && !Array.isArray(chunkData) && chunkData.entries && typeof chunkData.entries === 'object') {
            fullCard = { ...card, ...chunkData };
        }
    }

    return fullCard;
}

function createDetailModal(fullCard) {
    const detailOverlay = document.createElement('div');
    detailOverlay.id = 'bot-browser-detail-overlay';
    detailOverlay.className = 'bot-browser-detail-overlay';

    const detailModal = document.createElement('div');
    detailModal.id = 'bot-browser-detail-modal';
    detailModal.className = 'bot-browser-detail-modal';

    const isLorebook = fullCard.isLorebook || (fullCard.entries && typeof fullCard.entries === 'object' && !Array.isArray(fullCard.entries));

    const cardData = prepareCardDataForModal(fullCard, isLorebook);
    const cardIsBookmarked = isBookmarked(fullCard.id);

    detailModal.innerHTML = buildDetailModalHTML(
        cardData.cardName,
        cardData.imageUrl,
        cardData.isLorebook,
        cardData.cardCreator,
        cardData.tags,
        cardData.creator,
        cardData.websiteDesc,
        cardData.description,
        cardData.descPreview,
        cardData.personality,
        cardData.scenario,
        cardData.firstMessage,
        cardData.alternateGreetings,
        cardData.exampleMsg,
        cardData.processedEntries,
        cardData.entriesCount,
        cardData.metadata,
        cardIsBookmarked
    );

    return { detailOverlay, detailModal };
}

function setupDetailModalEvents(detailModal, detailOverlay, fullCard, state) {
    const closeButton = detailModal.querySelector('.bot-browser-detail-close');
    closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        closeDetailModal();
    });

    detailOverlay.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        closeDetailModal();
    });

    detailOverlay.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    detailOverlay.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    const backButton = detailModal.querySelector('.bot-browser-detail-back');
    backButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        closeDetailModal();
    });

    detailModal.querySelectorAll('.bot-browser-collapse-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const targetId = toggle.dataset.target;
            const content = document.getElementById(targetId);
            const icon = toggle.querySelector('i');

            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.className = 'fa-solid fa-chevron-down';
            } else {
                content.style.display = 'none';
                icon.className = 'fa-solid fa-chevron-right';
            }
        });
    });

    detailModal.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    detailModal.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    detailModal.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    const bookmarkBtn = detailModal.querySelector('.bot-browser-bookmark-btn');
    if (bookmarkBtn) {
        bookmarkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            const isCurrentlyBookmarked = bookmarkBtn.classList.contains('bookmarked');

            if (isCurrentlyBookmarked) {
                removeBookmark(fullCard.id);
                bookmarkBtn.classList.remove('bookmarked');
                bookmarkBtn.querySelector('i').className = 'fa-regular fa-bookmark';
                bookmarkBtn.querySelector('span').textContent = 'Bookmark';
                toastr.info('Removed from bookmarks', '', { timeOut: 2000 });
            } else {
                addBookmark(fullCard);
                bookmarkBtn.classList.add('bookmarked');
                bookmarkBtn.querySelector('i').className = 'fa-solid fa-bookmark';
                bookmarkBtn.querySelector('span').textContent = 'Bookmarked';
                toastr.success('Added to bookmarks', '', { timeOut: 2000 });
            }
        });
    }

    validateDetailModalImage(detailModal, fullCard);
}

function validateDetailModalImage(detailModal, card) {
    const imageDiv = detailModal.querySelector('.bot-browser-detail-image');
    if (!imageDiv) return;

    const bgImage = imageDiv.style.backgroundImage;
    if (!bgImage || bgImage === 'none') return;

    // Extract URL from background-image style
    const urlMatch = bgImage.match(/url\(["']?(.+?)["']?\)/);
    if (!urlMatch || !urlMatch[1]) return;

    const imageUrl = urlMatch[1];

    // Use an actual Image object to test loading instead of fetch (avoids CORS issues)
    const testImg = new Image();

    testImg.onerror = () => {
        // Image actually failed to load, try to get error code
        fetch(imageUrl, { method: 'HEAD' })
            .then(response => {
                const errorCode = response.ok ? 'Unknown Error' : `Error ${response.status}`;
                showDetailImageError(imageDiv, errorCode, imageUrl);
            })
            .catch(() => {
                showDetailImageError(imageDiv, 'Network Error', imageUrl);
            });
    };

    testImg.src = imageUrl;
}

function showDetailImageError(imageDiv, errorCode, imageUrl) {
    imageDiv.style.backgroundImage = 'none';
    imageDiv.classList.add('image-load-failed');
    imageDiv.classList.remove('clickable-image');
    imageDiv.removeAttribute('data-image-url');
    imageDiv.removeAttribute('title');

    imageDiv.innerHTML = `
        <div class="image-failed-text">
            <i class="fa-solid fa-image-slash"></i>
            <span>Image Failed to Load</span>
            <span class="error-code">${errorCode}</span>
        </div>
    `;

    console.log(`[Bot Browser] Detail modal image failed to load (${errorCode}):`, imageUrl);
}

export function closeDetailModal() {
    const detailModal = document.getElementById('bot-browser-detail-modal');
    const detailOverlay = document.getElementById('bot-browser-detail-overlay');

    if (detailModal) detailModal.remove();
    if (detailOverlay) detailOverlay.remove();

    // Reset the modal opening guard
    isOpeningModal = false;

    console.log('[Bot Browser] Card detail modal closed');
}

export function showImageLightbox(imageUrl) {
    const lightbox = document.createElement('div');
    lightbox.id = 'bot-browser-image-lightbox';
    lightbox.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.95) !important;
        z-index: 999999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: zoom-out !important;
        animation: fadeIn 0.2s ease-out !important;
        padding: 20px !important;
        pointer-events: all !important;
    `;

    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
        max-width: 90% !important;
        max-height: 90% !important;
        width: auto !important;
        height: auto !important;
        object-fit: contain !important;
        border-radius: 8px !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
        display: block !important;
    `;

    img.onerror = () => {
        // Replace image with error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 20px !important;
            padding: 40px !important;
            background: rgba(0, 0, 0, 0.6) !important;
            border-radius: 12px !important;
            text-align: center !important;
        `;

        // Try to get HTTP error code
        fetch(imageUrl, { method: 'HEAD' })
            .then(response => {
                const errorCode = response.ok ? 'Unknown Error' : `Error ${response.status}`;
                errorDiv.innerHTML = `
                    <i class="fa-solid fa-image-slash" style="font-size: 4em; color: rgba(255, 100, 100, 0.6);"></i>
                    <div style="font-size: 1.2em; color: rgba(255, 255, 255, 0.8); font-weight: 500;">Image Failed to Load</div>
                    <div style="font-size: 0.9em; color: rgba(255, 150, 150, 0.7);">${errorCode}</div>
                `;
            })
            .catch(() => {
                errorDiv.innerHTML = `
                    <i class="fa-solid fa-image-slash" style="font-size: 4em; color: rgba(255, 100, 100, 0.6);"></i>
                    <div style="font-size: 1.2em; color: rgba(255, 255, 255, 0.8); font-weight: 500;">Image Failed to Load</div>
                    <div style="font-size: 0.9em; color: rgba(255, 150, 150, 0.7);">Network Error</div>
                `;
            });

        img.replaceWith(errorDiv);
        console.log('[Bot Browser] Image failed to load in lightbox:', imageUrl);
    };

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
    closeBtn.style.cssText = `
        position: absolute !important;
        top: 20px !important;
        right: 20px !important;
        background: rgba(255, 255, 255, 0.1) !important;
        border: none !important;
        color: white !important;
        font-size: 24px !important;
        width: 40px !important;
        height: 40px !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: background 0.2s !important;
        z-index: 1000000 !important;
        pointer-events: all !important;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';

    lightbox.appendChild(img);
    lightbox.appendChild(closeBtn);
    document.body.appendChild(lightbox);

    let isClosing = false;

    const closeLightbox = () => {
        if (isClosing) return;
        isClosing = true;

        lightbox.remove();
        console.log('[Bot Browser] Image lightbox closed');
    };

    lightbox.addEventListener('click', (e) => {
        // Only close if clicking directly on the lightbox background
        if (e.target === lightbox) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            closeLightbox();
        }
    });

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeLightbox();
    });

    img.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeLightbox();
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);

    console.log('[Bot Browser] Image lightbox opened');
}
