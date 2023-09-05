import { App, MarkdownView } from 'obsidian';
import { PluginSettings, TagInfo } from '../types';

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
	tagsInfo: TagInfo[],
	tagOfInterest: string,
): Promise<string> => {
	// Generate list of links to files with this tag
	const tagPageContent: string[] = [];
	tagPageContent.push(
		`---\n${settings.frontmatterQueryProperty}: "${tagOfInterest}"\n---`,
	);
	tagPageContent.push(`## Tag Content for ${tagOfInterest}`);
	tagsInfo.forEach((tagInfo) => {
		tagInfo.tagMatches.forEach((tagMatch) => {
			// if tagMatch starts with markdown bullet, add link to first line only
			if (tagMatch.trim().startsWith('-')) {
				const [firstBullet, ...bullets] = tagMatch.split('\n');
				const firstBulletWithLink = `${firstBullet} ${tagInfo.fileLink}`;
				tagPageContent.push(
					[firstBulletWithLink, ...bullets]
						.join('\n')
						.replace(
							tagOfInterest,
							`**${tagOfInterest.replace('#', '')}**`,
						),
				);
			} else {
				tagPageContent.push(
					`- ${tagMatch} ${tagInfo.fileLink}`.replace(
						tagOfInterest,
						`**${tagOfInterest.replace('#', '')}**`,
					),
				);
			}
		});
	});

	// Add Files with tag in frontmatter
	const filesWithFrontmatterTag = app.vault
		.getMarkdownFiles()
		.filter((file) => {
			const metaMatter =
				app.metadataCache.getFileCache(file)?.frontmatter;
			return (
				metaMatter?.['tags']?.includes(tagOfInterest) ||
				metaMatter?.['tags']?.includes(tagOfInterest.replace('#', ''))
			);
		})
		.map((file) => `- [[${file.basename}]]`);
	if (filesWithFrontmatterTag.length > 0) {
		tagPageContent.push(`## Files with ${tagOfInterest} in frontmatter`);
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
	frontMatterTag: string,
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
 * Swaps the content of the current page in view with new content.
 *
 * @param {MarkdownView | null} activeLeaf - The active Markdown view leaf.
 * @param {string} newPageContent - The new content to set in the page.
 */
export const swapPageContent = (
	activeLeaf: MarkdownView | null,
	newPageContent: string,
) => {
	activeLeaf?.currentMode?.set(newPageContent, true);
};
