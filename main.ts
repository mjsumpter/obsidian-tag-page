import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	tagPageDir: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	tagPageDir: 'Tags',
};

interface TagInfo {
	fileLink: string;
	bulletContent: string;
}

export default class TagPagePlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'create-tag-page',
			name: 'Create Tag Page',
			callback: () => {
				new CreateTagPageModal(this.app, this).open();
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-open', this.addButton.bind(this)),
		);
	}

	generateTagPageContent(file: TFile) {
		console.log('Generating tag page content for', file.basename);
	}

	addButton() {
		const refreshButtonClass = 'refresh-tag-page-button';
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
		const editorWrapper = activeLeaf?.containerEl.querySelector(
			'.markdown-source-view',
		);
		if (activeLeaf) {
			const currentFile = activeLeaf.file;
			if (
				currentFile &&
				currentFile.path.includes(this.settings.tagPageDir)
			) {
				// Create button
				const button = document.createElement('button');
				button.innerText = 'Refresh Page Content';
				button.classList.add(refreshButtonClass);
				button.addEventListener('click', async () => {
					this.generateTagPageContent(currentFile);
				});

				if (!editorWrapper?.querySelector(refreshButtonClass)) {
					editorWrapper?.prepend(button);
				}
			}
		} else if (editorWrapper?.querySelector(refreshButtonClass)) {
			editorWrapper?.querySelector(refreshButtonClass)?.remove();
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

	async createTagPage(tag: string) {
		// Append # to tag if it doesn't exist
		const tagOfInterest = tag.startsWith('#') ? tag : `#${tag}`;

		// Create tag page if it doesn't exist
		const tagPage = this.app.vault.getAbstractFileByPath(
			`${this.settings.tagPageDir}/${tagOfInterest}.md`,
		);

		if (!tagPage) {
			// Search for all pages with this tag
			const vault = this.app.vault;
			const allFiles = vault.getMarkdownFiles();
			const tagInfos: TagInfo[] = [];

			for (const file of allFiles) {
				const fileContents = await vault.cachedRead(file);
				const fileLines = fileContents
					.split('\n')
					// Remove empty lines
					.filter((l) => l.trim() !== '');

				let capturingContent = false;
				let currentBulletIndentation = 0;
				let currentBulletContent: string[] = [];

				for (const line of fileLines) {
					// Finds the first non-space character
					const currentLineIndentation = line.search(/\S/);
					const validBullet =
						line.trim().startsWith('- ') &&
						line.includes(tagOfInterest);
					const validSubBullet =
						capturingContent &&
						currentLineIndentation > currentBulletIndentation;

					switch (true) {
						case validBullet:
							// Check if line has bullet point and tag
							// If we're not inside a bullet, then this is the start of a new bullet
							capturingContent = true;
							currentBulletContent.push(line);
							currentBulletIndentation = currentLineIndentation;
							break;
						case validSubBullet:
							// If we're inside a bullet and the current line has more indentation than the current bullet,
							// then it's considered a sub-bullet
							currentBulletContent.push(line);
							break;
						case capturingContent:
							// If we were capturing content but no longer on a valid bullet
							// then capture the content and reset
							const tagInfo = {
								fileLink: `[[${file.basename}|*]]`,
								bulletContent: currentBulletContent.join('\n'),
							};
							tagInfos.push(tagInfo);
							capturingContent = false;
							currentBulletContent = [];
							break;
						default:
							break;
					}
				}
			}

			// Generate list of links to files with this tag
			const tagPageContent: string[] = [];
			tagPageContent.push(`## Tag Content for ${tagOfInterest}`);
			tagInfos.forEach((tagInfo) => {
				const [firstBullet, ...bullets] =
					tagInfo.bulletContent.split('\n');
				const firstBulletWithLink = `${firstBullet} ${tagInfo.fileLink}`;
				tagInfo.bulletContent = [firstBulletWithLink, ...bullets]
					.join('\n')
					.replace(tagOfInterest, tagOfInterest.replace('#', ''));
				tagPageContent.push(tagInfo.bulletContent);
			});
			const tagPageContentString = tagPageContent.join('\n');

			// if tag page doesn't exist, create it and continue
			// Check if tag page directory exists
			await this.app.vault.adapter
				.exists(this.settings.tagPageDir)
				.then((exists) => {
					if (!exists) {
						this.app.vault.createFolder(this.settings.tagPageDir);
					}
				})
				.then(() => {
					return this.app.vault.create(
						`${this.settings.tagPageDir}/${tagOfInterest}.md`,
						tagPageContentString,
					);
				})
				.then((createdPage) => {
					// open file
					this.app.workspace.getLeaf().openFile(createdPage as TFile);
				});

			// Get bulleted lines with this tag
			// Can user's define rules for what lines to include?
			// Can they grab any subbullets of a bullet
			// Append to tag page with obsidian link to that page (can I link directly to line?)
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
