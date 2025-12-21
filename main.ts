import {
	App,
	MarkdownRenderer,
	Modal,
	Notice,
	normalizePath,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from 'obsidian';
import { fetchTagData, getIsWildCard } from './src/utils/tagSearch';
import {
	generateFilename,
	generateTagPageContent,
} from './src/utils/pageContent';
import { PluginSettings, SortOrder } from './src/types';

const DEFAULT_SETTINGS: PluginSettings = {
	tagPageDir: 'Tags/',
	sortByDate: SortOrder.DESC,
	nestedSeparator: '_',
	tagPageTitleTemplate: 'Tag Content for {{tag}}',
	bulletedSubItems: true,
	includeLines: true,
	fullLinkName: false,
	linkAtEnd: true,
	legacyFrontmatterQueryProperty: 'tag-page-query',
};

export default class TagPagePlugin extends Plugin {
	settings: PluginSettings;
	private legacyMigrationInProgress = new Set<string>();
	private static readonly LEGACY_CONTENT_MARKER =
		'<!-- tag-page-legacy-content -->';

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TagPageSettingTab(this.app, this));

		this.addCommand({
			id: 'create-tag-page',
			name: 'Create tag page',
			callback: () => {
				new CreateTagPageModal(this.app, this).open();
			},
		});
		this.addCommand({
			id: 'cleanup-legacy-tag-page',
			name: 'Clean up legacy tag page content',
			callback: () => {
				this.cleanupLegacyTagPageContent();
			},
		});

		this.registerMarkdownCodeBlockProcessor(
			'tag-page',
			(source, el, ctx) => {
				this.renderTagPageBlock(source, el, ctx.sourcePath);
			},
		);

		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file) {
					void this.migrateLegacyTagPage(file);
				}
			}),
		);
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
			const exists = await this.app.vault.adapter.exists(
				normalizePath(this.settings.tagPageDir),
			);
			if (!exists) {
				await this.app.vault.createFolder(this.settings.tagPageDir);
			}

			const tagPageContentString = this.buildTagPageTemplate(
				tagOfInterest,
			);

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

	/**
	 * Renders the markdown code block tagged as `tag-page`.
	 *
	 * @param source - The content of the code block.
	 * @param el - The target element for rendering the generated content.
	 * @param sourcePath - The path of the note containing the block, used to resolve relative links.
	 */
	private async renderTagPageBlock(
		source: string,
		el: HTMLElement,
		sourcePath: string,
	) {
		const tags = this.parseTagsFromBlock(source);
		if (tags.length === 0) {
			el.createEl('p', {
				text: 'No tags provided. Add `tags: #tag` inside the tag-page code block.',
			});
			return;
		}

		const container = el.createDiv({ cls: 'tag-page-block' });

		for (const tag of tags) {
			const tagSection = container.createDiv({
				cls: 'tag-page-block__section',
			});
			const loadingState = tagSection.createEl('p', {
				text: `Loading content for ${tag}...`,
			});
			try {
				const tagsInfo = await fetchTagData(
					this.app,
					this.settings,
					tag,
				);

				const markdown = await generateTagPageContent(
					this.app,
					this.settings,
					tagsInfo,
					tag
				);

				tagSection.empty();
				await MarkdownRenderer.renderMarkdown(
					markdown,
					tagSection,
					sourcePath,
					this,
				);
			} catch (error) {
				console.error(error);
				tagSection.empty();
				tagSection.createEl('p', {
					text: `Failed to render tag page for ${tag}.`,
				});
			} finally {
				loadingState.remove();
			}
		}
	}

	private buildTagPageTemplate(tagOfInterest: string): string {
		const lines: string[] = [
			'```tag-page',
			`tags: ${tagOfInterest}`,
			'```',
			'',
		];

		return lines.join('\n');
	}

	private parseTagsFromBlock(source: string): string[] {
		const tagsLine = source
			.split('\n')
			.map((line) => line.trim())
			.find((line) => line.toLowerCase().startsWith('tags:'));

		if (!tagsLine) return [];

		const tags = tagsLine
			.slice('tags:'.length)
			.split(/\s+/)
			.map((tag) => tag.trim())
			.filter(Boolean)
			.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));

		return Array.from(new Set(tags));
	}

	private getLegacyFrontmatterKey(): string {
		return this.settings.legacyFrontmatterQueryProperty || 'tag-page-query';
	}

	private normalizeLegacyTags(rawTags: string | string[]): string[] {
		const tags = Array.isArray(rawTags)
			? rawTags
			: String(rawTags)
					.split(/[,\s]+/)
					.filter(Boolean);

		return Array.from(
			new Set(
				tags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)),
			),
		);
	}

	private async migrateLegacyTagPage(file: TFile): Promise<void> {
		const filePath = file.path;
		if (this.legacyMigrationInProgress.has(filePath)) return;

		const legacyKey = this.getLegacyFrontmatterKey();
		const frontmatterValue =
			this.app.metadataCache.getFileCache(file)?.frontmatter?.[legacyKey];
		if (!frontmatterValue) return;

		try {
			this.legacyMigrationInProgress.add(filePath);
			const content = await this.app.vault.read(file);

			if (
				/```tag-page[\s\S]*?```/i.test(content) ||
				content.includes(TagPagePlugin.LEGACY_CONTENT_MARKER)
			) {
				return;
			}

			const tags = this.normalizeLegacyTags(frontmatterValue);
			if (tags.length === 0) return;

			const block = [
				'```tag-page',
				`tags: ${tags.join(' ')}`,
				'```',
				'',
			].join('\n');

			const frontmatterMatch = content.match(
				/^---\n[\s\S]*?\n---\n?/,
			);
			const nextContent = frontmatterMatch
				? content.replace(
						frontmatterMatch[0],
						`${frontmatterMatch[0]}\n${block}${TagPagePlugin.LEGACY_CONTENT_MARKER}\n`,
					)
				: `${block}${TagPagePlugin.LEGACY_CONTENT_MARKER}\n${content}`;

			await this.app.vault.modify(file, nextContent);
			await this.maybeShowLegacyMigrationNotice();
		} finally {
			this.legacyMigrationInProgress.delete(filePath);
		}
	}

	private async cleanupLegacyTagPageContent(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('Tag Page: no active file to clean up.');
			return;
		}

		const content = await this.app.vault.read(activeFile);
		const markerIndex = content.indexOf(
			TagPagePlugin.LEGACY_CONTENT_MARKER,
		);

		if (markerIndex === -1) {
			new Notice('Tag Page: no legacy marker found in this note.');
			return;
		}

		const nextContent = content
			.slice(0, markerIndex)
			.replace(/\s*$/, '\n');

		await this.app.vault.modify(activeFile, nextContent);
		new Notice('Tag Page: legacy content removed.');
	}

	private async maybeShowLegacyMigrationNotice(): Promise<void> {
		new Notice(
			'Tag Page: added a tag-page code block to migrate this note. Run "Clean up legacy tag page content" when ready.',
		);
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

		const allTagsRecord =
			// @ts-ignore - getTags is available at runtime but not in type defs
			(this.app.metadataCache.getTags?.() as Record<string, number> | undefined) ||
			{};
		const existingTags = Object.keys(allTagsRecord).sort((a, b) =>
			a.localeCompare(b),
		);
		const datalistId = 'tag-page-suggestions';
		if (existingTags.length > 0) {
			const datalist = contentEl.createEl('datalist', {
				attr: { id: datalistId },
			});
			existingTags.forEach((tag) => {
				datalist.createEl('option', {
					attr: { value: tag.startsWith('#') ? tag : `#${tag}` },
				});
			});
		}

		// Input Element
		const input = tagForm.createEl('input', { type: 'text' });
		input.placeholder = '#tag';
		input.value = '#';
		if (existingTags.length > 0) {
			input.setAttr('list', datalistId);
		}

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

		new Setting(containerEl)
			.setName('Legacy frontmatter key')
			.setDesc(
				'Used to detect old tag pages and auto-insert a tag-page block for migration.',
			)
			.addText((text) =>
				text
					.setPlaceholder('tag-page-query')
					.setValue(this.plugin.settings.legacyFrontmatterQueryProperty || '')
					.onChange(async (value) => {
						this.plugin.settings.legacyFrontmatterQueryProperty = value.trim() || 'tag-page-query';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Link position')
			.setDesc(
				'Choose whether the reference link appears at the end (default) or start of each pulled line.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('end', 'End of line')
					.addOption('start', 'Start of line')
					.setValue(this.plugin.settings.linkAtEnd ? 'end' : 'start')
					.onChange(async (value) => {
						this.plugin.settings.linkAtEnd = value === 'end';
						await this.plugin.saveSettings();
					}),
			);
	}
}
