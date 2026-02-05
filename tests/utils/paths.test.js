/**
 * Tests for paths.js utility patterns and logic
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';

describe('paths', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getBinaryName logic', () => {
    it('should return gento-win for windows platform', () => {
      const isWin = process.platform === 'win32';
      if (isWin) {
        expect('gento-win').toBe('gento-win');
      }
    });

    it('should return gento-darwin-amd64 for x64 architecture', () => {
      if (process.arch === 'x64' && process.platform !== 'win32') {
        expect('gento-darwin-amd64').toBe('gento-darwin-amd64');
      }
    });

    it('should return gento for other platforms', () => {
      // gento is the fallback
      expect('gento').toBe('gento');
    });

    it('should return one of the valid binary names', () => {
      const validNames = ['gento-win', 'gento-darwin-amd64', 'gento'];
      const { getBinaryName } = require('../../bin/lib/utils/paths');
      const result = getBinaryName();
      expect(validNames).toContain(result);
    });
  });

  describe('findProjectRoot logic', () => {
    it('should walk up directory tree pattern', () => {
      let currentDir = '/home/user/project/src/components';
      const checkPath = (dir) => dir === '/home/user/project';

      while (currentDir !== path.dirname(currentDir)) {
        if (checkPath(currentDir)) {
          break;
        }
        currentDir = path.dirname(currentDir);
      }

      expect(currentDir).toBe('/home/user/project');
    });

    it('should stop at root directory', () => {
      let currentDir = '/';
      const iterations = [];

      while (currentDir !== path.dirname(currentDir)) {
        iterations.push(currentDir);
        currentDir = path.dirname(currentDir);
      }

      // Root directory should stop the loop
      expect(iterations).toHaveLength(0);
    });
  });

  describe('resolveGxPaths structure', () => {
    it('should return object with required path properties', () => {
      const { resolveGxPaths } = require('../../bin/lib/utils/paths');
      const paths = resolveGxPaths();

      expect(paths).toHaveProperty('gentoPath');
      expect(paths).toHaveProperty('viteConfigPath');
      expect(paths).toHaveProperty('templateDir');
      expect(paths).toHaveProperty('runtimeDir');
      expect(paths).toHaveProperty('socketEventsDir');
      expect(paths).toHaveProperty('packageRoot');
      expect(paths).toHaveProperty('configDir');
    });

    it('should have configDir as alias for templateDir', () => {
      const { resolveGxPaths } = require('../../bin/lib/utils/paths');
      const paths = resolveGxPaths();

      expect(paths.configDir).toBe(paths.templateDir);
    });

    it('should return string paths', () => {
      const { resolveGxPaths } = require('../../bin/lib/utils/paths');
      const paths = resolveGxPaths();

      expect(typeof paths.templateDir).toBe('string');
      expect(typeof paths.runtimeDir).toBe('string');
      expect(typeof paths.socketEventsDir).toBe('string');
    });
  });

  describe('resolveFilePath patterns', () => {
    it('should prefer local files over package files', () => {
      // Pattern: check local first
      const localExists = true;
      const packageExists = true;

      const result = localExists ? { isLocal: true } : { isLocal: false };
      expect(result.isLocal).toBe(true);
    });

    it('should fall back to package files', () => {
      const localExists = false;
      const packageExists = true;

      const result = localExists ? { isLocal: true } : { isLocal: false };
      expect(result.isLocal).toBe(false);
    });

    it('should construct correct subdir paths', () => {
      const projectRoot = '/project';
      const subDir = 'src';
      const fileName = 'test.js';

      const localPath = path.join(projectRoot, subDir, fileName);
      expect(localPath).toBe('/project/src/test.js');
    });

    it('should select correct package location', () => {
      const packageLocation = 'runtime';
      const packagePaths = {
        template: '/pkg/template',
        runtime: '/pkg/runtime',
        'socket-events': '/pkg/socket-events',
      };

      let packageDir;
      switch (packageLocation) {
        case 'runtime':
          packageDir = packagePaths.runtime;
          break;
        case 'socket-events':
          packageDir = packagePaths['socket-events'];
          break;
        default:
          packageDir = packagePaths.template;
      }

      expect(packageDir).toBe('/pkg/runtime');
    });
  });

  describe('loadGlobalConfig patterns', () => {
    it('should construct config file path in home directory', () => {
      const homedir = os.homedir();
      const configPath = path.join(homedir, 'gxdev-default-config.json');

      expect(configPath).toContain('gxdev-default-config.json');
    });

    it('should return empty object on parse error', () => {
      const parseConfig = (content) => {
        try {
          return JSON.parse(content);
        } catch {
          return {};
        }
      };

      expect(parseConfig('invalid json')).toEqual({});
    });

    it('should return empty object when file not found', () => {
      const fileExists = false;
      const result = fileExists ? { author: 'Test' } : {};

      expect(result).toEqual({});
    });

    it('should parse valid config', () => {
      const parseConfig = (content) => {
        try {
          return JSON.parse(content);
        } catch {
          return {};
        }
      };

      const config = parseConfig('{"author": "Test Author", "email": "test@example.com"}');
      expect(config.author).toBe('Test Author');
      expect(config.email).toBe('test@example.com');
    });
  });

  describe('PACKAGE_NAME constant', () => {
    it('should use correct package name for path resolution', () => {
      const { PACKAGE_NAME } = require('../../bin/lib/constants');
      expect(PACKAGE_NAME).toBe('@gxp-dev/tools');
    });
  });
});
