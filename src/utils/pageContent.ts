import { App, MarkdownView, Setting, TFile } from 'obsidian';
import { PluginSettings, TagInfo } from '../types';

export type GenerateTagPageContentFn = (
	app: App,
	settings: PluginSettings,
	tagsInfo: TagInfo[],
	tagOfInterest: string,
) => Promise<string>;

export const generateTagPageContent: GenerateTagPageContentFn = async (
	app,
	settings,
	tagsInfo,
	tagOfInterest,
) => {
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
	console.log('filesWithFrontmatter', filesWithFrontmatterTag);
	if (filesWithFrontmatterTag.length > 0) {
		tagPageContent.push(`## Files with ${tagOfInterest} in frontmatter`);
		tagPageContent.push(...filesWithFrontmatterTag);
	}
	return tagPageContent.join('\n');
};

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

export const swapPageContent = (
	activeLeaf: MarkdownView | null,
	newPageContent: string,
) => {
	activeLeaf?.currentMode?.set(newPageContent, true);
};
