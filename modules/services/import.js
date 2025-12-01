// Import operations for Bot Browser extension
import { trackImport } from '../storage/stats.js';
import { closeDetailModal } from '../modals/detail.js';
import { importWorldInfo } from '../../../../../world-info.js';
import { default_avatar } from '../../../../../../script.js';
import { loadCardChunk } from '../services/cache.js';
import { fetchQuillgenCard } from '../services/quillgenApi.js';

// Import card to SillyTavern
export async function importCardToSillyTavern(card, extensionName, extension_settings, importStats, getRequestHeaders, processDroppedFiles) {
    console.log('[Bot Browser] Importing card:', card.name);

    try {
        // Detect if this is a lorebook or a character
        // Check for isLorebook flag (live Chub) or URL pattern (archive)
        const isLorebook = card.isLorebook || (card.service === 'chub' && card.id && card.id.includes('/lorebooks/'));

        if (isLorebook) {
            importStats = await importLorebook(card, extensionName, extension_settings, importStats, getRequestHeaders);
        } else {
            importStats = await importCharacter(card, extensionName, extension_settings, importStats, processDroppedFiles, getRequestHeaders);
        }

        // Close the detail modal after successful import
        closeDetailModal();

        return importStats;
    } catch (error) {
        console.error('[Bot Browser] Error importing card:', error);

        // Fallback: If image fetch fails due to CORS, try importing just the character data
        if (error.message.includes('CORS') || error.message.includes('tainted') || error.message.includes('Failed to load image')) {
            try {
                console.log('[Bot Browser] Image fetch failed, attempting JSON-only import');
                toastr.info('Image blocked by CORS. Importing character data without image...', card.name);
                await importCardAsJSON(card, getRequestHeaders);
                toastr.success(`${card.name} imported (without image)`, 'Character Imported', { timeOut: 3000 });

                // Track import
                importStats = trackImport(extensionName, extension_settings, importStats, card, 'character');

                closeDetailModal();
                return importStats;
            } catch (jsonError) {
                console.error('[Bot Browser] JSON fallback import failed:', jsonError);
                toastr.error('Failed to import card: ' + jsonError.message, 'Import Failed');
            }
        } else {
            toastr.error('Failed to import card: ' + error.message, 'Import Failed');
        }

        return importStats;
    }
}

// Import lorebook
async function importLorebook(card, extensionName, extension_settings, importStats, getRequestHeaders) {
    const request = await fetch('/api/content/importURL', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ url: card.id }),
    });

    if (!request.ok) {
        toastr.error(`Failed to import lorebook: ${request.statusText}`, 'Import Failed');
        console.error('Lorebook import failed', request.status, request.statusText);
        throw new Error(`Failed to import lorebook: ${request.statusText}`);
    }

    const lorebookData = await request.blob();

    // Create a file name
    const fileName = card.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';

    // Create a File object from the blob
    const file = new File([lorebookData], fileName, { type: 'application/json' });

    // Use SillyTavern's native importWorldInfo function
    // This properly updates the UI without requiring a page refresh
    await importWorldInfo(file);

    console.log('[Bot Browser] Lorebook imported successfully using importWorldInfo');

    // Track import
    return trackImport(extensionName, extension_settings, importStats, card, 'lorebook');
}

// Import character
async function importCharacter(card, extensionName, extension_settings, importStats, processDroppedFiles, getRequestHeaders) {
    // Handle live Chub cards - fetch full data from API first
    if (card.isLiveChub && card.fullPath) {
        console.log('[Bot Browser] Importing live Chub card:', card.fullPath);
        try {
            const { getChubCharacter, transformFullChubCharacter } = await import('./chubApi.js');
            const fullData = await getChubCharacter(card.fullPath);
            console.log('[Bot Browser] Fetched full Chub character data');

            // Merge the full data into the card
            if (fullData && fullData.node) {
                const fullCharData = transformFullChubCharacter(fullData);
                card = { ...card, ...fullCharData };
            }
        } catch (error) {
            console.warn('[Bot Browser] Failed to fetch full Chub data, using preview data:', error.message);
        }
    }

    // Handle JannyAI cards - avatar images don't have embedded character data
    if (card.isJannyAI || card.service === 'jannyai' || card.sourceService === 'jannyai') {
        console.log('[Bot Browser] Importing JannyAI card:', card.name);
        return await importJannyAICard(card, extensionName, extension_settings, importStats, processDroppedFiles);
    }

    // Determine which URL to use based on service
    let imageUrl;

    // RisuAI Realm cards need special handling - use image_url (the realm.risuai.net URL)
    if (card.service === 'risuai_realm' || card.sourceService === 'risuai_realm') {
        imageUrl = card.image_url;
    }
    // For Chub cards and cards with Chub avatars, prioritize avatar_url
    else if (card.service === 'chub' || card.sourceService === 'chub' || card.isLiveChub ||
             (card.avatar_url && (card.avatar_url.includes('charhub.io') || card.avatar_url.includes('characterhub.org') || card.avatar_url.includes('avatars.charhub.io')))) {
        imageUrl = card.avatar_url || card.image_url;
    }
    // For all other services, use avatar_url first
    else {
        imageUrl = card.avatar_url || card.image_url;
    }

    if (!imageUrl) {
        toastr.warning('No image URL found for this card');
        throw new Error('No image URL found');
    }

    let imageBlob;
    let use404Fallback = false;

    // Handle QuillGen cards - use auth header if API key is configured
    if (card.service === 'quillgen' || card.sourceService === 'quillgen') {
        console.log('[Bot Browser] Detected QuillGen card');
        imageBlob = await fetchQuillgenCard(card);
    }
    // Check if this is a realm.risuai.net card - handle different formats
    else if (imageUrl.includes('realm.risuai.net')) {
        console.log('[Bot Browser] Detected realm.risuai.net URL');
        console.log('[Bot Browser] imageUrl:', imageUrl);

        // Extract UUID from the URL (e.g., https://realm.risuai.net/character/6d0f6490-b2f6-4d81-8bfd-7b3c40e1c589)
        const uuidMatch = imageUrl.match(/\/character\/([a-f0-9-]+)/i);
        if (!uuidMatch) {
            throw new Error('Could not extract UUID from RisuAI URL');
        }
        const uuid = uuidMatch[1];
        console.log('[Bot Browser] Extracted UUID:', uuid);

        imageBlob = await importRisuAICard(uuid, card, getRequestHeaders);
    } else if (imageUrl.includes('charhub.io') || imageUrl.includes('characterhub.org') || imageUrl.includes('avatars.charhub.io')) {
        console.log('[Bot Browser] Detected Chub URL, fetching directly');
        console.log('[Bot Browser] Fetching from:', imageUrl);

        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            if (imageResponse.status === 404) {
                console.log('[Bot Browser] Image returned 404, will use fallback method');
                use404Fallback = true;
            } else {
                throw new Error(`Failed to fetch Chub image: ${imageResponse.statusText}`);
            }
        } else {
            imageBlob = await imageResponse.blob();
            console.log('[Bot Browser] ✓ Successfully fetched Chub image directly');
        }
    } else {
        // Fetch the image directly for other services (including Character Tavern)
        try {
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
                console.log(`[Bot Browser] Image returned ${imageResponse.status}, will use fallback method`);
                use404Fallback = true;
            } else {
                imageBlob = await imageResponse.blob();
            }
        } catch (error) {
            console.log('[Bot Browser] Failed to fetch image (network error), will use fallback method');
            use404Fallback = true;
        }
    }

    // If image fetch failed, fall back to creating card from chunk data with default avatar
    if (use404Fallback) {
        toastr.info('Image unavailable, importing from chunk data with default avatar...', '', { timeOut: 3000 });
        return await importFromChunkData(card, extensionName, extension_settings, importStats, processDroppedFiles, true);
    }

    // Check if the image is too small (likely stripped of character data)
    // A valid character card PNG should be at least a few KB
    const MIN_VALID_SIZE = 5000; // 5KB minimum
    if (imageBlob.size < MIN_VALID_SIZE) {
        console.log(`[Bot Browser] Image too small (${imageBlob.size} bytes), likely stripped of character data`);
        toastr.info('Image missing character data, importing from chunk data...', '', { timeOut: 3000 });
        return await importFromChunkData(card, extensionName, extension_settings, importStats, processDroppedFiles, false, imageBlob);
    }

    // Create a file name
    const fileName = card.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.png';

    // Create a File object
    const file = new File([imageBlob], fileName, { type: 'image/png' });

    // Import directly using processDroppedFiles
    await processDroppedFiles([file]);

    toastr.success(`${card.name} imported successfully!`, '', { timeOut: 2000 });
    console.log('[Bot Browser] Card imported successfully');

    // Track import
    return trackImport(extensionName, extension_settings, importStats, card, 'character');
}

// Import card from chunk data with default avatar (for 404 images) or original image (for stripped PNGs)
async function importFromChunkData(card, extensionName, extension_settings, importStats, processDroppedFiles, useDefaultAvatar = true, originalImageBlob = null) {
    console.log('[Bot Browser] Importing from chunk data', useDefaultAvatar ? 'with default avatar' : 'with original image');

    // Load full card data from chunk if available
    let fullCard = card;
    const serviceToUse = card.sourceService || card.service;

    if (card.chunk && serviceToUse) {
        try {
            const chunkData = await loadCardChunk(serviceToUse, card.chunk);
            if (chunkData && chunkData.length > 0) {
                // Find the matching card in chunk
                const chunkCard = chunkData.find(c =>
                    c.id === card.id ||
                    c.name === card.name ||
                    (c.image_url && c.image_url === card.image_url) ||
                    (c.avatar_url && c.avatar_url === card.avatar_url)
                );
                if (chunkCard) {
                    fullCard = { ...chunkCard, ...card };
                    console.log('[Bot Browser] ✓ Loaded full card data from chunk');
                } else {
                    console.log('[Bot Browser] Could not find exact match in chunk, using card at chunk_idx');
                    const fallbackCard = chunkData[card.chunk_idx];
                    if (fallbackCard) {
                        fullCard = { ...fallbackCard, ...card };
                    }
                }
            }
        } catch (error) {
            console.error('[Bot Browser] Failed to load chunk data:', error);
        }
    }

    // Convert to Character Card V2 format with all available data
    const characterData = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: fullCard.name || '',
            description: fullCard.description || '',
            personality: fullCard.personality || '',
            scenario: fullCard.scenario || '',
            first_mes: fullCard.first_message || '',
            mes_example: fullCard.example_messages || fullCard.mes_example || '',
            creator_notes: fullCard.website_description || '',
            system_prompt: '',
            post_history_instructions: '',
            creator: fullCard.creator || '',
            character_version: '',
            tags: fullCard.tags || [],
            alternate_greetings: fullCard.alternate_greetings || [],
            extensions: {
                talkativeness: '0.5',
                fav: false,
                world: '',
                depth_prompt: {
                    prompt: '',
                    depth: 4
                }
            }
        }
    };

    // Get the image to use (either default avatar or original image)
    let imageToUse;
    if (useDefaultAvatar) {
        const defaultAvatarResponse = await fetch(default_avatar);
        imageToUse = await defaultAvatarResponse.blob();
    } else {
        imageToUse = originalImageBlob;
    }

    // Encode character data as base64 to embed in PNG
    const jsonString = JSON.stringify(characterData);
    const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

    // Create PNG with embedded character data
    const pngBlob = await createCharacterPNG(imageToUse, base64Data);
    const fileName = fullCard.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.png';
    const file = new File([pngBlob], fileName, { type: 'image/png' });

    // Import the character
    await processDroppedFiles([file]);

    toastr.success(`${fullCard.name} imported successfully!`, '', { timeOut: 2000 });
    console.log('[Bot Browser] Card imported successfully from chunk data');

    // Track import
    return trackImport(extensionName, extension_settings, importStats, fullCard, 'character');
}

// Import JannyAI card - avatar images don't have embedded character data
async function importJannyAICard(card, extensionName, extension_settings, importStats, processDroppedFiles) {
    console.log('[Bot Browser] Importing JannyAI card with embedded data');

    // Convert to Character Card V2 format
    const characterData = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: card.name || '',
            description: card.description || '',
            personality: card.personality || '',
            scenario: card.scenario || '',
            first_mes: card.first_message || '',
            mes_example: card.mes_example || card.example_messages || '',
            creator_notes: card.website_description || card.creator_notes || '',
            system_prompt: card.system_prompt || '',
            post_history_instructions: card.post_history_instructions || '',
            creator: card.creator || '',
            character_version: card.character_version || '1.0',
            tags: card.tags || [],
            alternate_greetings: card.alternate_greetings || [],
            extensions: {
                talkativeness: '0.5',
                fav: false,
                world: '',
                depth_prompt: {
                    prompt: '',
                    depth: 4
                },
                jannyai: card.extensions?.jannyai || {}
            }
        }
    };

    console.log('[Bot Browser] JannyAI V2 card data:', characterData);

    // Get the avatar image
    let imageBlob;
    const imageUrl = card.avatar_url;

    if (imageUrl) {
        try {
            // Try fetching directly first
            let imageResponse = await fetch(imageUrl);

            if (!imageResponse.ok) {
                // Try with CORS proxy
                console.log('[Bot Browser] Direct fetch failed, trying CORS proxy...');
                const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(imageUrl)}`;
                imageResponse = await fetch(proxyUrl);
            }

            if (imageResponse.ok) {
                imageBlob = await imageResponse.blob();
                console.log('[Bot Browser] ✓ Fetched JannyAI avatar image');
            }
        } catch (error) {
            console.warn('[Bot Browser] Failed to fetch JannyAI avatar:', error);
        }
    }

    // If no image available, use default avatar
    if (!imageBlob) {
        console.log('[Bot Browser] Using default avatar for JannyAI card');
        const defaultAvatarResponse = await fetch(default_avatar);
        imageBlob = await defaultAvatarResponse.blob();
    }

    // Encode character data as base64 to embed in PNG
    const jsonString = JSON.stringify(characterData);
    const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

    // Create PNG with embedded character data
    const pngBlob = await createCharacterPNG(imageBlob, base64Data);
    const fileName = card.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.png';
    const file = new File([pngBlob], fileName, { type: 'image/png' });

    // Import the character
    await processDroppedFiles([file]);

    toastr.success(`${card.name} imported successfully!`, '', { timeOut: 2000 });
    console.log('[Bot Browser] JannyAI card imported successfully');

    // Track import
    return trackImport(extensionName, extension_settings, importStats, card, 'character');
}

// Import card as JSON (fallback when image fetch fails)
async function importCardAsJSON(card, getRequestHeaders) {
    // Convert to Character Card V2 format
    const characterData = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: card.name || '',
            description: card.description || '',
            personality: card.personality || '',
            scenario: card.scenario || '',
            first_mes: card.first_message || '',
            mes_example: card.example_messages || '',
            creator_notes: card.website_description || '',
            system_prompt: '',
            post_history_instructions: '',
            creator: card.creator || '',
            character_version: '',
            tags: card.tags || [],
            alternate_greetings: card.alternate_greetings || [],
            extensions: {
                talkativeness: '0.5',
                fav: false,
                world: '',
                depth_prompt: {
                    prompt: '',
                    depth: 4
                }
            }
        }
    };

    // Create JSON blob
    const jsonString = JSON.stringify(characterData);
    const jsonBlob = new Blob([jsonString], { type: 'application/json' });
    const jsonFileName = card.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
    const jsonFile = new File([jsonBlob], jsonFileName, { type: 'application/json' });

    // Import the JSON
    const formData = new FormData();
    formData.append('avatar', jsonFile);
    formData.append('file_type', 'json');
    formData.append('user_name', 'User');

    const response = await fetch('/api/characters/import', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Import failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.error) {
        throw new Error('Character import failed');
    }

    console.log('[Bot Browser] Character imported as JSON successfully');
}

// Import RisuAI card - get JSON data and convert to V2 format with embedding
async function importRisuAICard(uuid, card, getRequestHeaders) {
    console.log('[Bot Browser] Importing RisuAI card with UUID:', uuid);
    console.log('[Bot Browser] Card avatar_url:', card.avatar_url);

    // Step 1: Try JSON-v3 format (direct JSON, simplest)
    console.log('[Bot Browser] Trying JSON-v3...');
    const jsonUrl = `https://realm.risuai.net/api/v1/download/json-v3/${uuid}?non_commercial=true&cors=true`;

    try {
        const jsonRequest = await fetch(jsonUrl);

        if (jsonRequest.ok) {
            const cardData = await jsonRequest.json();
            console.log('[Bot Browser] ✓ Successfully downloaded JSON-v3');

            // Get image and embed card data
            return await embedRisuAICardData(cardData, card);
        }

        console.warn('[Bot Browser] JSON-v3 failed:', jsonRequest.status);
    } catch (error) {
        console.warn('[Bot Browser] JSON-v3 error:', error);
    }

    // Step 2: Try CharX-v3 format (ZIP with card.json)
    console.log('[Bot Browser] Trying CharX-v3...');
    const charxUrl = `https://realm.risuai.net/api/v1/download/charx-v3/${uuid}?non_commercial=true&cors=true`;

    try {
        const charxRequest = await fetch(charxUrl);

        if (charxRequest.ok) {
            const zipBlob = await charxRequest.blob();
            console.log('[Bot Browser] ✓ Successfully downloaded CharX-v3, extracting...');

            // Load JSZip if not already loaded
            if (typeof JSZip === 'undefined') {
                console.log('[Bot Browser] Loading JSZip library...');
                await import('../../../../../../lib/jszip.min.js');
            }

            // Extract card.json from ZIP
            const zip = await JSZip.loadAsync(zipBlob);
            const cardJsonFile = zip.file('card.json');
            if (!cardJsonFile) {
                throw new Error('card.json not found in CharX ZIP');
            }

            const cardJsonText = await cardJsonFile.async('text');
            const cardData = JSON.parse(cardJsonText);
            console.log('[Bot Browser] ✓ Extracted card.json from CharX');

            // Get image and embed card data (pass the original card for avatar_url)
            return await embedRisuAICardData(cardData, card);
        }

        const errorText = await charxRequest.text();
        console.error('[Bot Browser] CharX-v3 failed:', charxRequest.status, errorText);
        throw new Error(`All RisuAI format downloads failed. CharX-v3 error: ${charxRequest.statusText}`);
    } catch (error) {
        console.error('[Bot Browser] All RisuAI formats failed');
        throw new Error(`Failed to import RisuAI card: JSON-v3 failed, CharX-v3 failed. This card may not be available for download.`);
    }
}

// Embed RisuAI card data into PNG image (client-side)
async function embedRisuAICardData(cardData, originalCard = null) {
    console.log('[Bot Browser] Embedding card data into PNG...');
    console.log('[Bot Browser] RisuAI card data:', cardData);

    // Convert RisuAI format to SillyTavern Character Card V2 format
    const v2CardData = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: cardData.name || cardData.data?.name || '',
            description: cardData.description || cardData.data?.description || '',
            personality: cardData.personality || cardData.data?.personality || '',
            scenario: cardData.scenario || cardData.data?.scenario || '',
            first_mes: cardData.firstMessage || cardData.first_mes || cardData.data?.first_mes || '',
            mes_example: cardData.exampleMessage || cardData.mes_example || cardData.data?.mes_example || '',
            creator_notes: '',
            system_prompt: cardData.systemPrompt || cardData.system_prompt || cardData.data?.system_prompt || '',
            post_history_instructions: cardData.postHistoryInstructions || cardData.post_history_instructions || cardData.data?.post_history_instructions || '',
            creator: cardData.creator || cardData.data?.creator || '',
            character_version: cardData.characterVersion || cardData.character_version || cardData.data?.character_version || '',
            tags: cardData.tags || cardData.data?.tags || [],
            alternate_greetings: cardData.alternateGreetings || cardData.alternate_greetings || cardData.data?.alternate_greetings || [],
            extensions: cardData.extensions || cardData.data?.extensions || {
                talkativeness: '0.5',
                fav: false,
                world: '',
                depth_prompt: {
                    prompt: '',
                    depth: 4
                }
            }
        }
    };

    console.log('[Bot Browser] Converted to V2 format:', v2CardData);

    // Use the avatar_url from the original card (from browser)
    let imageUrl = originalCard?.avatar_url;

    if (!imageUrl) {
        console.error('[Bot Browser] No avatar_url found in original card');
        throw new Error('Could not find avatar URL for RisuAI card');
    }

    console.log('[Bot Browser] Fetching image from avatar_url:', imageUrl);

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    const imageBlob = await imageResponse.blob();
    console.log('[Bot Browser] Image type:', imageBlob.type);

    // Convert image to PNG if it's not already PNG
    let imageBytes;
    if (imageBlob.type === 'image/png') {
        const imageArrayBuffer = await imageBlob.arrayBuffer();
        imageBytes = new Uint8Array(imageArrayBuffer);
    } else {
        console.log('[Bot Browser] Converting image to PNG...');
        imageBytes = await convertImageToPNG(imageBlob);
    }

    // Embed the V2 character data into the PNG
    const characterJsonString = JSON.stringify(v2CardData);
    const base64EncodedData = btoa(unescape(encodeURIComponent(characterJsonString)));

    const embeddedPngBytes = insertPngTextChunk(imageBytes, 'chara', base64EncodedData);

    console.log('[Bot Browser] ✓ Successfully embedded card data');
    return new Blob([embeddedPngBytes], { type: 'image/png' });
}

// Insert a tEXt chunk into a PNG file
function insertPngTextChunk(pngBytes, keyword, text) {
    // PNG signature
    const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    // Verify PNG signature
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (pngBytes[i] !== PNG_SIGNATURE[i]) {
            throw new Error('Not a valid PNG file');
        }
    }

    // Find the position to insert the tEXt chunk (after IHDR, before IDAT)
    let insertPos = 8; // After PNG signature
    let foundIHDR = false;

    while (insertPos < pngBytes.length) {
        const chunkLength = (pngBytes[insertPos] << 24) | (pngBytes[insertPos + 1] << 16) |
                          (pngBytes[insertPos + 2] << 8) | pngBytes[insertPos + 3];
        const chunkType = String.fromCharCode(...pngBytes.slice(insertPos + 4, insertPos + 8));

        if (chunkType === 'IHDR') {
            foundIHDR = true;
            // Move past this chunk
            insertPos += 12 + chunkLength; // 4 (length) + 4 (type) + data + 4 (CRC)
        } else if (foundIHDR && chunkType === 'IDAT') {
            // Insert before the first IDAT chunk
            break;
        } else {
            // Move past this chunk
            insertPos += 12 + chunkLength;
        }
    }

    // Create the tEXt chunk
    const keywordBytes = new TextEncoder().encode(keyword);
    const textBytes = new TextEncoder().encode(text);
    const chunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
    chunkData.set(keywordBytes, 0);
    chunkData[keywordBytes.length] = 0; // Null separator
    chunkData.set(textBytes, keywordBytes.length + 1);

    // Calculate CRC32 for the chunk
    const chunkType = new TextEncoder().encode('tEXt');
    const crcData = new Uint8Array(chunkType.length + chunkData.length);
    crcData.set(chunkType, 0);
    crcData.set(chunkData, chunkType.length);
    const crc = calculateCRC32(crcData);

    // Build the chunk: length + type + data + CRC
    const chunk = new Uint8Array(12 + chunkData.length);
    // Length (4 bytes, big-endian)
    chunk[0] = (chunkData.length >> 24) & 0xFF;
    chunk[1] = (chunkData.length >> 16) & 0xFF;
    chunk[2] = (chunkData.length >> 8) & 0xFF;
    chunk[3] = chunkData.length & 0xFF;
    // Type (4 bytes)
    chunk.set(chunkType, 4);
    // Data
    chunk.set(chunkData, 8);
    // CRC (4 bytes, big-endian)
    chunk[8 + chunkData.length] = (crc >> 24) & 0xFF;
    chunk[8 + chunkData.length + 1] = (crc >> 16) & 0xFF;
    chunk[8 + chunkData.length + 2] = (crc >> 8) & 0xFF;
    chunk[8 + chunkData.length + 3] = crc & 0xFF;

    // Combine: original PNG up to insert position + new chunk + rest of PNG
    const result = new Uint8Array(pngBytes.length + chunk.length);
    result.set(pngBytes.slice(0, insertPos), 0);
    result.set(chunk, insertPos);
    result.set(pngBytes.slice(insertPos), insertPos + chunk.length);

    return result;
}

// Calculate CRC32 checksum
function calculateCRC32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc = crc ^ data[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = (crc >>> 1) ^ 0xEDB88320;
            } else {
                crc = crc >>> 1;
            }
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Convert any image format to PNG using Canvas
async function convertImageToPNG(imageBlob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(imageBlob);

        img.onload = () => {
            try {
                // Create canvas with image dimensions
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                // Convert canvas to PNG blob
                canvas.toBlob(async (blob) => {
                    URL.revokeObjectURL(url);
                    const arrayBuffer = await blob.arrayBuffer();
                    resolve(new Uint8Array(arrayBuffer));
                }, 'image/png');
            } catch (error) {
                URL.revokeObjectURL(url);
                reject(error);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

// Create a PNG with embedded character data
async function createCharacterPNG(imageBlob, base64Data) {
    // Convert image to PNG if needed
    const pngBytes = await convertImageToPNG(imageBlob);

    // Embed the character data as tEXt chunk
    const pngWithData = insertPngTextChunk(pngBytes, 'chara', base64Data);

    // Convert back to Blob
    return new Blob([pngWithData], { type: 'image/png' });
}
