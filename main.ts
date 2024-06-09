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
import { fetchTagData, getIsWildCard } from './src/utils/tagSearch';
import {
	extractFrontMatterTagValue,
	generateTagPageContent,
	swapPageContent,
} from './src/utils/pageContent';
import { PluginSettings } from './src/types';
import { isTagPage } from './src/utils/obsidianApi';

const DEFAULT_SETTINGS: PluginSettings = {
	tagPageDir: 'Tags/',
	frontmatterQueryProperty: 'tag-page-query',
	bulletedSubItems: true,
	includeLines: true,
	autoRefresh: true,
};

export default class TagPagePlugin extends Plugin {
	settings: PluginSettings;
	ribbonIcon: HTMLElement;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TagPageSettingTab(this.app, this));

		this.ribbonIcon = this.addRibbonIcon(
			'tag-glyph',
			'Refresh tag page',
			() => {
				this.refreshTagPageContent();
			},
		);
		this.ribbonIcon.style.display = 'none';

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'create-tag-page',
			name: 'Create tag page',
			callback: () => {
				new CreateTagPageModal(this.app, this).open();
			},
		});

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.updateRibbonIconVisibility();
				this.autoRefreshTagPage();
			}),
		);

		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.updateRibbonIconVisibility();
				this.autoRefreshTagPage();
			}),
		);

		this.updateRibbonIconVisibility();
		await this.autoRefreshTagPage();
	}

	updateRibbonIconVisibility() {
		this.ribbonIcon.style.display = isTagPage(
			this.app,
			this.settings.frontmatterQueryProperty,
		)
			? 'block'
			: 'none';
	}

	async autoRefreshTagPage() {
		if (
			this.settings.autoRefresh &&
			isTagPage(this.app, this.settings.frontmatterQueryProperty)
		) {
			await this.refreshTagPageContent();
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

	/**
	 * Refreshes the content of the active tag page based on the current settings.
	 *
	 * @returns {Promise<void>} - A promise that resolves when the operation is complete.
	 */
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

		if (!activeLeaf.file) {
			return;
		}
		
		this.app.fileManager.processFrontMatter(activeLeaf.file, frontMatter => {
			frontMatter[this.settings.frontmatterQueryProperty] = tagOfInterest
			frontMatter.tags ??= [];
			frontMatter.tags = [...new Set(frontMatter.tags).add('tag-page-md').add(tagOfInterest.slice(1) /* Omit the leading # */)]
		})

		const baseContent = await this.app.vault.read(activeLeaf.file);
		const tagPageContentString = await generateTagPageContent(
			this.app,
			this.settings,
			tagsInfo,
			tagOfInterest,
			baseContent,
		);

		swapPageContent(activeLeaf, tagPageContentString);
		activeLeaf.save();
	}

	/**
	 * Creates a new tag page or navigates to an existing one.
	 *
	 * @param {string} tag - The tag for which to create or navigate to a page.
	 * @returns {Promise<void>} - A promise that resolves when the operation is complete.
	 */
	async createTagPage(tag: string): Promise<void> {
		// Append # to tag if it doesn't exist
		const tagOfInterest = tag.startsWith('#') ? tag : `#${tag}`;
		const { isWildCard, cleanedTag } = getIsWildCard(tagOfInterest);
		const filename = `${cleanedTag.replace('#', '')}${
			isWildCard ? '_nested' : ''
		}_Tags.md`;

		// Create tag page if it doesn't exist
		const tagPage = this.app.vault.getAbstractFileByPath(
			`${this.settings.tagPageDir}${filename}`,
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
			const exists = await this.app.vault.adapter.exists(
				normalizePath(this.settings.tagPageDir),
			);
			if (!exists) {
				await this.app.vault.createFolder(this.settings.tagPageDir);
			}
			const createdPage = await this.app.vault.create(
				`${this.settings.tagPageDir}${filename}`,
				tagPageContentString,
			);

			await this.app.workspace.getLeaf().openFile(createdPage as TFile);
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

class TagPageSettingTab extends PluginSettingTab {
	plugin: TagPagePlugin;

	constructor(app: App, plugin: TagPagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		new Setting(containerEl)
			.setName('Tag page directory')
			.setDesc('The directory in which to create tag pages.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.tagPageDir)
					.onChange(async (value) => {
						// add trailing slash if it doesn't exist
						if (!value.endsWith('/')) {
							value = `${value}/`;
						}
						this.plugin.settings.tagPageDir = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Frontmatter query property')
			.setDesc(
				'The frontmatter property to use storing the query tag within the tag page. Required for page refresh.',
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.frontmatterQueryProperty)
					.onChange(async (value) => {
						this.plugin.settings.frontmatterQueryProperty = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Include lines')
			.setDesc('Include lines containing the tag in the tag page.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeLines)
					.onChange(async (value) => {
						this.plugin.settings.includeLines = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Bulleted sub-items')
			.setDesc(
				'Include bulleted sub-items containing the tag in the tag page.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.bulletedSubItems)
					.onChange(async (value) => {
						this.plugin.settings.bulletedSubItems = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Auto refresh')
			.setDesc(
				'Automatically refresh tag pages when they are opened or become active.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoRefresh)
					.onChange(async (value) => {
						this.plugin.settings.autoRefresh = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
