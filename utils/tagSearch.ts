import { App, TFile, Vault } from 'obsidian';
import { PluginSettings, TagInfo } from '../main';

// Using function to improve readability
const isIndentationGreater = (line: string, threshold: number): boolean => {
	return line.search(/\S/) > threshold;
};

const containsTag = (stringToSearch: string, tag: string): boolean =>
	stringToSearch.includes(tag);

export const findSmallestUnitsContainingTag = (
	content: string,
	tag: string,
	excludeBullets: boolean = false,
) => {
	// Escape special characters for use in regex
	const escapedSubstring = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	// If excludeBullets is false, don't include the (?!- ) part in the regex.
	const exclusionPattern = excludeBullets ? '(?!- )' : '';

	// Regular expression to match the smallest unit containing the substring.
	// This tries to find sentences (ending with .!?) or lines (ending with \n or being at the start/end of content).
	const regex = new RegExp(
		`(?:^|[\n.!?])${exclusionPattern}[^.!?\\n]*?${escapedSubstring}[^.!?\\n]*?(?:[.!?\\n]|$)`,
		'gm',
	);

	const matches: string[] = [];
	let match: RegExpExecArray | null;

	// Loop through all matches
	while ((match = regex.exec(content)) !== null) {
		matches.push(match[0].trim());
	}

	return matches.length > 0 ? matches : [];
};

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
				// If we're not inside a bullet, then this is the start of a new bullet
				capturingContent = true;
				currentBulletContent.push(line);
				currentBulletIndentation = line.search(/\S/);
				break;
			case capturingContent &&
				isIndentationGreater(line, currentBulletIndentation):
				// If we're inside a bullet and the current line has more indentation than the current bullet,
				// then it's considered a sub-bullet
				currentBulletContent.push(line);
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
	return capturedBulletLists;
};

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

export const fetchTagData = async (
	app: App,
	settings: PluginSettings,
	tagOfInterest: string,
): Promise<TagInfo[]> => {
	// Search for all pages with this tag
	const vault = app.vault;
	const allFiles = vault.getMarkdownFiles();
	const tagInfos = await Promise.all(
		allFiles.map((file) =>
			processFile(vault, settings, file, tagOfInterest),
		),
	).then((tagInfos) => tagInfos.flat());

	return tagInfos;
};
