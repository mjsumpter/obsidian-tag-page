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
	generateFilename,
	generateTagPageContent,
	swapPageContent,
} from './src/utils/pageContent';
import { PluginSettings, SortOrder } from './src/types';
import { isTagPage } from './src/utils/obsidianApi';

const DEFAULT_SETTINGS: PluginSettings = {
	tagPageDir: 'Tags/',
	frontmatterQueryProperty: 'tag-page-query',
	sortByDate: SortOrder.DESC,
	nestedSeparator: '_',
	tagPageTitleTemplate: 'Tag Content for {{tag}}',
	bulletedSubItems: true,
	includeLines: true,
	autoRefresh: true,
	fullLinkName: false,
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

		const tagPageContentString = await generateTagPageContent(
			this.app,
			this.settings,
			tagsInfo,
			tagOfInterest,
		);

		swapPageContent(activeLeaf, tagPageContentString);
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
		const filename = generateFilename(
			cleanedTag,
			isWildCard,
			this.settings.nestedSeparator,
		);

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
			.setName('Sort content by Date')
			.setDesc(
				'Designate whether the content should be sorted in descending or ascending order. Defaults to descending (newest content first).',
			)
			.addDropdown((component) =>
				component
					.addOption(SortOrder.DESC, 'Descending')
					.addOption(SortOrder.ASC, 'Ascending')
					.setValue(SortOrder.DESC)
					.onChange(async (value) => {
						this.plugin.settings.sortByDate = value as SortOrder;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName('Nested page separator')
			.setDesc(
				"Text used to separate levels for nested tags. Avoid \\/<>:\"|?* and other characters that aren't file-safe, or you won't be able to make pages for nested tags.",
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.nestedSeparator)
					.onChange(async (value) => {
						this.plugin.settings.nestedSeparator = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName('Tag page title template')
			.setDesc(
				'Title template for the tag page. The placeholder \'{{tag}}\' will be replaced by the actual tag. The placeholder \'{{tagname}}\' will be replaced by just the tag name (without the \'#\' symbol and without a link). The placeholder \'{{lf}}\' (line feed) is used to add new lines for optional spacing or to insert static text between the title and the tags.'
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.tagPageTitleTemplate)
					.onChange(async (value) => {
						this.plugin.settings.tagPageTitleTemplate = value;
						await this.plugin.saveSettings();
					})
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
		new Setting(containerEl)
			.setName('Display full link name as reference')
			.setDesc(
				'Each bit of pulled content will display the full link title as a reference as an end of line. Displays * when false.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fullLinkName)
					.onChange(async (value) => {
						this.plugin.settings.fullLinkName = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
