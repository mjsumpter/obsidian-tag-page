import { App, MarkdownView } from 'obsidian';

/**
 * Determines if the active view in the workspace is a tag page.
 *
 * @param {App} app - The main application object representing Obsidian.
 * @param {string} tagPageDir - The directory where tag pages are located.
 * @returns {boolean} - Returns true if the active view is a tag page, otherwise false.
 */
export const isTagPage = (app: App, tagPageDir: string): boolean => {
	const activeLeaf = app.workspace.getActiveViewOfType(MarkdownView);
	return activeLeaf?.file?.path.startsWith(tagPageDir) || false;
};
