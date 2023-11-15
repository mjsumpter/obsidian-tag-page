import { App, TFile, Vault } from 'obsidian';
import { PluginSettings, TagInfo } from '../types';
import { isTagPage } from './obsidianApi';

/**
 * Checks if the indentation of a line is greater than a threshold.
 *
 * @param {string} line - The line to check.
 * @param {number} threshold - The indentation threshold.
 * @returns {boolean} - Whether the line is indented more than the threshold.
 */
export const isIndentationGreater = (
	line: string,
	threshold: number,
): boolean => {
	return line.search(/\S/) > threshold;
};

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
 * Finds the smallest units (sentences or lines) containing a given tag in a text content.
 *
 * @param {string} content - The content to search within.
 * @param {string} tag - The tag to search for.
 * @param {boolean} [excludeBullets=false] - Whether to exclude bullet points.
 * @returns {string[]} - The matching sentences or lines.
 */
export const findSmallestUnitsContainingTag = (
	content: string,
	tag: string,
	excludeBullets: boolean = false,
): string[] => {
	// Check if tag has the wildcard /* at the end
	const { isWildCard, cleanedTag } = getIsWildCard(tag);

	// Escape special characters for use in regex
	const escapedSubstring = cleanedTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	// Add a wildcard pattern if needed
	const wildcardPattern = isWildCard ? '(?:\\/[^\\s.!?\\n]*)?' : '';

	// If excludeBullets is false, don't include the (?!- ) part in the regex.
	const exclusionPattern = excludeBullets ? '(?!\\s*- )' : '';

	// Regular expression to match the smallest unit containing the substring.
	const regex = new RegExp(
		`(?<=^|[\n.!?])${exclusionPattern}[^.!?\\n]*?${escapedSubstring}${wildcardPattern}[^.!?\\n]*?(?:[.!?\\n]|$)`,
		'gmi',
	);

	const matches: string[] = [];
	let match: RegExpExecArray | null;

	// Loop through all matches
	while ((match = regex.exec(content)) !== null) {
		matches.push(match[0].trim());
	}

	return matches.length > 0 ? matches : [];
};

/**
 * Finds bullet lists containing a specific tag in a text content.
 *
 * @param {string} content - The content to search within.
 * @param {string} tag - The tag to look for.
 * @returns {string[]} - The bullet lists containing the tag.
 */
export const findBulletListsContainingTag = (
	content: string,
	tag: string,
): string[] => {
	const capturedBulletLists: string[] = [];
	const fileLines = content
		.split('\n')
		// Remove empty lines
		.filter((l) => l.trim() !== '');

	let capturingContent = false;
	let currentBulletIndentation = 0;
	let currentBulletContent: string[] = [];

	for (const line of fileLines) {
		const hasTag = containsTag(line, tag);
		if (!hasTag && !capturingContent) continue;

		const lineTrim = line.trim();
		const startsWithBullet = lineTrim.startsWith('- ');

		switch (true) {
			case startsWithBullet && hasTag:
				// Check if line has bullet point and tag
				// If we're not inside a bullet sub-tree, then this is the start of a new bullet
				capturingContent = true;
				currentBulletContent.push(lineTrim);
				currentBulletIndentation = line.search(/\S/);
				break;
			case capturingContent &&
				isIndentationGreater(line, currentBulletIndentation):
				// If we're inside a bullet and the current line has more indentation than the current bullet,
				// then it's considered a sub-bullet

				// Extract the exact indentation characters (could be spaces or tabs)
				const indentationCharacters = line.substring(
					0,
					line.search(/\S/) - currentBulletIndentation,
				);

				// Push the sub-bullet with the relative indentation preserved
				currentBulletContent.push(indentationCharacters + lineTrim);
				break;
			case capturingContent:
				// If we were capturing content but no longer on a valid bullet
				// then capture the content and reset
				capturedBulletLists.push(currentBulletContent.join('\n'));
				capturingContent = false;
				currentBulletContent = [];
				break;
		}
	}

	// final check to see if we were capturing content when we reached the end of the file
	if (capturingContent)
		capturedBulletLists.push(currentBulletContent.join('\n'));

	return capturedBulletLists;
};

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
): Promise<TagInfo[]> => {
	const tagInfos: TagInfo[] = [];

	const fileContents = await vault.cachedRead(file);
	if (!containsTag(fileContents, tagOfInterest)) return tagInfos;

	switch (true) {
		case settings.bulletedSubItems && settings.includeLines:
			tagInfos.push({
				fileLink: `[[${file.basename}|*]]`,
				tagMatches: [
					...findSmallestUnitsContainingTag(
						fileContents,
						tagOfInterest,
						true,
					),
					...findBulletListsContainingTag(
						fileContents,
						tagOfInterest,
					),
				],
			});
			break;
		case settings.bulletedSubItems && !settings.includeLines:
			tagInfos.push({
				fileLink: `[[${file.basename}|*]]`,
				tagMatches: findBulletListsContainingTag(
					fileContents,
					tagOfInterest,
				),
			});
			break;
		case !settings.bulletedSubItems && settings.includeLines:
		default:
			tagInfos.push({
				fileLink: `[[${file.basename}|*]]`,
				tagMatches: findSmallestUnitsContainingTag(
					fileContents,
					tagOfInterest,
					false,
				),
			});
	}
	return tagInfos;
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
): Promise<TagInfo[]> => {
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
	).then((tagInfos) => tagInfos.flat());
};
