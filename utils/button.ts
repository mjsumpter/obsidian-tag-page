import { App, MarkdownView, TFile } from 'obsidian';
import { PluginSettings } from '../main';
import { extractFrontMatterTagValue } from './pageContent';

export async function addButton(
	app: App,
	settings: PluginSettings,
	generateTagPageContent: (
		activeLeaf: MarkdownView,
		tagOfInterest: string,
	) => Promise<void>,
) {
	const refreshButtonClass = 'refresh-tag-page-button';
	const activeLeaf = app.workspace.getActiveViewOfType(MarkdownView);
	const editorWrapper = activeLeaf?.containerEl.querySelector(
		'.markdown-source-view',
	);

	if (activeLeaf) {
		const currentFile = activeLeaf.file;
		if (currentFile && currentFile.path.includes(settings.tagPageDir)) {
			const tagOfInterest = extractFrontMatterTagValue(
				app,
				activeLeaf,
				settings.frontmatterQueryProperty,
			);
			if (!tagOfInterest) return;

			const button = document.createElement('button');
			button.innerText = 'Refresh Page Content';
			button.classList.add(refreshButtonClass);
			button.addEventListener('click', async () => {
				// TODO Add loading indicator to button, end after generations
				await generateTagPageContent(activeLeaf, tagOfInterest);
			});

			if (!editorWrapper?.querySelector('.' + refreshButtonClass)) {
				editorWrapper?.prepend(button);
			}
		} else if (editorWrapper?.querySelector('.' + refreshButtonClass)) {
			editorWrapper.querySelector('.' + refreshButtonClass)?.remove();
		}
	}
}
