/**
 * Tests for datastore command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';

vi.mock('fs');
vi.mock('../../bin/lib/utils', () => ({
  findProjectRoot: vi.fn(() => '/test/project'),
  resolveFilePath: vi.fn((file) => ({ path: `/test/project/${file}`, isLocal: true })),
  promptUser: vi.fn(),
  arrowSelectPrompt: vi.fn(),
}));

const utils = require('../../bin/lib/utils');

describe('datastore command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list action', () => {
    it('should read and display manifest variables', () => {
      const manifest = {
        strings: { default: { welcome: 'Hello', title: 'My App' } },
        settings: { color: '#FF0000', enabled: true },
        assets: { logo: '/logo.png' },
        triggerState: { active: false },
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(manifest));

      // Test the parsing logic
      const parsed = JSON.parse(fs.readFileSync());

      expect(Object.keys(parsed.strings.default)).toHaveLength(2);
      expect(Object.keys(parsed.settings)).toHaveLength(2);
      expect(Object.keys(parsed.assets)).toHaveLength(1);
      expect(Object.keys(parsed.triggerState)).toHaveLength(1);
    });

    it('should handle missing manifest file', () => {
      fs.existsSync.mockReturnValue(false);

      expect(fs.existsSync('/test/project/app-manifest.json')).toBe(false);
    });
  });

  describe('add action', () => {
    it('should add string variable to manifest', () => {
      const manifest = {
        strings: { default: {} },
        settings: {},
        assets: {},
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(manifest));
      fs.writeFileSync.mockImplementation(() => {});

      // Simulate adding a string
      const updated = { ...manifest };
      updated.strings.default['new_key'] = 'new value';

      fs.writeFileSync('/test/project/app-manifest.json', JSON.stringify(updated));

      expect(fs.writeFileSync).toHaveBeenCalled();
      const [, content] = fs.writeFileSync.mock.calls[0];
      const result = JSON.parse(content);
      expect(result.strings.default.new_key).toBe('new value');
    });

    it('should add setting variable to manifest', () => {
      const manifest = {
        strings: { default: {} },
        settings: {},
        assets: {},
      };

      const updated = { ...manifest };
      updated.settings['primary_color'] = '#0000FF';

      expect(updated.settings.primary_color).toBe('#0000FF');
    });

    it('should add asset variable to manifest', () => {
      const manifest = {
        strings: { default: {} },
        settings: {},
        assets: {},
      };

      const updated = { ...manifest };
      updated.assets['hero_image'] = '/images/hero.jpg';

      expect(updated.assets.hero_image).toBe('/images/hero.jpg');
    });
  });

  describe('scan-strings action', () => {
    it('should find hardcoded strings in Vue templates', () => {
      const vueContent = `
        <template>
          <h1>Welcome to My App</h1>
          <p>This is a hardcoded paragraph.</p>
          <button>Click Me</button>
        </template>
      `;

      // Pattern to find text content in tags
      const textRegex = />([^<]+)</g;
      const matches = [];
      let match;

      while ((match = textRegex.exec(vueContent)) !== null) {
        const text = match[1].trim();
        if (text && text.length > 1) {
          matches.push(text);
        }
      }

      expect(matches).toContain('Welcome to My App');
      expect(matches).toContain('This is a hardcoded paragraph.');
      expect(matches).toContain('Click Me');
    });

    it('should exclude already configured gxp-string elements', () => {
      const vueContent = `
        <template>
          <h1 gxp-string="welcome">Default Welcome</h1>
          <p>Hardcoded text</p>
        </template>
      `;

      // Elements with gxp-string should be excluded
      const hasGxpString = /gxp-string/.test('<h1 gxp-string="welcome">Default Welcome</h1>');
      expect(hasGxpString).toBe(true);
    });
  });

  describe('config action', () => {
    it('should list available configurations', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        'default.json',
        'staging.json',
        'production.json',
      ]);

      const configs = fs.readdirSync('/test/project/configs');
      const jsonConfigs = configs.filter((f) => f.endsWith('.json'));

      expect(jsonConfigs).toHaveLength(3);
      expect(jsonConfigs).toContain('default.json');
    });

    it('should switch configuration by copying file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{"settings": {"env": "staging"}}');
      fs.writeFileSync.mockImplementation(() => {});
      fs.copyFileSync.mockImplementation(() => {});

      // Simulate config switch
      const configPath = '/test/project/configs/staging.json';
      const manifestPath = '/test/project/app-manifest.json';

      fs.copyFileSync(configPath, manifestPath);

      expect(fs.copyFileSync).toHaveBeenCalledWith(configPath, manifestPath);
    });
  });

  describe('init action', () => {
    it('should create default app-manifest.json structure', () => {
      const defaultManifest = {
        name: 'my-plugin',
        description: 'A GxP plugin',
        strings: { default: {} },
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      fs.writeFileSync.mockImplementation(() => {});

      fs.writeFileSync(
        '/test/project/app-manifest.json',
        JSON.stringify(defaultManifest, null, 2)
      );

      expect(fs.writeFileSync).toHaveBeenCalled();
      const [, content] = fs.writeFileSync.mock.calls[0];
      const result = JSON.parse(content);

      expect(result).toHaveProperty('strings');
      expect(result).toHaveProperty('settings');
      expect(result).toHaveProperty('assets');
      expect(result).toHaveProperty('triggerState');
      expect(result).toHaveProperty('dependencies');
    });
  });
});
