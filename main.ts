import {
	App,
	MarkdownView,
	Modal,
	normalizePath,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from 'obsidian';
import { fetchTagData } from './src/utils/tagSearch';
import {
	extractFrontMatterTagValue,
	generateTagPageContent,
	swapPageContent,
} from './src/utils/pageContent';
import { PluginSettings } from './src/types';

const DEFAULT_SETTINGS: PluginSettings = {
	mySetting: 'default',
	tagPageDir: 'Tags/',
	frontmatterQueryProperty: 'tag-page-query',
	bulletedSubItems: true,
	includeLines: true,
};

export default class TagPagePlugin extends Plugin {
	settings: PluginSettings;
	ribbonIcon: HTMLElement;

	async onload() {
		await this.loadSettings();

		this.ribbonIcon = this.addRibbonIcon(
			'tag-glyph',
			'Refresh Tag Page',
			() => {
				this.refreshTagPageContent();
			},
		);
		this.ribbonIcon.style.display = 'none';

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'create-tag-page',
			name: 'Create Tag Page',
			callback: () => {
				new CreateTagPageModal(this.app, this).open();
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-open', () =>
				this.updateRibbonIconVisibility(),
			),
		);

		this.updateRibbonIconVisibility();
	}

	updateRibbonIconVisibility() {
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeLeaf) {
			this.ribbonIcon.style.display = 'none';
			return;
		}
		const currentFile = activeLeaf.file;

		if (
			currentFile &&
			currentFile.path.startsWith(this.settings.tagPageDir)
		) {
			this.ribbonIcon.style.display = 'block';
		} else {
			this.ribbonIcon.style.display = 'none';
		}
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async refreshTagPageContent(): Promise<void> {
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeLeaf) return;
		const tagOfInterest = extractFrontMatterTagValue(
			this.app,
			activeLeaf,
			this.settings.frontmatterQueryProperty,
		);
		if (!tagOfInterest) return;

		const tagsInfo = await fetchTagData(
			this.app,
			this.settings,
			tagOfInterest,
		);

		const tagPageContentString = await generateTagPageContent(
			this.app,
			this.settings,
			tagsInfo,
			tagOfInterest,
		);

		swapPageContent(activeLeaf, tagPageContentString);
	}

	async createTagPage(tag: string) {
		// Append # to tag if it doesn't exist
		const tagOfInterest = tag.startsWith('#') ? tag : `#${tag}`;

		// Create tag page if it doesn't exist
		const tagPage = this.app.vault.getAbstractFileByPath(
			`${this.settings.tagPageDir}${tagOfInterest}.md`,
		);

		if (!tagPage) {
			const tagsInfo = await fetchTagData(
				this.app,
				this.settings,
				tagOfInterest,
			);
			const tagPageContentString = await generateTagPageContent(
				this.app,
				this.settings,
				tagsInfo,
				tagOfInterest,
			);

			// if tag page doesn't exist, create it and continue
			await this.app.vault.adapter
				// Check if tag page directory exists
				.exists(normalizePath(this.settings.tagPageDir))
				.then((exists) => {
					if (!exists) {
						this.app.vault.createFolder(this.settings.tagPageDir);
					}
				})
				.then(() => {
					return this.app.vault.create(
						`${this.settings.tagPageDir}${tagOfInterest}.md`,
						tagPageContentString,
					);
				})
				.then((createdPage) => {
					// open file
					this.app.workspace.getLeaf().openFile(createdPage as TFile);
				});
		} else {
			// navigate to tag page
			await this.app.workspace.getLeaf().openFile(tagPage as TFile);
		}
	}
}

class CreateTagPageModal extends Modal {
	plugin: TagPagePlugin;

	constructor(app: App, plugin: TagPagePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Tag to create page for:');
		const tagForm = contentEl.createEl('form');
		contentEl.addClass('create-page-modal');

		// Input Element
		const input = tagForm.createEl('input', { type: 'text' });
		input.placeholder = '#tag';
		input.value = '#';

		input.addEventListener('keydown', (e) => {
			const cursorPosition = input.selectionStart;
			if (
				cursorPosition === 1 &&
				(e.key === 'Backspace' || e.key === 'Delete')
			) {
				e.preventDefault();
			}
		});

		// Submit Button
		const submitButton = tagForm.createEl('button', { type: 'submit' });
		submitButton.innerText = 'Create Tag Page';

		// Form submit listener
		tagForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const tag = input.value;
			this.contentEl.empty();
			this.contentEl.setText(`Creating tag page for ${tag}...`);
			await this.plugin.createTagPage(tag);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: TagPagePlugin;

	constructor(app: App, plugin: TagPagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder('Enter your secret')
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
