import { App, MarkdownView, TFile } from 'obsidian';

/**
 * Determines if the provided file, or if not provided, the active view in the workspace is a tag page.
 *
 * @param {App} app - The main application object representing Obsidian.
 * @param {string} tagPageFrontmatterKey - The frontmatter key used to indicate a tag page.
 * @param {TFile} [providedFile] - Optional. A specific file to check. If not provided, the active file in the workspace is used.
 * @param {string} [tagOfInterest] - Optional. The tag to search for. If provided, the function will only return true if the frontmatter value matches this tag.
 * @returns {boolean} - Returns true if:
 *                      1) The provided or active file is a tag page and `tagOfInterest` is not provided.
 *                      2) The provided or active file is a tag page with frontmatter value that matches `tagOfInterest` when it's provided.
 *                      Returns false otherwise.
 */
export const isTagPage = (
	app: App,
	tagPageFrontmatterKey: string,
	providedFile?: TFile,
	tagOfInterest?: string,
): boolean => {
	const file =
		providedFile ||
		app.workspace.getActiveViewOfType(MarkdownView)?.file ||
		null;
	if (!file) return false;

	const frontmatterValue =
		app.metadataCache.getFileCache(file)?.frontmatter?.[
			tagPageFrontmatterKey
		];

	// If tagOfInterest is provided, check if it matches the frontmatter value.
	if (tagOfInterest !== undefined) {
		return frontmatterValue === tagOfInterest;
	}

	// If tagOfInterest is not provided, return true if the frontmatter key exists.
	return !!frontmatterValue;
};
