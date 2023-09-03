import { App, MarkdownView, Setting } from 'obsidian';
import { PluginSettings, TagInfo } from '../main';
import matter from 'gray-matter';

export const generateTagPageContent = async (
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
					`${tagMatch} ${tagInfo.fileLink}`.replace(
						tagOfInterest,
						`**${tagOfInterest.replace('#', '')}**`,
					),
				);
			}
		});
	});
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
