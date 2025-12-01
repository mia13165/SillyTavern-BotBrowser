import { escapeHTML, sanitizeImageUrl } from '../utils/utils.js';

export function createCardGrid(cards, initialBatchSize = 50, startIndex = 0) {
    if (cards.length === 0) {
        return '<div class="bot-browser-no-results">No cards found matching your filters.</div>';
    }

    const cardsHTML = cards.map(card => createCardHTML(card)).join('');
    return cardsHTML;
}

export function createCardHTML(card) {
    const imageUrl = card.avatar_url || card.image_url || '';
    const safeImageUrl = sanitizeImageUrl(imageUrl);
    const tags = card.tags || [];
    const cardName = escapeHTML(card.name);
    const cardCreator = card.creator ? escapeHTML(card.creator) : '';
    const isNsfw = card.possibleNsfw ? 'true' : 'false';

    return `
        <div class="bot-browser-card-thumbnail" data-card-id="${card.id}" data-nsfw="${isNsfw}">
            ${card.is_own ? '<div class="bot-browser-own-badge" title="Your character"><i class="fa-solid fa-user"></i></div>' : ''}
            <div class="bot-browser-card-image" style="background-image: url('${safeImageUrl}');">
                ${!safeImageUrl ? '<i class="fa-solid fa-user"></i>' : ''}
            </div>
            <div class="bot-browser-card-info">
                <div class="bot-browser-card-name">${cardName}</div>
                ${cardCreator ? `<div class="bot-browser-card-creator">${cardCreator}</div>` : ''}

                ${tags.length > 0 ? `
                    <div class="bot-browser-card-tags">
                        ${tags.slice(0, 3).map(tag => `<span class="bot-browser-card-tag">${escapeHTML(tag)}</span>`).join('')}
                        ${tags.length > 3 ? `<span class="bot-browser-card-tag-more">+${tags.length - 3}</span>` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

export function getOriginalMenuHTML(recentlyViewed) {
    return `
        <div class="bot-browser-header">
            <h3>Bot Browser <span style="font-size: 0.6em; font-weight: 400; color: rgba(255, 255, 255, 0.6);">v1.1.1</span></h3>
            <div class="bot-browser-tabs">
                <button class="bot-browser-tab active" data-tab="bots">Bots</button>
                <button class="bot-browser-tab" data-tab="lorebooks">Lorebooks</button>
                <button class="bot-browser-tab" data-tab="collections">Collections</button>
                <button class="bot-browser-tab" data-tab="bookmarks">Bookmarks</button>
            </div>
            <button class="bot-browser-close" title="Close">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>

        <div class="bot-browser-tab-content active" data-content="bots">
            ${recentlyViewed.length > 0 ? `
            <div class="bot-browser-recently-viewed-section">
                <h4><i class="fa-solid fa-clock-rotate-left"></i> Recently Viewed</h4>
                <div class="bot-browser-recently-viewed-grid">
                    ${recentlyViewed.map(card => `
                        <div class="bot-browser-recent-card" data-card-id="${card.id}" data-nsfw="${card.possibleNsfw ? 'true' : 'false'}">
                            <div class="bot-browser-recent-image" style="background-image: url('${sanitizeImageUrl(card.avatar_url || '')}');"></div>
                            <div class="bot-browser-recent-name">${escapeHTML(card.name)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <div class="bot-browser-grid">
                <button class="bot-browser-source" data-source="all">
                    <div class="bot-browser-source-icon" style="background: linear-gradient(135deg, rgba(100, 100, 255, 0.3), rgba(150, 50, 200, 0.3)); display: flex; align-items: center; justify-content: center; font-size: 26px; color: rgba(255, 255, 255, 0.8);">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </div>
                    <span>Search All</span>
                </button>
                <button class="bot-browser-source" data-source="risuai_realm">
                    <div class="bot-browser-source-icon" style="background-image: url('https://files.catbox.moe/216rab.webp'); background-size: cover; background-position: center; background-repeat: no-repeat;"></div>
                    <span>Risuai Realm</span>
                </button>
                <button class="bot-browser-source" data-source="webring">
                    <div class="bot-browser-source-icon" style="background-image: url('https://files.catbox.moe/6avrsl.png'); background-size: 85%; background-position: center; background-repeat: no-repeat;"></div>
                    <span>Webring</span>
                </button>
                <button class="bot-browser-source" data-source="nyai_me">
                    <div class="bot-browser-source-icon" style="background-image: url('https://nyai.me/img/necologofavicon-64.png'); background-size: 85%; background-position: center; background-repeat: no-repeat;"></div>
                    <span>Nyai.me</span>
                </button>
                <button class="bot-browser-source" data-source="chub">
                    <div class="bot-browser-source-icon" style="background-image: url('https://avatars.charhub.io/icons/assets/full_logo.png'); background-size: cover; background-position: center; background-repeat: no-repeat; background-color: white;"></div>
                    <span>Chub</span>
                </button>
                <button class="bot-browser-source" data-source="character_tavern">
                    <div class="bot-browser-source-icon" style="background-image: url('https://character-tavern.com/_app/immutable/assets/logo.DGIlOnDO.png'); background-size: cover; background-position: center; background-repeat: no-repeat;"></div>
                    <span>Character Tavern</span>
                </button>
                <button class="bot-browser-source" data-source="catbox">
                    <div class="bot-browser-source-icon" style="background-image: url('https://catbox.tech/favicon128.png'); background-size: cover; background-position: center; background-repeat: no-repeat;"></div>
                    <span>Catbox</span>
                </button>
                <button class="bot-browser-source" data-source="anchorhold">
                    <div class="bot-browser-source-icon" style="background-image: url('https://assets.coingecko.com/coins/images/30124/large/4CHAN.png?1696529046'); background-size: 85%; background-position: center; background-repeat: no-repeat;"></div>
                    <span>4chan - /aicg/</span>
                </button>
                <button class="bot-browser-source" data-source="mlpchag">
                    <div class="bot-browser-source-icon" style="background-image: url('https://derpicdn.net/img/view/2015/9/26/988523__safe_solo_upvotes+galore_smiling_cute_derpy+hooves_looking+at+you_looking+up_part+of+a_set_derpibooru+exclusive.png'); background-size: cover; background-position: center; background-repeat: no-repeat;"></div>
                    <span>MLPchag</span>
                </button>
                <button class="bot-browser-source" data-source="desuarchive">
                    <div class="bot-browser-source-icon" style="background-image: url('https://s2.vndb.org/ch/32/17032.jpg'); background-size: cover; background-position: center; background-repeat: no-repeat;"></div>
                    <span>Desuarchive</span>
                </button>
                <button class="bot-browser-source" data-source="quillgen">
                    <div class="bot-browser-source-icon" style="background: linear-gradient(135deg, #1a1a2e, #16213e); display: flex; align-items: center; justify-content: center;">
                        <img src="https://quillgen.app/logo-dark.png"
                             alt="QuillGen"
                             style="max-width: 100%; max-height: 100%; display: block;">
                    </div>
                    <span>QuillGen.app</span>
                </button>
                <button class="bot-browser-source" data-source="jannyai">
                    <div class="bot-browser-source-icon" style="background-image: url('https://tse3.mm.bing.net/th/id/OIP.nb-qi0od9W6zRsskVwL6QAHaHa?rs=1&pid=ImgDetMain&o=7&rm=3'); background-size: cover; background-position: center; background-repeat: no-repeat;"></div>
                    <span>JannyAI</span>
                </button>
            </div>
        </div>

        <div class="bot-browser-tab-content" data-content="lorebooks">
            <div class="bot-browser-grid">
                <button class="bot-browser-source" data-source="chub_lorebooks">
                    <div class="bot-browser-source-icon" style="background-image: url('https://avatars.charhub.io/icons/assets/full_logo.png'); background-size: cover; background-position: center; background-repeat: no-repeat; background-color: white;"></div>
                    <span>Chub</span>
                </button>
            </div>
        </div>

        <div class="bot-browser-tab-content" data-content="bookmarks">
            <div class="bot-browser-bookmarks-container">
                <div class="bot-browser-bookmarks-empty">
                    <i class="fa-solid fa-bookmark"></i>
                    <p>No bookmarks yet</p>
                    <span>Click the bookmark icon on any card to save it here</span>
                </div>
                <div class="bot-browser-bookmarks-grid"></div>
            </div>
        </div>

        <div class="bot-browser-tab-content" data-content="collections">
            <div class="bot-browser-grid">
                <button class="bot-browser-source" data-source="jannyai_collections">
                    <div class="bot-browser-source-icon" style="background-image: url('https://tse3.mm.bing.net/th/id/OIP.nb-qi0od9W6zRsskVwL6QAHaHa?rs=1&pid=ImgDetMain&o=7&rm=3'); background-size: cover; background-position: center; background-repeat: no-repeat;"></div>
                    <span>JannyAI Collections</span>
                </button>
            </div>
        </div>
    `;
}

export function createBrowserHeader(serviceDisplayName, searchValue, cardCountText, searchCollapsed = false, hideNsfw = false, isLiveChub = false, advancedFilters = null, isJannyAI = false, jannyAdvancedFilters = null) {
    return `
        <div class="bot-browser-header-bar">
            <button class="bot-browser-back-button">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <h3>${serviceDisplayName}</h3>
            ${hideNsfw ? '<div class="bot-browser-nsfw-indicator" title="NSFW cards are hidden (change in settings)"><i class="fa-solid fa-eye-slash"></i> NSFW Hidden</div>' : ''}
            <button class="bot-browser-toggle-search" title="Toggle Search">
                <i class="fa-solid fa-chevron-${searchCollapsed ? 'down' : 'up'}"></i>
            </button>
            <button class="bot-browser-close">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>

        <div class="bot-browser-card-grid-wrapper">
            <div class="bot-browser-search-section${searchCollapsed ? ' collapsed' : ''}" id="bot-browser-search-section">
                <input type="text"
                   class="bot-browser-search-input"
                   placeholder="Search by name, description, creator, or tags (typo-tolerant)..."
                   value="${escapeHTML(searchValue)}">

            <div class="bot-browser-filters">
                <div class="bot-browser-filter-group">
                    <label>Tags:</label>
                    <div class="bot-browser-multi-select" id="bot-browser-tag-filter">
                        <div class="bot-browser-multi-select-trigger">
                            <span class="selected-text">All Tags</span>
                            <i class="fa-solid fa-chevron-down"></i>
                        </div>
                        <div class="bot-browser-multi-select-dropdown">
                            <div class="bot-browser-multi-select-search">
                                <input type="text" placeholder="Search tags...">
                            </div>
                            <div class="bot-browser-multi-select-options">
                                <!-- Options populated via JS -->
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bot-browser-filter-group">
                    <label>Creator:</label>
                    <div class="bot-browser-multi-select" id="bot-browser-creator-filter">
                        <div class="bot-browser-multi-select-trigger">
                            <span class="selected-text">All Creators</span>
                            <i class="fa-solid fa-chevron-down"></i>
                        </div>
                        <div class="bot-browser-multi-select-dropdown">
                            <div class="bot-browser-multi-select-search">
                                <input type="text" placeholder="Search creators...">
                            </div>
                            <div class="bot-browser-multi-select-options">
                                <!-- Options populated via JS -->
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bot-browser-filter-group">
                    <label>Sort by:</label>
                    <div class="bot-browser-multi-select bot-browser-sort-dropdown" id="bot-browser-sort-filter">
                        <div class="bot-browser-multi-select-trigger">
                            <span class="selected-text">Relevance</span>
                            <i class="fa-solid fa-chevron-down"></i>
                        </div>
                        <div class="bot-browser-multi-select-dropdown">
                            <div class="bot-browser-multi-select-options">
                                <div class="bot-browser-multi-select-option selected" data-value="relevance">
                                    <i class="fa-solid fa-check"></i>
                                    <span>Relevance</span>
                                </div>
                                <div class="bot-browser-multi-select-option" data-value="name_asc">
                                    <i class="fa-solid fa-check"></i>
                                    <span>Name (A-Z)</span>
                                </div>
                                <div class="bot-browser-multi-select-option" data-value="name_desc">
                                    <i class="fa-solid fa-check"></i>
                                    <span>Name (Z-A)</span>
                                </div>
                                <div class="bot-browser-multi-select-option" data-value="creator_asc">
                                    <i class="fa-solid fa-check"></i>
                                    <span>Creator (A-Z)</span>
                                </div>
                                <div class="bot-browser-multi-select-option" data-value="creator_desc">
                                    <i class="fa-solid fa-check"></i>
                                    <span>Creator (Z-A)</span>
                                </div>
                                <div class="bot-browser-multi-select-option" data-value="date_desc">
                                    <i class="fa-solid fa-check"></i>
                                    <span>Newest First</span>
                                </div>
                                <div class="bot-browser-multi-select-option" data-value="date_asc">
                                    <i class="fa-solid fa-check"></i>
                                    <span>Oldest First</span>
                                </div>
                                <div class="bot-browser-multi-select-option" data-value="tokens_desc">
                                    <i class="fa-solid fa-check"></i>
                                    <span>Most Tokens</span>
                                </div>
                                <div class="bot-browser-multi-select-option" data-value="tokens_asc">
                                    <i class="fa-solid fa-check"></i>
                                    <span>Least Tokens</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <button class="bot-browser-clear-filters">Clear Filters</button>
            </div>

            <div class="bot-browser-results-count">
                ${cardCountText}
            </div>

            ${isLiveChub ? `
            <div class="bot-browser-advanced-filters-section">
                <button class="bot-browser-toggle-advanced" type="button">
                    <i class="fa-solid fa-sliders"></i> Advanced Chub Filters
                    <i class="fa-solid fa-chevron-down toggle-icon"></i>
                </button>
                <div class="bot-browser-advanced-filters collapsed">
                    <div class="bot-browser-filter-row">
                        <div class="bot-browser-filter-group">
                            <label>Token Range:</label>
                            <div class="bot-browser-token-range">
                                <input type="number" class="bot-browser-min-tokens" placeholder="Min" min="0" value="${advancedFilters?.minTokens || ''}">
                                <span>-</span>
                                <input type="number" class="bot-browser-max-tokens" placeholder="Max" min="0" value="${advancedFilters?.maxTokens || ''}">
                            </div>
                        </div>
                        <div class="bot-browser-filter-group">
                            <label>Created Within:</label>
                            <div class="bot-browser-days-filter">
                                <input type="number" class="bot-browser-max-days" placeholder="Any" min="1" value="${advancedFilters?.maxDaysAgo || ''}">
                                <span>days</span>
                            </div>
                        </div>
                    </div>
                    <div class="bot-browser-filter-row">
                        <div class="bot-browser-filter-group full-width">
                            <label>Include Tags (comma-separated):</label>
                            <input type="text" class="bot-browser-custom-tags" placeholder="e.g., fantasy, romance, oc" value="${escapeHTML(advancedFilters?.customTags || '')}">
                        </div>
                    </div>
                    <div class="bot-browser-filter-row">
                        <div class="bot-browser-filter-group full-width">
                            <label>Exclude Tags:</label>
                            <input type="text" class="bot-browser-exclude-tags" placeholder="e.g., nsfl, gore" value="${escapeHTML(advancedFilters?.excludeTags || '')}">
                        </div>
                    </div>
                    <div class="bot-browser-filter-row">
                        <div class="bot-browser-filter-group">
                            <label>Creator Username:</label>
                            <input type="text" class="bot-browser-creator-input" placeholder="Any creator" value="${escapeHTML(advancedFilters?.creatorUsername || '')}">
                        </div>
                        <div class="bot-browser-filter-group">
                            <label>Min AI Rating:</label>
                            <select class="bot-browser-min-rating">
                                <option value="">Any</option>
                                <option value="1" ${advancedFilters?.minAiRating === 1 ? 'selected' : ''}>1+</option>
                                <option value="2" ${advancedFilters?.minAiRating === 2 ? 'selected' : ''}>2+</option>
                                <option value="3" ${advancedFilters?.minAiRating === 3 ? 'selected' : ''}>3+</option>
                                <option value="4" ${advancedFilters?.minAiRating === 4 ? 'selected' : ''}>4+</option>
                                <option value="5" ${advancedFilters?.minAiRating === 5 ? 'selected' : ''}>5</option>
                            </select>
                        </div>
                    </div>
                    <div class="bot-browser-filter-row">
                        <div class="bot-browser-requirements">
                            <label class="bot-browser-checkbox">
                                <input type="checkbox" class="bot-browser-require-examples" ${advancedFilters?.requireExamples ? 'checked' : ''}>
                                <span>Has Example Dialogues</span>
                            </label>
                            <label class="bot-browser-checkbox">
                                <input type="checkbox" class="bot-browser-require-lore" ${advancedFilters?.requireLore ? 'checked' : ''}>
                                <span>Has Lorebook</span>
                            </label>
                            <label class="bot-browser-checkbox">
                                <input type="checkbox" class="bot-browser-require-greetings" ${advancedFilters?.requireGreetings ? 'checked' : ''}>
                                <span>Has Alternate Greetings</span>
                            </label>
                        </div>
                    </div>
                    <button class="bot-browser-apply-advanced" type="button">Apply Filters</button>
                </div>
            </div>
            ` : ''}

            ${isJannyAI ? `
            <div class="bot-browser-advanced-filters-section">
                <button class="bot-browser-toggle-advanced-janny" type="button">
                    <i class="fa-solid fa-sliders"></i> Advanced JannyAI Filters
                    <i class="fa-solid fa-chevron-down toggle-icon"></i>
                </button>
                <div class="bot-browser-advanced-filters-janny collapsed">
                    <div class="bot-browser-filter-row">
                        <div class="bot-browser-filter-group">
                            <label>Token Range:</label>
                            <div class="bot-browser-token-range">
                                <input type="number" class="bot-browser-janny-min-tokens" placeholder="Min" min="0" value="${jannyAdvancedFilters?.minTokens || ''}">
                                <span>-</span>
                                <input type="number" class="bot-browser-janny-max-tokens" placeholder="Max" min="0" value="${jannyAdvancedFilters?.maxTokens || ''}">
                            </div>
                        </div>
                        <div class="bot-browser-filter-group">
                            <label class="bot-browser-checkbox">
                                <input type="checkbox" class="bot-browser-janny-hide-low-quality" ${jannyAdvancedFilters?.hideLowQuality ? 'checked' : ''}>
                                <span>Hide Low Quality (&lt;300 tokens)</span>
                            </label>
                        </div>
                    </div>
                    <button class="bot-browser-apply-advanced-janny" type="button">Apply Filters</button>
                </div>
            </div>
            ` : ''}
            </div>

            <div class="bot-browser-card-grid">
            </div>
        </div>
    `;
}

// Create collection card HTML for JannyAI collections
export function createCollectionCardHTML(collection) {
    const previewImages = collection.previewImages || [];
    const collectionName = escapeHTML(collection.name);
    const creatorName = collection.creator?.name ? escapeHTML(collection.creator.name) : '';
    const description = escapeHTML(collection.description || '').substring(0, 100);
    const characterCount = collection.characterCount || 0;
    const views = collection.views || 0;

    return `
        <div class="bot-browser-collection-card" data-collection-id="${collection.id}" data-collection-slug="${collection.slug}">
            <div class="bot-browser-collection-previews">
                ${previewImages.slice(0, 5).map(img => `
                    <img class="bot-browser-collection-preview-img" src="${sanitizeImageUrl(img)}" alt="preview" loading="lazy">
                `).join('')}
                ${previewImages.length === 0 ? '<i class="fa-solid fa-folder-open"></i>' : ''}
            </div>
            <div class="bot-browser-collection-info">
                <div class="bot-browser-collection-name">${collectionName}</div>
                <div class="bot-browser-collection-meta">
                    <span><i class="fa-solid fa-users"></i> ${characterCount}</span>
                    <span><i class="fa-solid fa-eye"></i> ${views.toLocaleString()}</span>
                </div>
                ${creatorName ? `<div class="bot-browser-collection-creator">by ${creatorName}</div>` : ''}
                ${description ? `<div class="bot-browser-collection-desc">${description}${collection.description?.length > 100 ? '...' : ''}</div>` : ''}
            </div>
        </div>
    `;
}

// Create collections browser header
export function createCollectionsBrowserHeader(sortBy = 'popular', cardCountText = '', searchCollapsed = false) {
    return `
        <div class="bot-browser-header-bar">
            <button class="bot-browser-back-button">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <h3>JannyAI Collections</h3>
            <button class="bot-browser-toggle-search" title="Toggle Search">
                <i class="fa-solid fa-chevron-${searchCollapsed ? 'down' : 'up'}"></i>
            </button>
            <button class="bot-browser-close">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>

        <div class="bot-browser-card-grid-wrapper">
            <div class="bot-browser-search-section${searchCollapsed ? ' collapsed' : ''}" id="bot-browser-search-section">
                <div class="bot-browser-filters">
                    <div class="bot-browser-filter-group">
                        <label>Sort by:</label>
                        <div class="bot-browser-multi-select bot-browser-sort-dropdown" id="bot-browser-collections-sort">
                            <div class="bot-browser-multi-select-trigger">
                                <span class="selected-text">${sortBy === 'popular' ? 'Most Popular' : 'Latest'}</span>
                                <i class="fa-solid fa-chevron-down"></i>
                            </div>
                            <div class="bot-browser-multi-select-dropdown">
                                <div class="bot-browser-multi-select-options">
                                    <div class="bot-browser-multi-select-option ${sortBy === 'popular' ? 'selected' : ''}" data-value="popular">
                                        <i class="fa-solid fa-check"></i>
                                        <span>Most Popular</span>
                                    </div>
                                    <div class="bot-browser-multi-select-option ${sortBy === 'new' ? 'selected' : ''}" data-value="new">
                                        <i class="fa-solid fa-check"></i>
                                        <span>Latest</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bot-browser-results-count">
                    ${cardCountText}
                </div>
            </div>

            <div class="bot-browser-card-grid bot-browser-collections-grid">
            </div>
        </div>
    `;
}

// Create bottom action buttons HTML
export function createBottomActions() {
    return `
        <button class="bot-browser-random" title="Random Card">
            <i class="fa-solid fa-dice"></i>
        </button>
        <button class="bot-browser-stats" title="View Stats">
            <i class="fa-solid fa-chart-bar"></i>
        </button>
        <button class="bot-browser-settings" title="Settings">
            <i class="fa-solid fa-gear"></i>
        </button>
    `;
}
