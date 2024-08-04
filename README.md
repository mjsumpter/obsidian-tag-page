# Obsidian Tag Page Plugin

## Overview

The Obsidian Tag Page Plugin enables users to create and manage dedicated Markdown pages for individual tags. When you create a tag page, the plugin automatically populates it with content based on the associated tag. The plugin also provides a ribbon icon that refreshes the content of the active tag page according to the current settings.

## Features

- Create dedicated tag pages with a simple command.
- Automatically populate tag pages with relevant content.
- Refresh tag page content with a click.
- Customize the directory where tag pages are stored.
- Include lines containing the tag and/or bulleted sub-items in the tag page.
- Flexible frontmatter query property to store the tag query within the tag page.

## Installation

To install the Obsidian Tag Page Plugin:

1. Open Obsidian.
2. Navigate to **Settings** > **Community plugins** > **Browse**.
3. Search for "Tag Page Plugin" and click **Install**.

## Usage

### Commands

- **Create Tag Page**: Trigger this command to create a new tag page or navigate to an existing one.
  - Entering `#some-tag` will create a new tag page for `#some-tag` in the default tag page directory.
  - Entering `#some-tag/*` will create a new tag page for all nested tags under `#some-tag` in the default tag page directory.

### Ribbon Icon

- **Refresh Tag Page**: Click this icon to refresh the content of the active tag page based on your current settings.

### Settings

- **Tag Page Directory**: Customize the directory where new tag pages will be created.
- **Frontmatter Query Property**: Define the frontmatter property to store the tag query within the tag page. 
  - **NOTE: This property is required on all tag pages for refreshing content.**
- **Nested page separator**: Indicate the character used between words when created tag pages. Defaults to `_`.
   - _Example_: `mytag_nested.md`
- **Include Lines**: Choose to include lines containing the tag in the tag page.
- **Bulleted Sub Items**: Choose to include bulleted sub-items containing the tag in the tag page.
- **Display Full Link Names**: When off, referenced content will end with a link aliased as `*`. When toggled on, it will use the full file name for the link.

## Development

To contribute to this project, please see the [Contributing](https://github.com/mjsumpter/obsidian-tag-page/blob/develop/CONTRIBUTING.md) guidelines. 

## Support

For any issues, please refer to the GitHub [Issues](https://github.com/mjsumpter/obsidian-tag-page/issues) page or contact the maintainers.

## License

This project is licensed under [MIT License](LICENSE).
