import { sanitizeImageUrl } from '../utils/utils.js';

export function buildDetailModalHTML(cardName, imageUrl, isLorebook, cardCreator, tags, creator, websiteDesc, description, descPreview, personality, scenario, firstMessage, alternateGreetings, exampleMsg, entries, entriesCount, metadata, isBookmarked = false, isRandom = false, isImported = false, characterExistsInST = false, sourceUrlData = null) {
    const safeImageUrl = sanitizeImageUrl(imageUrl);

    // Random buttons HTML (only shown when viewing a random card)
    const randomButtonsHTML = isRandom ? `
                <div class="bot-browser-detail-actions-row bot-browser-random-row">
                    <button class="bot-browser-random-same-btn" title="Get another random card from the same source">
                        <i class="fa-solid fa-shuffle"></i> <span>Same Source</span>
                    </button>
                    <button class="bot-browser-random-any-btn" title="Get a random card from any source">
                        <i class="fa-solid fa-dice"></i> <span>Any Source</span>
                    </button>
                </div>` : '';

    // Open in SillyTavern button (only for imported cards that exist in ST)
    const openInSTButtonHTML = (isImported && characterExistsInST) ? `
                <div class="bot-browser-detail-actions-row bot-browser-open-st-row">
                    <button class="bot-browser-open-in-st-btn" title="Open a chat with this character in SillyTavern">
                        <i class="fa-solid fa-comments"></i> <span>Open Chat in SillyTavern</span>
                    </button>
                </div>` : '';

    // View on Website button (only for live API sources)
    const viewOnWebsiteHTML = sourceUrlData ? `
                <button class="bot-browser-view-source-btn" data-url="${sourceUrlData.url}" title="View on ${sourceUrlData.serviceName}">
                    <i class="fa-solid fa-external-link"></i>
                </button>` : '';

    return `
        <div class="bot-browser-detail-header">
            <h2>${cardName}</h2>
            <div class="bot-browser-detail-header-actions">
                ${viewOnWebsiteHTML}
                <button class="bot-browser-detail-close">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
        </div>

        <div class="bot-browser-detail-content">
            <div class="bot-browser-detail-scroll-container">
                <div class="bot-browser-detail-actions-container">
                    <div class="bot-browser-detail-actions-row">
                        <button class="bot-browser-import-button">
                            <i class="fa-solid fa-download"></i> <span>Import</span>
                        </button>
                        <button class="bot-browser-bookmark-btn ${isBookmarked ? 'bookmarked' : ''}">
                            <i class="fa-${isBookmarked ? 'solid' : 'regular'} fa-bookmark"></i>
                            <span>${isBookmarked ? 'Saved' : 'Save'}</span>
                        </button>
                        <button class="bot-browser-detail-back">
                            <i class="fa-solid fa-arrow-left"></i> <span>Back</span>
                        </button>
                    </div>
                    ${randomButtonsHTML}
                    ${openInSTButtonHTML}
                </div>

                <div class="bot-browser-detail-image ${safeImageUrl ? 'clickable-image' : ''}" style="background-image: url('${safeImageUrl}');" ${safeImageUrl ? `data-image-url="${safeImageUrl}" title="Click to enlarge"` : ''}>
                    ${!safeImageUrl ? '<i class="fa-solid fa-user"></i>' : ''}
                    ${safeImageUrl ? '<div style="position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.5); padding: 3px 6px; border-radius: 3px; font-size: 10px; color: rgba(255,255,255,0.7); pointer-events: none;"><i class="fa-solid fa-search-plus" style="font-size: 9px; margin-right: 3px;"></i>Click to enlarge</div>' : ''}
                </div>

                <div class="bot-browser-detail-info">
                    ${buildDetailSections(isLorebook, cardCreator, tags, creator, websiteDesc, description, descPreview, personality, scenario, firstMessage, alternateGreetings, exampleMsg, entries, entriesCount, metadata)}
                </div>
            </div>
        </div>
    `;
}

function buildDetailSections(isLorebook, cardCreator, tags, creator, websiteDesc, description, descPreview, personality, scenario, firstMessage, alternateGreetings, exampleMsg, entries, entriesCount, metadata) {
    let html = '';

    if (isLorebook) {
        html += `
                <div class="bot-browser-detail-section">
                    <div class="bot-browser-detail-text">
                        <strong>Type:</strong> Lorebook<br>
                        <strong>Entries:</strong> ${entriesCount}
                    </div>
                </div>`;
    }

    if (cardCreator) {
        html += `
                <div class="bot-browser-detail-section">
                    <div class="bot-browser-detail-creator">
                        <i class="fa-solid fa-user-pen"></i>
                        <button class="bot-browser-creator-link" data-creator="${creator}">
                            ${cardCreator}
                        </button>
                    </div>
                </div>`;
    }

    if (tags.length > 0) {
        html += `
                <div class="bot-browser-detail-section">
                    <div class="bot-browser-detail-tags">
                        ${tags.map(tag => `<button class="bot-browser-tag-pill bot-browser-tag-clickable" data-tag="${tag}">${tag}</button>`).join('')}
                    </div>
                </div>`;
    }

    if (websiteDesc) {
        html += buildCollapsibleSection('website-desc', 'Website Description', websiteDesc);
    }

    if (description) {
        html += buildCollapsibleSection('description', 'Description', description);
    } else if (!websiteDesc && descPreview) {
        html += buildCollapsibleSection('desc-preview', 'Description Preview', descPreview);
    }

    if (!isLorebook) {
        if (personality) {
            html += buildSection('Personality', personality);
        }

        if (scenario) {
            html += buildSection('Scenario', scenario);
        }

        if (firstMessage) {
            html += buildSection('First Message', firstMessage);
        }

        if (alternateGreetings.length > 0) {
            html += buildAlternateGreetingsSection(alternateGreetings);
        }

        if (exampleMsg) {
            html += buildSection('Example Messages', exampleMsg);
        }
    }

    if (isLorebook && entries && Array.isArray(entries) && entries.length > 0) {
        html += buildLorebookEntriesSection(entries, entriesCount);
    }

    if (metadata) {
        html += `
                <div class="bot-browser-detail-section">
                    <h4>Metadata</h4>
                    <div class="bot-browser-detail-metadata">
                        ${metadata}
                    </div>
                </div>`;
    }

    return html;
}

function buildCollapsibleSection(id, title, content) {
    return `
                <div class="bot-browser-detail-section">
                    <button class="bot-browser-collapse-toggle" data-target="${id}">
                        <i class="fa-solid fa-chevron-right"></i>
                        <h4>${title}</h4>
                    </button>
                    <div class="bot-browser-collapse-content" id="${id}" style="display: none;">
                        <div class="bot-browser-detail-text">
                            ${content}
                        </div>
                    </div>
                </div>`;
}

function buildSection(title, content) {
    return `
                <div class="bot-browser-detail-section">
                    <h4>${title}</h4>
                    <div class="bot-browser-detail-text">
                        ${content}
                    </div>
                </div>`;
}

function buildAlternateGreetingsSection(alternateGreetings) {
    return `
                <div class="bot-browser-detail-section">
                    <h4>Alternate Greetings (${alternateGreetings.length})</h4>
                    ${alternateGreetings.map((greeting, index) => `
                        <div class="bot-browser-detail-greeting">
                            <div class="bot-browser-detail-greeting-header">
                                <i class="fa-solid fa-comment"></i> Greeting ${index + 1}
                            </div>
                            <div class="bot-browser-detail-text">
                                ${greeting}
                            </div>
                        </div>
                    `).join('')}
                </div>`;
}

function buildLorebookEntriesSection(entries, entriesCount) {
    return `
                <div class="bot-browser-detail-section">
                    <h4>Lorebook Entries (${entriesCount}) (Preview)</h4>
                    ${entries.map(entry => `
                        <div class="bot-browser-detail-section" style="margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 5px;">
                            <h5 style="margin: 0 0 5px 0;">${entry.name}</h5>
                            ${entry.keywords && entry.keywords.length > 0 ? `
                                <div style="margin-bottom: 10px;">
                                    <strong style="font-size: 12px; color: rgba(255,255,255,0.6);">Keywords:</strong>
                                    ${entry.keywords.map(kw => `<span style="display: inline-block; background: rgba(100,150,255,0.2); padding: 2px 6px; border-radius: 3px; margin: 2px; font-size: 11px;">${kw}</span>`).join('')}
                                </div>
                            ` : ''}
                            <div class="bot-browser-detail-text">
                                ${entry.content}
                            </div>
                        </div>
                    `).join('')}
                </div>`;
}
