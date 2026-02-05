/**
 * Tests for extract-config.js
 *
 * Tests the configuration extraction logic without calling actual filesystem operations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('extract-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractFromScript patterns', () => {
    it('should match getString calls with single quotes', () => {
      const content = "const title = store.getString('welcome_title', 'Welcome');";
      const regex = /\.getString\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]([^'"`]*)['"`])?\s*\)/g;

      const match = regex.exec(content);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('welcome_title');
      expect(match[2]).toBe('Welcome');
    });

    it('should match getString calls with double quotes', () => {
      const content = 'const title = store.getString("welcome_title", "Welcome");';
      const regex = /\.getString\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]([^'"`]*)['"`])?\s*\)/g;

      const match = regex.exec(content);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('welcome_title');
      expect(match[2]).toBe('Welcome');
    });

    it('should match getSetting calls', () => {
      const content = "const color = store.getSetting('primary_color', '#FF0000');";
      const regex = /\.getSetting\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]?([^'"`),]*)['"`]?)?\s*\)/g;

      const match = regex.exec(content);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('primary_color');
    });

    it('should match getAsset calls', () => {
      const content = "const logo = store.getAsset('logo', '/images/logo.png');";
      const regex = /\.getAsset\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]([^'"`]*)['"`])?\s*\)/g;

      const match = regex.exec(content);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('logo');
      expect(match[2]).toBe('/images/logo.png');
    });

    it('should match getState calls', () => {
      const content = "const active = store.getState('is_active', false);";
      const regex = /\.getState\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]?([^'"`),]*)['"`]?)?\s*\)/g;

      const match = regex.exec(content);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('is_active');
    });

    it('should match apiGet calls with identifier', () => {
      const content = "await store.apiGet('/users', 'user-api');";
      const regex = /\.(?:callApi|apiGet|apiPost|apiPut|apiPatch|apiDelete)\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]([^'"`]+)['"`])?\s*\)/g;

      const match = regex.exec(content);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('/users');
      expect(match[2]).toBe('user-api');
    });

    it('should match apiPost calls', () => {
      const content = "await store.apiPost('/orders', 'order-api');";
      const regex = /\.(?:callApi|apiGet|apiPost|apiPut|apiPatch|apiDelete)\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*['"`]([^'"`]+)['"`])?\s*\)/g;

      const match = regex.exec(content);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('/orders');
      expect(match[2]).toBe('order-api');
    });

    it('should match listenSocket calls', () => {
      const content = "store.listenSocket('notifications', 'new-message', callback);";
      const regex = /\.(?:listenSocket|useSocketListener)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;

      const match = regex.exec(content);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('notifications');
      expect(match[2]).toBe('new-message');
    });

    it('should match useSocketListener calls', () => {
      const content = "store.useSocketListener('events', 'update', handler);";
      const regex = /\.(?:listenSocket|useSocketListener)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;

      const match = regex.exec(content);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('events');
      expect(match[2]).toBe('update');
    });
  });

  describe('extractFromTemplate patterns', () => {
    it('should extract template section from Vue file', () => {
      const content = `
        <template>
          <h1>Hello World</h1>
        </template>
        <script></script>
      `;
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);

      expect(templateMatch).not.toBeNull();
      expect(templateMatch[1]).toContain('Hello World');
    });

    it('should match gxp-string directive', () => {
      const template = '<h1 gxp-string="welcome_title">Default Welcome</h1>';
      const regex = /<([a-z][a-z0-9-]*)\s+[^>]*(?:v-gxp-string|gxp-string)=["']([^"']+)["'][^>]*>([^<]*)</gi;

      const match = regex.exec(template);
      expect(match).not.toBeNull();
      expect(match[2]).toBe('welcome_title');
      expect(match[3]).toBe('Default Welcome');
    });

    it('should match v-gxp-string directive', () => {
      const template = '<p v-gxp-string="subtitle">Default Subtitle</p>';
      const regex = /<([a-z][a-z0-9-]*)\s+[^>]*(?:v-gxp-string|gxp-string)=["']([^"']+)["'][^>]*>([^<]*)</gi;

      const match = regex.exec(template);
      expect(match).not.toBeNull();
      expect(match[2]).toBe('subtitle');
    });

    it('should detect gxp-setting modifier', () => {
      const template = '<span gxp-string="company" gxp-setting>Acme</span>';
      const hasGxpSetting = /gxp-setting|v-gxp-setting/i.test(template);

      expect(hasGxpSetting).toBe(true);
    });

    it('should detect gxp-asset modifier', () => {
      const template = '<span gxp-string="url" gxp-asset>/default.png</span>';
      const hasGxpAsset = /gxp-asset|v-gxp-asset/i.test(template);

      expect(hasGxpAsset).toBe(true);
    });

    it('should detect gxp-state modifier', () => {
      const template = '<span gxp-string="status" gxp-state>idle</span>';
      const hasGxpState = /gxp-state|v-gxp-state/i.test(template);

      expect(hasGxpState).toBe(true);
    });

    it('should match gxp-src directive', () => {
      const template = '<img gxp-src="hero_image" src="/default/hero.jpg" />';
      const regex = /<([a-z][a-z0-9-]*)\s+[^>]*(?:v-gxp-src|gxp-src)=["']([^"']+)["'][^>]*src=["']([^"']+)["'][^>]*\/?>/gi;

      const match = regex.exec(template);
      expect(match).not.toBeNull();
      expect(match[2]).toBe('hero_image');
      expect(match[3]).toBe('/default/hero.jpg');
    });

    it('should match gxp-src with reversed attribute order', () => {
      const template = '<img src="/default.jpg" gxp-src="image_key" />';
      const regex = /<([a-z][a-z0-9-]*)\s+[^>]*src=["']([^"']+)["'][^>]*(?:v-gxp-src|gxp-src)=["']([^"']+)["'][^>]*\/?>/gi;

      const match = regex.exec(template);
      expect(match).not.toBeNull();
      expect(match[2]).toBe('/default.jpg');
      expect(match[3]).toBe('image_key');
    });
  });

  describe('mergeConfig', () => {
    const { mergeConfig } = require('../../bin/lib/utils/extract-config');

    it('should merge extracted config into existing manifest', () => {
      const existing = {
        name: 'test-app',
        strings: { default: { existing_key: 'existing' } },
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      const extracted = {
        strings: { new_key: 'new value' },
        settings: { color: '#FF0000' },
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      const merged = mergeConfig(existing, extracted);

      expect(merged.name).toBe('test-app');
      expect(merged.strings.default.existing_key).toBe('existing');
      expect(merged.strings.default.new_key).toBe('new value');
      expect(merged.settings.color).toBe('#FF0000');
    });

    it('should not overwrite existing values by default', () => {
      const existing = {
        strings: { default: { key: 'original' } },
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      const extracted = {
        strings: { key: 'new' },
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      const merged = mergeConfig(existing, extracted);

      expect(merged.strings.default.key).toBe('original');
    });

    it('should overwrite existing values when overwrite option is true', () => {
      const existing = {
        strings: { default: { key: 'original' } },
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      const extracted = {
        strings: { key: 'new' },
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      const merged = mergeConfig(existing, extracted, { overwrite: true });

      expect(merged.strings.default.key).toBe('new');
    });

    it('should merge dependencies by identifier', () => {
      const existing = {
        strings: { default: {} },
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [{ identifier: 'api-1', path: '/v1' }],
      };

      const extracted = {
        strings: {},
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [{ identifier: 'api-2', path: '/v2' }],
      };

      const merged = mergeConfig(existing, extracted);

      expect(merged.dependencies).toHaveLength(2);
      expect(merged.dependencies.find((d) => d.identifier === 'api-2')).toBeDefined();
    });

    it('should create nested structures if missing', () => {
      const existing = { name: 'test' };
      const extracted = {
        strings: { key: 'value' },
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      const merged = mergeConfig(existing, extracted);

      expect(merged.strings.default.key).toBe('value');
      expect(merged.settings).toEqual({});
      expect(merged.assets).toEqual({});
      expect(merged.triggerState).toEqual({});
      expect(merged.dependencies).toEqual([]);
    });
  });

  describe('generateSummary', () => {
    const { generateSummary } = require('../../bin/lib/utils/extract-config');

    it('should generate summary for empty config', () => {
      const config = {
        strings: {},
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      const summary = generateSummary(config);

      expect(summary).toContain('No configuration found');
    });

    it('should include string count and values', () => {
      const config = {
        strings: { welcome: 'Hello', goodbye: 'Bye' },
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      const summary = generateSummary(config);

      expect(summary).toContain('Strings (2)');
      expect(summary).toContain('welcome');
      expect(summary).toContain('Hello');
    });

    it('should include settings count and values', () => {
      const config = {
        strings: {},
        settings: { color: '#FF0000', enabled: true },
        assets: {},
        triggerState: {},
        dependencies: [],
      };

      const summary = generateSummary(config);

      expect(summary).toContain('Settings (2)');
      expect(summary).toContain('color');
    });

    it('should include dependencies with events', () => {
      const config = {
        strings: {},
        settings: {},
        assets: {},
        triggerState: {},
        dependencies: [
          { identifier: 'notifications', path: '', events: { update: 'update' } },
        ],
      };

      const summary = generateSummary(config);

      expect(summary).toContain('Dependencies (1)');
      expect(summary).toContain('notifications');
      expect(summary).toContain('Events:');
    });
  });
});
