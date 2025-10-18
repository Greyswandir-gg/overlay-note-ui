# Overlay Note UI

A customizable Obsidian plugin that adds overlay buttons to notes for enhanced user interaction.

## Features

- Add customizable overlay buttons to any note
- Configure button layouts and positions per note or globally
- Supports various button actions and styles
- Desktop and mobile compatible

## Installation

1. Download the latest release from the [Releases](https://github.com/yourusername/overlay-note-ui/releases) page.
2. Extract the files into your Obsidian vault's `.obsidian/plugins/` directory.
3. Reload Obsidian and enable the plugin in Settings > Community plugins.

## Usage

After installation, overlay buttons will appear on notes based on your configuration. You can customize button positions and actions through the plugin settings.

### Configuration

- **Global Settings**: Configure default button layouts and positions for all notes.
- **Per-Note Settings**: Override global settings for specific notes using frontmatter.

Example frontmatter:
```yaml
---
overlay-buttons:
  - label: "Edit"
    action: "edit"
    position: "top-right"
---
```

## Compatibility

- Requires Obsidian v1.4.0 or higher
- Works on desktop and mobile

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## License

This plugin is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Author

Created by Greyswandir