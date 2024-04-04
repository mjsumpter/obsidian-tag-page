import { App, MarkdownView } from 'obsidian';
import { PluginSettings, TagInfo, TagMatchDetail } from '../types';
import { getIsWildCard } from './tagSearch';

/**
 * Type definition for a function that generates content for a tag page.
 *
 * @typedef {Function} GenerateTagPageContentFn
 * @param {App} app - The Obsidian App instance.
 * @param {PluginSettings} settings - The plugin settings.
 * @param {TagInfo[]} tagsInfo - Information about tags.
 * @param {string} tagOfInterest - The tag for which the page is being generated.
 * @returns {Promise<string>} - The content to be set in the tag page.
 */
export type GenerateTagPageContentFn = (
	app: App,
	settings: PluginSettings,
	tagsInfo: TagInfo[],
	tagOfInterest: string
) => Promise<string>;

/**
 * Generates the content for a tag page.
 *
 * @param {App} app - The Obsidian App instance.
 * @param {PluginSettings} settings - The plugin settings.
 * @param {TagInfo[]} tagsInfo - Information about tags.
 * @param {string} tagOfInterest - The tag for which the page is being generated.
 * @returns {Promise<string>} - The content to be set in the tag page.
 */
export const generateTagPageContent: GenerateTagPageContentFn = async (
	app: App,
	settings: PluginSettings,
	tagsInfo: TagInfo[],
	tagOfInterest: string
): Promise<string> => {
	// Generate list of links to files with this tag
	const tagPageContent: string[] = [];
	tagPageContent.push(
		`---\n${settings.frontmatterQueryProperty}: "${tagOfInterest}"\n---`
	);
	tagPageContent.push(`## Tag Content for ${tagOfInterest.replace('*', '')}`);

	const groupedTags = groupByTagWithDetails(tagsInfo, tagOfInterest);
	// Check if we have more than one baseTag across all tagInfos
	if (groupedTags.size > 1) {
		// Iterate through each group of tags, adding a subheader for each baseTag
		groupedTags.forEach((details, baseTag) => {
			// Add a subheader for the baseTag
			tagPageContent.push(`### ${baseTag}`);

			// Process each tagMatch detail in this group
			details.forEach(({ stringContainingTag, fileLink }) => {
				processTagMatch(stringContainingTag, fileLink, baseTag, tagPageContent);
			});
		});
	} else {
		// If there's only one baseTag, process all tagMatches normally without subheaders
		groupedTags.forEach((details) => {
			details.forEach(({ stringContainingTag, fileLink }) => {
				// Assuming there's only one baseTag, we can directly use the first (and only) key of groupedTags
				const baseTag = groupedTags.keys().next().value;
				processTagMatch(stringContainingTag, fileLink, baseTag, tagPageContent);
			});
		});
	}

	// Add Files with tag in frontmatter
	const filesWithFrontmatterTag = app.vault
		.getMarkdownFiles()
		.filter((file) => {
			const metaMatter = app.metadataCache.getFileCache(file)?.frontmatter;
			return metaMatter?.tags
				? matchesTagOfInterest(metaMatter.tags, tagOfInterest)
				: false;
		})
		.map((file) => `- [[${file.basename}]]`);
	if (filesWithFrontmatterTag.length > 0) {
		const {cleanedTag} = getIsWildCard(tagOfInterest)
		tagPageContent.push(`## Files with ${cleanedTag} in frontmatter`);
		tagPageContent.push(...filesWithFrontmatterTag);
	}
	return tagPageContent.join('\n');
};

/**
 * Extracts the value of a frontmatter property from the current view's file.
 *
 * @param {App} app - The Obsidian App instance.
 * @param {MarkdownView} view - The Markdown view to extract frontmatter from.
 * @param {string} frontMatterTag - The frontmatter property to look for.
 * @returns {string | undefined} - The value of the frontmatter property, or undefined if not found.
 */
export const extractFrontMatterTagValue = (
	app: App,
	view: MarkdownView,
	frontMatterTag: string
): string | undefined => {
	if (view.file) {
		try {
			const metaMatter = app.metadataCache.getFileCache(view.file)
				?.frontmatter;

			return metaMatter?.[frontMatterTag];
		} catch (err) {
			console.log(err);
			return;
		}
	}
};

/**
 * Groups strings by specific tag variations from an array of TagInfo objects.
 * Each string is already confirmed to contain the tag of interest.
 *
 * @param {TagInfo[]} tagInfos - An array of TagInfo objects, each with a fileLink and an array of strings that contain the tag of interest.
 * @param {string} tagOfInterest - The tag to base the grouping on. The function will categorize the strings by the specific variations of this tag found within them.
 * @returns {Map<string, TagMatchDetail[]>} A map where each key represents a different variation of the tag of interest found within the strings, and each value is an array of TagMatchDetail objects, which include the string containing the tag variation and the corresponding fileLink.
 *
 * @example
 * const tagInfos: TagInfo[] = [
 *     { fileLink: "file1.txt", tagMatches: ["Text with #tag1", "Another text with #tag1/nested and more"] },
 *     { fileLink: "file2.txt", tagMatches: ["More text with #tag1/nested", "Text with another #tag2"] },
 * ];
 * const tagOfInterest = "#tag1";
 * const groupedTags = groupByTagWithDetails(tagInfos, tagOfInterest);
 * console.log(groupedTags);
 */
function groupByTagWithDetails(tagInfos: TagInfo[], tagOfInterest: string): Map<string, TagMatchDetail[]> {
	const grouped = new Map<string, TagMatchDetail[]>();

	tagInfos.forEach(tagInfo => {
		tagInfo.tagMatches.forEach(stringContainingTag => {
			// Directly use the tagOfInterest to form the basis of the grouping
			const regexPattern = tagOfInterest.replace(/[#/]/g, '\\$&') + '(\\w|[-/])*';
			const regex = new RegExp(regexPattern, 'g');

			const matches = stringContainingTag.match(regex);
			if (matches) {
				matches.forEach(match => {
					const tagDetail: TagMatchDetail = { stringContainingTag, fileLink: tagInfo.fileLink };
					// Ensure a group for this tag variation exists
					if (!grouped.has(match)) {
						grouped.set(match, [tagDetail]);
					} else {
						grouped.get(match)?.push(tagDetail);
					}
				});
			}
		});
	});

	return grouped;
}

/**
 * Processes a single tag match, formatting it according to the specified logic and appending it to the provided content array.
 * If the tag match starts with a markdown bullet ('-'), the function formats the first line with the file link and preserves the rest as is.
 * Otherwise, it prefixes the tag match with a markdown bullet, highlights the base tag within the match, and appends the file link.
 *
 * @param {string} fullTag - The full tag match string, which may include additional content beyond the base tag.
 * @param {string} fileLink - The URL or path to the file associated with the tag match.
 * @param {string} baseTag - The base tag extracted from the full tag match, used for highlighting within the formatted output.
 * @param {string[]} tagPageContent - The array to which the formatted tag match will be appended. This array accumulates the content for a page or section.
 */
function processTagMatch(fullTag: string, fileLink: string, baseTag: string, tagPageContent: string[]) {
	if (fullTag.trim().startsWith('-')) {
		const [firstBullet, ...bullets] = fullTag.split('\n');
		const firstBulletWithLink = `${firstBullet} ${fileLink}`;
		tagPageContent.push(
			[firstBulletWithLink, ...bullets].join('\n')
		);
	} else {
		tagPageContent.push(
			`- ${fullTag} ${fileLink}`.replace(
				baseTag,
				`**${baseTag.replace('#', '')}**`
			)
		);
	}
}

/**
 * Checks if the provided tags match the tag of interest, including wildcard patterns.
 *
 * @param {string | string[]} tags - The tag or tags found in a file's frontmatter.
 * @param {string} tagOfInterest - The tag to search for, which may include a wildcard pattern (e.g., '#daily-note/*').
 * @returns {boolean} True if the tag of interest matches (or is matched by) any of the provided tags.
 */
function matchesTagOfInterest(tags: string | string[], tagOfInterest: string): boolean {
	// Normalize tags to an array
	const normalizedTags = Array.isArray(tags) ? tags : [tags];

	// Prepare base tag and regex pattern for matching
	const {isWildCard, cleanedTag: tagBase} = getIsWildCard(tagOfInterest);

	// If wildcard, match any tag that starts with the base tag
	if (isWildCard) {
		return normalizedTags.some(tag => {
			const fullTag = `#${tag}`; // Ensure it starts with '#'
			return fullTag === tagBase || fullTag.startsWith(`${tagBase}/`);
		});
	} else {
		// If not a wildcard, require an exact match
		return normalizedTags.some(tag => `#${tag}` === tagBase);
	}
}

/**
 * Swaps the content of the current page in view with new content.
 *
 * @param {MarkdownView | null} activeLeaf - The active Markdown view leaf.
 * @param {string} newPageContent - The new content to set in the page.
 */
export const swapPageContent = (
	activeLeaf: MarkdownView | null,
	newPageContent: string
) => {
	activeLeaf?.currentMode?.set(newPageContent, true);
};
