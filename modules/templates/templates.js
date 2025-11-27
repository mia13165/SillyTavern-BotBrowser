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
    const cardCreator = escapeHTML(card.creator || 'Unknown');
    const isNsfw = card.possibleNsfw ? 'true' : 'false';

    return `
        <div class="bot-browser-card-thumbnail" data-card-id="${card.id}" data-nsfw="${isNsfw}">
            ${card.is_own ? '<div class="bot-browser-own-badge" title="Your character"><i class="fa-solid fa-user"></i></div>' : ''}
            <div class="bot-browser-card-image" style="background-image: url('${safeImageUrl}');">
                ${!safeImageUrl ? '<i class="fa-solid fa-user"></i>' : ''}
            </div>
            <div class="bot-browser-card-info">
                <div class="bot-browser-card-name">${cardName}</div>
                <div class="bot-browser-card-creator">${cardCreator}</div>

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
            <h3>Bot Browser <span style="font-size: 0.6em; font-weight: 400; color: rgba(255, 255, 255, 0.6);">v1.0.1</span></h3>
            <div class="bot-browser-tabs">
                <button class="bot-browser-tab active" data-tab="bots">Bots</button>
                <button class="bot-browser-tab" data-tab="lorebooks">Lorebooks</button>
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
                    <div class="bot-browser-source-icon" style="background-image: url('https://quillgen.app/logo-dark.png'); background-size: 85%; background-position: center; background-repeat: no-repeat;"></div>
                    <span>QuillGen.app</span>
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
    `;
}

export function createBrowserHeader(serviceDisplayName, searchValue, cardCountText, searchCollapsed = false, hideNsfw = false) {
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
                            </div>
                        </div>
                    </div>
                </div>

                <button class="bot-browser-clear-filters">Clear Filters</button>
            </div>

            <div class="bot-browser-results-count">
                ${cardCountText}
            </div>
        </div>

        <div class="bot-browser-card-grid-wrapper">
            <div class="bot-browser-card-grid">
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
