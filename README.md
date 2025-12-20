# Obsidian Tag Page Plugin

## Overview

The Obsidian Tag Page Plugin enables users to create and manage dedicated Markdown pages for individual tags. Tag content is rendered inline through a markdown code block so you can mix generated results with your own notes.

## Features

- Render tag content anywhere with a `tag-page` code block.
- Create dedicated tag pages with a simple command that seeds the block for you.
- Customize the directory where tag pages are stored (for the create command).
- Include lines containing the tag and/or bulleted sub-items in the tag page.
- Sort, title, and link settings to match your vault’s style.
- Choose whether reference links appear at the start or end of each pulled line.

## Installation

To install the Obsidian Tag Page Plugin:

1. Open Obsidian.
2. Navigate to **Settings** > **Community plugins** > **Browse**.
3. Search for "Tag Page Plugin" and click **Install**.

## Usage

### Tag page code block

Add a `tag-page` code block anywhere in a note to render content for one or more tags:

````markdown
```tag-page
tags: #this #that
```
````

Your own content above or below the block stays untouched.

### Commands

- **Create Tag Page**: Trigger this command to create a new tag page or navigate to an existing one.
  - Entering `#some-tag` will create a new tag page with the code block pre-populated for `#some-tag` in the default tag page directory.
  - Entering `#some-tag/*` will create a new tag page scoped to nested tags under `#some-tag` in the default tag page directory.
  - The generated page includes a `tag-page` block so you can keep additional notes around it.

### Settings

- **Tag Page Directory**: Customize the directory where new tag pages will be created.
- **Sort By Date**: Sorts content by creation date. Defaults to descending (newest content first)
- **Nested page separator**: Indicate the character used between words when created tag pages. Defaults to `_`.
   - _Example_: `mytag_nested.md`
- **Tag page title template**: Template for the titles of the tag pages. If left empty, a default title will be generated: `Tag Content for {{tag}}`.There are three (case sensitive) placeholders available:
   - `{{tag}}`: Will by replaced by the actual tag with a link (e.g. `#Birds`).
   - `{{tagname}}`: Will be replaced by the tag name without the `#` symbol and without a link (e.g. `Birds` if the tag is `#Birds`).
   - `{{lf}}`: Will be replaced by a newline (line feed). With this placeholder, you can add spacing or static text between the title and the tags.
- **Include Lines**: Choose to include lines containing the tag in the tag page.
- **Bulleted Sub Items**: Choose to include bulleted sub-items containing the tag in the tag page.
- **Display Full Link Names**: When off, referenced content will end with a link aliased as `*`. When toggled on, it will use the full file name for the link.
- **Link position**: Place the reference link at the start or end of each pulled line.

## Development

To contribute to this project, please see the [Contributing](https://github.com/mjsumpter/obsidian-tag-page/blob/develop/CONTRIBUTING.md) guidelines. 

## Support

For any issues, please refer to the GitHub [Issues](https://github.com/mjsumpter/obsidian-tag-page/issues) page or contact the maintainers.

## License

This project is licensed under [MIT License](LICENSE).
