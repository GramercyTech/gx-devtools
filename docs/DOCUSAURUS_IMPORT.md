# Importing GxP Toolkit Docs into Docusaurus

This guide shows how to configure your platform's Docusaurus site to automatically import documentation from this repository.

## Option 1: Remote Content Plugin (Recommended)

Use `docusaurus-plugin-remote-content` to fetch docs at build time.

### Installation

```bash
npm install docusaurus-plugin-remote-content
```

### Configuration

Add to your `docusaurus.config.js`:

```javascript
module.exports = {
  // ... other config

  plugins: [
    [
      'docusaurus-plugin-remote-content',
      {
        // Unique name for this remote source
        name: 'gx-devtools-docs',

        // GitHub raw content URL for the docs folder
        sourceBaseUrl:
          'https://raw.githubusercontent.com/gramercytech/gx-devtools/develop/docs/',

        // Where to output the fetched docs
        outDir: 'docs/gx-devtools',

        // List of documents to fetch
        documents: [
          'index.md',
          'getting-started.md',
          'app-manifest.md',
          'gxp-store.md',
          'dev-tools.md',
          'building-for-platform.md',
        ],

        // Fetch category config too
        // Note: _category_.json needs special handling (see below)
      },
    ],
  ],
};
```

### Fetching _category_.json

The category file needs to be fetched separately since it's not markdown:

```javascript
module.exports = {
  plugins: [
    // Markdown docs
    [
      'docusaurus-plugin-remote-content',
      {
        name: 'gx-devtools-docs',
        sourceBaseUrl:
          'https://raw.githubusercontent.com/gramercytech/gx-devtools/main/docs/',
        outDir: 'docs/gx-devtools',
        documents: [
          'index.md',
          'getting-started.md',
          'app-manifest.md',
          'gxp-store.md',
          'dev-tools.md',
          'building-for-platform.md',
        ],
        // Ensure content is returned as string (plugin expects {content: string} object)
        modifyContent: (filename, content) => {
          return {
            content: typeof content === "string" ? content : String(content),
          }
        },
      },
    ],
    // Category config (JSON)
    [
      'docusaurus-plugin-remote-content',
      {
        name: 'gx-devtools-category',
        sourceBaseUrl:
          'https://raw.githubusercontent.com/gramercytech/gx-devtools/main/docs/',
        outDir: 'docs/gx-devtools',
        documents: ['_category_.json'],
        // JSON files need to be stringified before writing (plugin expects {content: string} object)
        modifyContent: (filename, content) => {
          return {
            content:
              typeof content === "string"
                ? content
                : JSON.stringify(content, null, 2),
          }
        },
      },
    ],
  ],
};
```

### Dynamic Document List (Advanced)

Fetch the document list dynamically from GitHub API:

```javascript
const { Octokit } = require('@octokit/rest');

module.exports = {
  plugins: [
    [
      'docusaurus-plugin-remote-content',
      {
        name: 'gx-devtools-docs',
        sourceBaseUrl:
          'https://raw.githubusercontent.com/gramercytech/gx-devtools/main/docs/',
        outDir: 'docs/gx-devtools',

        // Dynamically fetch file list
        documents: async () => {
          const octokit = new Octokit();
          const { data } = await octokit.repos.getContent({
            owner: 'gramercytech',
            repo: 'gx-devtools',
            path: 'docs',
          });

          return data
            .filter((file) => file.name.endsWith('.md'))
            .map((file) => file.name);
        },
      },
    ],
  ],
};
```

## Option 2: Git Submodule

Add gx-devtools as a git submodule and reference its docs directly.

### Setup

```bash
# Add submodule
git submodule add https://github.com/gramercytech/gx-devtools.git packages/gx-devtools

# Update .gitmodules
git submodule update --init --recursive
```

### Configuration

```javascript
// docusaurus.config.js
module.exports = {
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          // Include gx-devtools docs
          include: ['**/*.md', '../packages/gx-devtools/docs/**/*.md'],
        },
      },
    ],
  ],
};
```

### CI/CD Update

Add to your build script:

```bash
git submodule update --remote --merge
```

## Option 3: npm Package Docs

Since gx-devtools is an npm package, reference docs from node_modules.

### Configuration

```javascript
// docusaurus.config.js
const path = require('path');

module.exports = {
  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'gx-devtools',
        path: path.resolve(
          __dirname,
          'node_modules/@gramercytech/gx-devtools/docs'
        ),
        routeBasePath: 'gx-devtools',
        sidebarPath: require.resolve('./sidebars-gx-devtools.js'),
      },
    ],
  ],
};
```

### Sidebar Config

Create `sidebars-gx-devtools.js`:

```javascript
module.exports = {
  gxToolkitSidebar: [
    'index',
    'getting-started',
    'app-manifest',
    'gxp-store',
    'dev-tools',
    'building-for-platform',
  ],
};
```

## Sidebar Integration

To include gx-devtools docs in your main sidebar:

```javascript
// sidebars.js
module.exports = {
  docs: [
    'intro',
    'quickstart',
    // ... your other docs

    // Link to gx-devtools section
    {
      type: 'category',
      label: 'GxP Toolkit',
      link: {
        type: 'doc',
        id: 'gx-devtools/index',
      },
      items: [
        'gx-devtools/getting-started',
        'gx-devtools/app-manifest',
        'gx-devtools/gxp-store',
        'gx-devtools/dev-tools',
        'gx-devtools/building-for-platform',
      ],
    },
  ],
};
```

## Customizing Imported Docs

### Modify Content During Fetch

```javascript
[
  'docusaurus-plugin-remote-content',
  {
    name: 'gx-devtools-docs',
    sourceBaseUrl: '...',
    outDir: 'docs/gx-devtools',
    documents: ['getting-started.md'],

    // Modify content before writing
    modifyContent: (filename, content) => {
      // Add custom header
      if (filename === 'index.md') {
        return {
          filename,
          content: content.replace(
            '---',
            '---\ncustom_edit_url: https://github.com/gramercytech/gx-devtools/edit/main/docs/index.md'
          ),
        };
      }
      return undefined; // No modification
    },
  },
];
```

### Override Specific Pages

Create local overrides that take precedence:

```
docs/
├── gx-devtools/           # Remote content lands here
│   ├── index.md          # From remote
│   └── getting-started.md # From remote
└── gx-devtools-overrides/
    └── getting-started.md # Your custom version
```

Configure path priority in Docusaurus.

## Adding/Removing Pages

To add new pages to gx-devtools docs:

1. Create the `.md` file in `/docs/` in this repo
2. Add Docusaurus frontmatter (sidebar_position, title, etc.)
3. Add the filename to the `documents` array in your platform's config
4. Rebuild your platform docs

To remove a page:

1. Remove from the `documents` array
2. Delete from your `outDir` if using CLI sync mode
3. Rebuild

## Triggering Rebuilds

### GitHub Actions (Recommended)

Set up a webhook to rebuild platform docs when gx-devtools changes:

```yaml
# .github/workflows/docs-update.yml (in gx-devtools repo)
name: Notify Platform Docs

on:
  push:
    paths:
      - 'docs/**'

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger platform docs rebuild
        run: |
          curl -X POST \
            -H "Authorization: token ${{ secrets.PLATFORM_DOCS_TOKEN }}" \
            -H "Accept: application/vnd.github.v3+json" \
            https://api.github.com/repos/gramercytech/platform-docs/dispatches \
            -d '{"event_type": "gx-devtools-docs-updated"}'
```

### Manual Rebuild

```bash
# Clear cached remote content
npx docusaurus clear-remote-gx-devtools-docs

# Rebuild
npm run build
```

## Versioning

If you need versioned docs:

```javascript
[
  'docusaurus-plugin-remote-content',
  {
    name: 'gx-devtools-docs-v1',
    sourceBaseUrl:
      'https://raw.githubusercontent.com/gramercytech/gx-devtools/v1.0.0/docs/',
    outDir: 'versioned_docs/version-1.0/gx-devtools',
    documents: ['index.md', '...'],
  },
];
```
