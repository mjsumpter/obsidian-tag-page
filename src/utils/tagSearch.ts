import { App, TFile, Vault } from 'obsidian';
import { PluginSettings, TagInfo } from '../types';
import { isTagPage } from './obsidianApi';

/**
 * Determines if the given tag contains a wildcard (`/*`) at the end and returns the cleaned tag.
 *
 * @param {string} tag - The tag to check for a wildcard.
 * @returns {Object} An object containing:
 *  - `isWildCard`: A boolean indicating whether the tag ends with a wildcard.
 *  - `cleanedTag`: The original tag without the wildcard (if it existed).
 *
 * @example
 * const result = getIsWildCard("#some-tag/*");
 * // result.isWildCard will be true
 * // result.cleanedTag will be "#some-tag"
 */
export const getIsWildCard = (
	tag: string,
): {
	isWildCard: boolean;
	cleanedTag: string;
} => {
	const isWildCard = tag.endsWith('/*');
	const cleanedTag = isWildCard ? tag.slice(0, -2) : tag;
	return { isWildCard, cleanedTag };
};

/**
 * Checks if a given string contains a specific tag.
 *
 * @param {string} stringToSearch - The string to search within.
 * @param {string} tag - The tag to look for.
 * @returns {boolean} - Whether the string contains the tag.
 */
export const containsTag = (stringToSearch: string, tag: string): boolean => {
	const { isWildCard, cleanedTag } = getIsWildCard(tag);

	// Convert both stringToSearch and cleanedTag to the same case
	const lowerStringToSearch = stringToSearch.toLowerCase();
	const lowerCleanedTag = cleanedTag.toLowerCase();

	if (isWildCard) {
		return lowerStringToSearch.includes(lowerCleanedTag);
	} else {
		// Use 'i' flag in RegExp for case-insensitive matching
		const regex = new RegExp(`${lowerCleanedTag}\\s`, 'gi');
		return regex.test(lowerStringToSearch);
	}
};

/**
 * Searches through text content to find the smallest units (sentences or lines) containing a specified tag
 * and organizes the matches into a Map. The Map's keys represent each unique tag that was matched, and the
 * values are arrays of strings containing those tags. This function supports both exact tags and wildcard tags.
 * Wildcard tags are denoted by an asterisk (*) and match any subsequent characters.
 *
 * @param {string} content - The content to search within for tags.
 * @param {string} tag - The tag to search for. Can be an exact tag or a wildcard tag (e.g., "#tag" or "#tag/*").
 * @param {boolean} [excludeBullets=false] - Determines whether to exclude bullet points from the search. If true,
 *                                           lines starting with "-" are ignored.
 * @returns {Map<string, string[]>} A Map where each key is a distinct tag matched, and each value is an array of
 *                                  strings (lines or sentences) that contain that tag. For wildcard tags, each
 *                                  unique continuation of the tag is treated as a separate key.
 */
export const findSmallestUnitsContainingTag = (
	content: string,
	tag: string,
	excludeBullets = false,
): Map<string, string[]> => {
	const { isWildCard, cleanedTag } = getIsWildCard(tag);
	const escapedSubstring = cleanedTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const wildcardPattern = isWildCard ? '(?:\\/[^\\s]*)?' : '';

	// Filter out bullet points early if excludeBullets is true
	const contentLines = content
		.split('\n')
		.filter((line) => !(excludeBullets && line.trim().startsWith('-')));

	const matchesMap: Map<string, string[]> = new Map();

	contentLines.forEach((line) => {
		const regex = new RegExp(`${escapedSubstring}${wildcardPattern}`, 'gi');

		const matches = [...line.matchAll(regex)];
		matches.forEach((match) => {
			let key = match[0].toLowerCase();
			// Adjust the key for wildcard matches
			if (isWildCard && key.endsWith('/*')) {
				key = key.slice(0, -2);
			}

			// Ensure the key exists in the map, then add or skip the line
			if (!matchesMap.has(key)) {
				matchesMap.set(key, [line.trim()]);
			} else {
				// Retrieve the existing array with a non-null assertion since we know it exists
				const existingLines = matchesMap.get(key)!;
				if (!existingLines.includes(line.trim())) {
					existingLines.push(line.trim());
				}
			}
		});
	});

	return matchesMap;
};

/**
 * Identifies bullet points within text content that contain a specific tag and organizes them into a Map.
 * The Map's keys represent each unique tag found, and the values are arrays of bullet lists (or individual bullet points)
 * that contain those tags. This function supports both exact and wildcard tags, with wildcard tags matching any
 * continuation of the tag pattern.
 *
 * @param {string} content - The text content to be searched.
 * @param {string} tag - The tag to look for within the bullet points. Can be a regular tag (e.g., "#example")
 *                       or a wildcard tag (e.g., "#example/*") to match more broadly.
 * @returns {Map<string, string[]>} A Map where each key is a unique tag that was matched within bullet points, and
 *                                  each value is an array of the bullet points (as strings) containing that tag.
 *                                  For wildcard tags, each unique tag variation found is treated as a separate key,
 *                                  capturing the specific bullet points associated with that variation.
 * @description This function parses through each line of the given content, focusing on lines that start with
 *              a bullet point ("- "). It checks these lines (and their sub-bullets, maintaining indentation for
 *              hierarchical structure) for the presence of the specified tag(s). Matches are then organized into
 *              the returned Map, allowing for easy retrieval of bullet points by their associated tags.
 */
export const findBulletListsContainingTag = (
	content: string,
	tag: string,
): Map<string, string[]> => {
	const capturedBulletLists: Map<string, string[]> = new Map();
	const fileLines = content.split('\n').filter((line) => line.trim() !== '');

	let currentBulletIndentation = 0;
	const lastTagsAtCurrentIndentation: Set<string> = new Set();
	let capturingSubBullet = false;

	fileLines.forEach((line) => {
		const lineTrim = line.trim();
		const startsWithBullet = lineTrim.startsWith('- ');
		const lineIndentation = line.search(/\S/);
		if (startsWithBullet) {
			const { isWildCard, cleanedTag } = getIsWildCard(tag);
			// Adjusted to use a more inclusive regex pattern for wildcard matches.
			// Also captures the base tag for wildcard searches.
			const tagRegex = isWildCard
				? `${cleanedTag}(/[^\\s]+)?`
				: `${cleanedTag}(?![^\\s])`;
			const regex = new RegExp(tagRegex, 'gi');
			const matches = line.match(regex);

			if (
				startsWithBullet &&
				(matches || lineIndentation <= currentBulletIndentation)
			) {
				capturingSubBullet = false; // Reset for new bullet points or higher level bullets
				currentBulletIndentation = lineIndentation;
				lastTagsAtCurrentIndentation.clear();
			}

			if (matches) {
				capturingSubBullet = false; // This line contains a tag; not a sub-bullet for indentation
				matches.forEach((match) => {
					const trimmedMatch =
						isWildCard && match.endsWith('/')
							? match.slice(0, -1)
							: match;
					const trimmedMatchLowerCase = trimmedMatch.toLowerCase();
					if (!capturedBulletLists.has(trimmedMatchLowerCase)) {
						capturedBulletLists.set(trimmedMatchLowerCase, []);
					}
					capturedBulletLists
						.get(trimmedMatchLowerCase)
						?.push(
							lineIndentation > currentBulletIndentation &&
								capturingSubBullet
								? line
								: lineTrim,
						);
					lastTagsAtCurrentIndentation.add(trimmedMatchLowerCase);
				});
			} else if (
				lineIndentation > currentBulletIndentation &&
				lastTagsAtCurrentIndentation.size > 0
			) {
				capturingSubBullet = true; // This line is a sub-bullet; add it with indentation
				lastTagsAtCurrentIndentation.forEach((tag) => {
					capturedBulletLists.get(tag)?.push(line); // Preserve indentation for sub-bullets
				});
			}
		}
	});

	return capturedBulletLists;
};

/**
 * Consolidates tag matches from two sources into a single TagInfo object, with support for
 * handling cases where either, both, or none of the sources are provided.
 * Each TagMatchDetail contains a string containing the tag and a file link.
 *
 * @param {string} fileLink - The file link to be associated with each tag match.
 * @param {Map<string, string[]>?} unitsContainingTag - Optional. The map of tags to strings from findSmallestUnitsContainingTag.
 * @param {Map<string, string[]>?} bulletListsContainingTag - Optional. The map of tags to bullet lists from findBulletListsContainingTag.
 * @returns {TagInfo} A map of tags to arrays of TagMatchDetail objects.
 */
function consolidateTagInfo(
	fileLink: string,
	unitsContainingTag?: Map<string, string[]>,
	bulletListsContainingTag?: Map<string, string[]>,
): TagInfo {
	const consolidatedInfo: TagInfo = new Map();

	// Helper function to add tag matches to the consolidated map
	const addMatchesToConsolidatedInfo = (tag: string, matches: string[]) => {
		const existingMatches = consolidatedInfo.get(tag) || [];
		const newMatches = matches.map((matchString) => ({
			stringContainingTag: matchString,
			fileLink: fileLink,
		}));
		consolidatedInfo.set(tag, existingMatches.concat(newMatches));
	};

	// Process matches from findSmallestUnitsContainingTag if provided
	unitsContainingTag?.forEach((matches, tag) => {
		addMatchesToConsolidatedInfo(tag, matches);
	});

	// Process matches from findBulletListsContainingTag if provided
	bulletListsContainingTag?.forEach((matches, tag) => {
		addMatchesToConsolidatedInfo(tag, matches);
	});

	return consolidatedInfo;
}

/**
 * Processes a file to collect information about tags.
 *
 * @param {Vault} vault - The Obsidian vault.
 * @param {PluginSettings} settings - Plugin settings.
 * @param {TFile} file - The file to process.
 * @param {string} tagOfInterest - The tag to search for.
 * @returns {Promise<TagInfo[]>} - Information about the tags found.
 */
export const processFile = async (
	vault: Vault,
	settings: PluginSettings,
	file: TFile,
	tagOfInterest: string,
): Promise<TagInfo> => {
	const fileContents = await vault.cachedRead(file);
	if (!containsTag(fileContents, tagOfInterest)) return new Map();

	switch (true) {
		case settings.bulletedSubItems && settings.includeLines:
			return consolidateTagInfo(
				`[[${file.basename}]]`,
				findSmallestUnitsContainingTag(
					fileContents,
					tagOfInterest,
					true,
				),
				findBulletListsContainingTag(fileContents, tagOfInterest),
			);
		case settings.bulletedSubItems && !settings.includeLines:
			return consolidateTagInfo(
				`[[${file.basename}]]`,
				undefined,
				findBulletListsContainingTag(fileContents, tagOfInterest),
			);
		case !settings.bulletedSubItems && settings.includeLines:
		default:
			return consolidateTagInfo(
				`[[${file.basename}]]`,
				findSmallestUnitsContainingTag(
					fileContents,
					tagOfInterest,
					false,
				),
				undefined,
			);
	}
};

/**
 * Fetches data for a specific tag across all files in a vault.
 *
 * @param {App} app - The Obsidian App instance.
 * @param {PluginSettings} settings - Plugin settings.
 * @param {string} tagOfInterest - The tag to search for.
 * @returns {Promise<TagInfo[]>} - Information about the tags found.
 */
export const fetchTagData = async (
	app: App,
	settings: PluginSettings,
	tagOfInterest: string,
): Promise<TagInfo> => {
	// Search for all pages with this tag
	const vault = app.vault;
	const allFiles = vault.getMarkdownFiles();
	return await Promise.all(
		allFiles
			.filter(
				(file) =>
					!isTagPage(app, settings.frontmatterQueryProperty, file),
			)
			.map((file) => processFile(vault, settings, file, tagOfInterest)),
	).then((tagInfos) => {
		const consolidatedTagInfo: TagInfo = new Map();

		tagInfos.forEach((tagInfo) => {
			tagInfo.forEach((details, tag) => {
				// Ensure existingDetails is never undefined by providing a default value if the key doesn't exist
				const existingDetails = consolidatedTagInfo.get(tag) || [];
				consolidatedTagInfo.set(tag, existingDetails.concat(details));
			});
		});

		return consolidatedTagInfo;
	});
};
