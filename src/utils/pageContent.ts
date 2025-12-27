import { App, normalizePath } from 'obsidian';
import * as path from 'path';
import { PluginSettings, TagInfo } from '../types';
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
	tagsInfo: TagInfo,
	tagOfInterest: string,
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
	tagsInfo: TagInfo,
	tagOfInterest: string,
): Promise<string> => {
	// Generate list of links to files with this tag
	const tagPageContent: string[] = [];

	// Resolve the title and push to the page content
	tagPageContent.push(resolveTagPageTitle(settings, tagOfInterest));

	// Check if we have more than one baseTag across all tagInfos
	if (tagsInfo.size > 1) {
		// Convert the map to an array of [key, value] pairs
		const sortedTagsInfo = Array.from(tagsInfo).sort((a, b) => {
			// Sort based on the length of the keys
			return a[0].length - b[0].length;
		});

		// Iterate through each group of tags in the sorted order
		sortedTagsInfo.forEach(([baseTag, details]) => {
			// Add a subheader for the baseTag
			tagPageContent.push(`### ${baseTag}`);

			// Process each tagMatch detail in this group
			details.forEach(({ stringContainingTag, fileLink, sourcePath }) => {
				processTagMatch(
					stringContainingTag,
					fileLink,
					sourcePath,
					tagPageContent,
					settings.linkAtEnd,
					app,
				);
			});
		});
	} else {
		// If there's only one baseTag, process all tagMatches normally without subheaders
		tagsInfo.forEach((details) => {
			details.forEach(({ stringContainingTag, fileLink, sourcePath }) => {
				// Assuming there's only one baseTag, we can directly use the first (and only) key of groupedTags
				processTagMatch(
					stringContainingTag,
					fileLink,
					sourcePath,
					tagPageContent,
					settings.linkAtEnd,
					app,
				);
			});
		});
	}

	// Add Files with tag in frontmatter
	const filesWithFrontmatterTag = app.vault
		.getMarkdownFiles()
		.filter((file) => {
			const metaMatter =
				app.metadataCache.getFileCache(file)?.frontmatter;
			return metaMatter?.tags
				? matchesTagOfInterest(metaMatter.tags, tagOfInterest)
				: false;
		})
		.map((file) => `- [[${file.basename}]]`);
	if (filesWithFrontmatterTag.length > 0) {
		const { cleanedTag } = getIsWildCard(tagOfInterest);
		tagPageContent.push(`## Files with ${cleanedTag} in frontmatter`);
		tagPageContent.push(...filesWithFrontmatterTag);
	}
	return tagPageContent.join('\n');
};

/**
 * Processes a single tag match, formatting it according to the specified logic and appending it to the provided content array.
 * If the tag match starts with a markdown bullet ('-'), the function formats the first line with the file link and preserves the rest as is.
 * Otherwise, it prefixes the tag match with a markdown bullet, highlights the base tag within the match, and appends the file link.
 *
 * @param {string} fullTag - The full tag match string, which may include additional content beyond the base tag.
 * @param {string} fileLink - The URL or path to the file associated with the tag match.
 * @param {string} sourcePath - The path to the source note, used to resolve relative embeds.
 * @param {string[]} tagPageContent - The array to which the formatted tag match will be appended. This array accumulates the content for a page or section.
 * @param {boolean} linkAtEnd - Whether to place the file link at the end of the line.
 * @param {App} app - The Obsidian app instance for link resolution.
 */
function processTagMatch(
	fullTag: string,
	fileLink: string,
	sourcePath: string,
	tagPageContent: string[],
	linkAtEnd: boolean,
	app: App,
) {
	const resolvedTag = resolveRelativeEmbeds(app, sourcePath, fullTag);
	if (resolvedTag.trim().startsWith('-')) {
		const [firstBullet, ...bullets] = resolvedTag.split('\n');
		const firstBulletIndent = firstBullet.match(/^(\s*)-/);
		if (firstBulletIndent && firstBulletIndent[1].length > 0) {
			tagPageContent.push(resolvedTag);
			return;
		}
		const bulletMatch = firstBullet.match(/^(\s*-\s*)(.*)$/);
		if (linkAtEnd) {
			const firstBulletWithLink = `${firstBullet} ${fileLink}`;
			tagPageContent.push([firstBulletWithLink, ...bullets].join('\n'));
		} else if (bulletMatch) {
			const [, prefix, rest] = bulletMatch;
			const firstLine = `${prefix}${fileLink} ${rest}`.trimEnd();
			tagPageContent.push([firstLine, ...bullets].join('\n'));
		} else {
			const firstLine = `${fileLink} ${firstBullet}`.trimEnd();
			tagPageContent.push([firstLine, ...bullets].join('\n'));
		}
	} else {
		const content = linkAtEnd
			? `- ${resolvedTag} ${fileLink}`
			: `- ${fileLink} ${resolvedTag}`;
		tagPageContent.push(content.trimEnd());
	}
}

/**
 * Resolves relative embed targets within tag-matched lines so images render correctly when
 * the content is rendered from a tag-page block.
 *
 * This handles both Obsidian embeds (`![[...]]`) and standard markdown images (`![](...)`),
 * rewriting their targets to be vault-resolvable based on the source note path.
 *
 * @param {App} app - The Obsidian app instance used to resolve internal links.
 * @param {string} sourcePath - The source note path used as the base for resolution.
 * @param {string} content - A single line or block of content that may include embeds.
 * @returns {string} The content with embed targets rewritten when possible.
 */
function resolveRelativeEmbeds(
	app: App,
	sourcePath: string,
	content: string,
): string {
	const withResolvedWikiEmbeds = content.replace(
		/!\[\[([^\]]+)\]\]/g,
		(match, inner) => {
			// Preserve aliases and subpath suffixes while resolving the target.
			const [linkTarget, alias] = inner.split('|', 2);
			const parsed = linkTarget.match(/^([^#^]+)([#^].+)?$/);
			const baseTarget = parsed?.[1] ?? linkTarget;
			const suffix = parsed?.[2] ?? '';
			const resolved = app.metadataCache.getFirstLinkpathDest(
				baseTarget,
				sourcePath,
			);
			if (!resolved) return match;
			const resolvedTarget = `${resolved.path}${suffix}`;
			const aliasSuffix = alias ? `|${alias}` : '';
			return `![[${resolvedTarget}${aliasSuffix}]]`;
		},
	);

	return withResolvedWikiEmbeds.replace(
		/!\[([^\]]*)\]\(([^)]+)\)/g,
		(match, altText, rawUrl) => {
			// Ignore external URLs and anchor-only links.
			const url = rawUrl.trim().replace(/^<|>$/g, '');
			if (/^[a-z]+:|^#/i.test(url)) return match;
			const resolved = app.metadataCache.getFirstLinkpathDest(
				url,
				sourcePath,
			);
			if (resolved) {
				return `![${altText}](${resolved.path})`;
			}
			// Fall back to a normalized relative path when no file is found.
			const baseDir = path.posix.dirname(sourcePath);
			const joined = normalizePath(path.posix.join(baseDir, url));
			return `![${altText}](${joined})`;
		},
	);
}

/**
 * Checks if the provided tags match the tag of interest, including wildcard patterns.
 *
 * @param {string | string[]} tags - The tag or tags found in a file's frontmatter.
 * @param {string} tagOfInterest - The tag to search for, which may include a wildcard pattern (e.g., '#daily-note/*').
 * @returns {boolean} True if the tag of interest matches (or is matched by) any of the provided tags.
 */
function matchesTagOfInterest(
	tags: string | string[],
	tagOfInterest: string,
): boolean {
	// Normalize tags to an array
	const normalizedTags = Array.isArray(tags) ? tags : [tags];

	// Prepare base tag and regex pattern for matching
	const { isWildCard, cleanedTag: tagBase } = getIsWildCard(tagOfInterest);

	// If wildcard, match any tag that starts with the base tag
	if (isWildCard) {
		return normalizedTags.some((tag) => {
			const fullTag = `#${tag}`; // Ensure it starts with '#'
			return fullTag === tagBase || fullTag.startsWith(`${tagBase}/`);
		});
	} else {
		// If not a wildcard, require an exact match
		return normalizedTags.some((tag) => `#${tag}` === tagBase);
	}
}

/**
 * Generates a filename based on the cleaned tag, wild card status, and settings.
 *
 * @param {string} cleanedTag - The tag to be cleaned and formatted.
 * @param {boolean} isWildCard - Indicates whether a wildcard is present.
 * @param {string} nestedSeparator - The separator to use for nested structures.
 * @returns {string} The generated filename.
 */
export const generateFilename = (
	cleanedTag: string,
	isWildCard: boolean,
	nestedSeparator: string,
): string => {
	return `${cleanedTag.replace('#', '').replaceAll('/', nestedSeparator)}${
		isWildCard ? nestedSeparator + 'nested' : ''
	}${nestedSeparator}Tags.md`;
};

/**
 * Resolves the title of the tag page according to the defined template in the settings.
 * If empty, the default title will be generated. The template variable {{tag}} will be replaced by the full tag, and {{tagname}} will be replaced just with the tag name. {{lf}} will create new lines.
 * @param {PluginSettings} settings - The plugin settings.
 * @param {string} tagOfInterest - The tag for which the page is being generated.
 * @returns The resolved page title
 */
export const resolveTagPageTitle = (
	settings: PluginSettings,
	tagOfInterest: string,
): string => {
	const template = settings.tagPageTitleTemplate;
	if (!template) {
		return `## Tag Content for ${tagOfInterest.replace('*', '')}`;
	} else {
		const tag = `${tagOfInterest.replace('*', '')}`;
		const tagName = `${tagOfInterest.replace('*', '')}`.replace('#', '');
		return (
			'## ' +
			template
				.replaceAll('{{lf}}', '\n')
				.replaceAll('{{tag}}', ' ' + tag)
				.replaceAll('{{tagname}}', tagName)
				.replaceAll('  ', ' ')
		);
	}
};
