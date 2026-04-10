# Importing Claude Conversations into Obsidian with Nexus AI Chat Importer

The [Nexus AI Chat Importer](https://github.com/Superkikim/nexus-ai-chat-importer) is a community Obsidian plugin that imports AI conversation exports from **Claude**, **ChatGPT**, and **Le Chat** into beautifully formatted Markdown notes. It preserves formatting, attachments, and conversation structure within your vault, making it easy to build a personal knowledge graph from your AI interactions.

## Why Import Your Conversations?

- **Searchable archive** -- Every conversation becomes a Markdown file you can search, tag, and link to other notes.
- **Knowledge graph** -- Obsidian's graph view visualizes connections between your conversations and other notes, revealing patterns in your thinking.
- **Offline access** -- Your conversations live in your vault, not on a remote server.
- **RAG-ready** -- Use your imported conversations as a retrieval-augmented generation (RAG) source for future AI workflows.

## Supported Platforms

| Platform | Export Path |
|----------|------------|
| **Claude** | Settings > Privacy > Export data |
| **ChatGPT** | Settings > Data Controls > Export data |
| **Le Chat** | Profile > Le Chat: Export |

Each platform provides a ZIP archive of your conversations. The plugin auto-detects the provider from the archive contents.

## Installation

### From Obsidian Community Plugins (Recommended)

1. Open **Settings > Community Plugins > Browse**
2. Search for **"Nexus AI Chat Importer"**
3. Click **Install**, then **Enable**

### Manual Installation

1. Download the latest release from the [GitHub Releases page](https://github.com/Superkikim/nexus-ai-chat-importer/releases)
2. Extract to your vault's `.obsidian/plugins/nexus-ai-chat-importer/` directory
3. Enable the plugin in **Settings > Community Plugins**

## Quick Start (2-Minute Setup)

1. **Export your Claude conversations** -- Go to [claude.ai](https://claude.ai), open **Settings > Privacy > Export data**. You'll receive an email with a download link for a ZIP archive.
2. **Open the importer** -- Click the Nexus ribbon icon in Obsidian, or use the Command Palette (`Ctrl/Cmd + P`) and search for **"Import AI conversations"**.
3. **Select your ZIP file(s)** -- The provider is auto-detected from the first supported archive.
4. **Choose your import style**:
   - **Import All** -- Imports every conversation immediately.
   - **Select Conversations** -- Pick specific conversations with filtering by keyword, status, or date.
5. **Done** -- Your conversations appear in `Nexus/Conversations/` organized by provider, year, and month.

## File Organization

After import, your vault will contain:

```
Nexus/
├── Conversations/
│   └── <provider>/
│       └── YYYY/MM/
│           └── [DATE] - Conversation Title.md
│
├── Attachments/
│   └── <provider>/
│       ├── images/
│       ├── documents/
│       └── artifacts/    (Claude-specific)
│
└── Reports/
    └── <provider>/
        └── <timestamp>/
            ├── summary.md
            ├── index-heavy.md
            └── index-mobile.md
```

## Configuration

Access settings via **Settings > Community Plugins > Nexus AI Chat Importer**.

### Folder Paths

| Setting | Default | Description |
|---------|---------|-------------|
| Conversations folder | `Nexus/Conversations` | Where imported conversations are stored |
| Attachments folder | `Nexus/Attachments` | Where images, documents, and artifacts are saved |
| Reports folder | `Nexus/Reports` | Where import reports are generated |

Changing folder paths will automatically migrate existing files.

### Filename Options

- **Date prefix** -- Prepend dates to filenames (e.g., `2025-03-15 - My Conversation.md`)
- **Date format** -- Choose between `YYYY-MM-DD` or `YYYYMMDD`
- **Timestamp format** -- Auto (matches Obsidian locale) or custom format

## Claude-Specific Features

- **Artifact versioning** -- Claude artifacts are saved in separate files with version tracking. Multiple modifications to the same artifact are preserved.
- **Direct chat links** -- Each imported note includes a URL back to the original conversation on claude.ai.
- **Role-specific callouts** -- User and assistant messages are formatted with distinct callout styles for easy visual scanning.

## Import Reports

Each import generates three linked documents:

- **Summary** -- Global statistics, per-archive status, and any errors encountered.
- **Index Heavy** -- Full conversation listing with tables, optimized for desktop.
- **Index Mobile** -- Compact format optimized for mobile viewing.

## Advanced Usage

### CLI Mode

The plugin includes a command-line interface for importing conversations without opening Obsidian, useful for automation, large archives, or headless setups.

### Smart Deduplication

When importing multiple ZIP exports over time, the plugin detects and skips conversations that have already been imported, preventing duplicate files.

### Building a Knowledge Graph

To get the most out of your imported conversations:

1. **Tag your notes** -- Add tags to imported conversations to categorize by topic or project.
2. **Link notes together** -- Use `[[wikilinks]]` to connect conversations that reference the same concepts.
3. **Use Obsidian's graph view** -- Visualize how your conversations connect to each other and to your other notes.
4. **Create index notes** -- Build MOC (Map of Content) files that link to related conversations by theme.

## Troubleshooting

- **Plugin not finding conversations** -- Ensure you're selecting the original ZIP file from Claude's export, not an extracted folder.
- **Duplicate conversations appearing** -- This is usually caused by re-importing the same archive. The plugin's deduplication should handle this automatically in most cases.
- **Special characters in filenames** -- The plugin sanitizes filenames automatically, but some edge cases on Windows may require manual fixes.

## Resources

- **GitHub**: [Superkikim/nexus-ai-chat-importer](https://github.com/Superkikim/nexus-ai-chat-importer)
- **Obsidian Forum**: [Plugin announcement thread](https://forum.obsidian.md/t/plugin-nexus-ai-chat-importer-import-chatgpt-and-claude-conversations-to-your-vault/71664)
- **License**: GPL-3.0
