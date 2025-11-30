import { escapeCardTextFields, processLorebookEntries } from '../utils/textPreparation.js';
import { extractCardProperties, getLorebookInfo } from '../utils/utils.js';

export function prepareCardDataForModal(fullCard, isLorebook) {
    const extractedProperties = extractCardProperties(fullCard);
    const { tags, alternateGreetings, exampleMessages } = extractedProperties;

    const preparedText = escapeCardTextFields(fullCard, tags, alternateGreetings, exampleMessages);

    const { entries, entriesCount } = getLorebookInfo(fullCard, isLorebook);
    const processedEntries = processLorebookEntries(entries);

    return {
        ...extractedProperties,
        ...preparedText,
        isLorebook,
        processedEntries,
        entriesCount
    };
}
