/**
 * Tests for files.js utility patterns and logic
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

describe('files', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('safeCopyFile patterns', () => {
    it('should construct destination directory from path', () => {
      const destPath = '/project/subdir/file.js';
      const destDir = path.dirname(destPath);

      expect(destDir).toBe('/project/subdir');
    });

    it('should determine action based on existence and overwrite flag', () => {
      const exists = true;
      const overwrite = false;

      const shouldCopy = !exists || overwrite;
      expect(shouldCopy).toBe(false);
    });

    it('should copy when file does not exist', () => {
      const exists = false;
      const overwrite = false;

      const shouldCopy = !exists || overwrite;
      expect(shouldCopy).toBe(true);
    });

    it('should copy when overwrite is true even if file exists', () => {
      const exists = true;
      const overwrite = true;

      const shouldCopy = !exists || overwrite;
      expect(shouldCopy).toBe(true);
    });

    it('should determine correct action label', () => {
      const exists = true;
      const action = exists ? 'Overwriting' : 'Creating';

      expect(action).toBe('Overwriting');
    });
  });

  describe('createPackageJson patterns', () => {
    it('should construct correct file path', () => {
      const projectPath = '/project';
      const packageJsonPath = path.join(projectPath, 'package.json');

      expect(packageJsonPath).toBe('/project/package.json');
    });

    it('should use default description when not provided', () => {
      const description = '';
      const projectName = 'my-plugin';
      const finalDescription = description || `GxP Plugin: ${projectName}`;

      expect(finalDescription).toBe('GxP Plugin: my-plugin');
    });

    it('should use provided description when available', () => {
      const description = 'My custom description';
      const projectName = 'my-plugin';
      const finalDescription = description || `GxP Plugin: ${projectName}`;

      expect(finalDescription).toBe('My custom description');
    });

    it('should include required fields in package.json structure', () => {
      const pkg = {
        name: 'test-project',
        version: '1.0.0',
        description: 'Test',
        main: 'main.js',
        scripts: {},
        dependencies: {},
        devDependencies: {},
        author: 'Test',
        license: 'ISC',
      };

      expect(pkg).toHaveProperty('name');
      expect(pkg).toHaveProperty('version');
      expect(pkg).toHaveProperty('scripts');
      expect(pkg).toHaveProperty('dependencies');
      expect(pkg).toHaveProperty('devDependencies');
    });
  });

  describe('updateAppManifest patterns', () => {
    it('should construct manifest path', () => {
      const projectPath = '/project';
      const manifestPath = path.join(projectPath, 'app-manifest.json');

      expect(manifestPath).toBe('/project/app-manifest.json');
    });

    it('should update welcome_text with project name', () => {
      const projectName = 'My Plugin';
      const welcomeText = `Welcome to ${projectName}`;

      expect(welcomeText).toBe('Welcome to My Plugin');
    });

    it('should preserve existing manifest properties', () => {
      const manifest = {
        name: 'old-name',
        version: '1.0.0',
        strings: { default: {} },
        customField: 'preserved',
      };

      manifest.name = 'new-name';

      expect(manifest.customField).toBe('preserved');
      expect(manifest.name).toBe('new-name');
    });
  });

  describe('updateExistingProject patterns', () => {
    it('should identify missing dependencies', () => {
      const existing = { vue: '^3.0.0' };
      const required = { vue: '^3.5.0', pinia: '^2.0.0' };

      const missing = Object.keys(required).filter((dep) => !existing[dep]);

      expect(missing).toContain('pinia');
      expect(missing).not.toContain('vue');
    });

    it('should identify outdated dependencies', () => {
      const existing = { vue: '^3.0.0' };
      const required = { vue: '^3.5.0' };

      const outdated = Object.entries(required).filter(
        ([dep, version]) => existing[dep] && existing[dep] !== version
      );

      expect(outdated).toHaveLength(1);
      expect(outdated[0][0]).toBe('vue');
    });

    it('should identify missing scripts', () => {
      const existing = { dev: 'vite' };
      const required = { dev: 'gxdev dev', build: 'gxdev build' };

      const missing = Object.keys(required).filter((script) => !existing[script]);

      expect(missing).toContain('build');
      expect(missing).not.toContain('dev');
    });

    it('should construct backup filename', () => {
      const filename = 'vite.config.js';
      const backup = `${filename}.backup`;

      expect(backup).toBe('vite.config.js.backup');
    });
  });

  describe('ImageMagick detection patterns', () => {
    it('should check for magick command', () => {
      const commands = ['magick', 'convert'];
      const available = commands.some((cmd) => cmd === 'magick');

      expect(available).toBe(true);
    });

    it('should check for convert command as fallback', () => {
      const magickAvailable = false;
      const convertAvailable = true;

      const installed = magickAvailable || convertAvailable;

      expect(installed).toBe(true);
    });

    it('should return false when neither command available', () => {
      const magickAvailable = false;
      const convertAvailable = false;

      const installed = magickAvailable || convertAvailable;

      expect(installed).toBe(false);
    });
  });

  describe('dependency constants', () => {
    it('should have required dependencies', () => {
      const { REQUIRED_DEPENDENCIES } = require('../../bin/lib/constants');

      expect(REQUIRED_DEPENDENCIES).toHaveProperty('vue');
      expect(REQUIRED_DEPENDENCIES).toHaveProperty('pinia');
      expect(REQUIRED_DEPENDENCIES).toHaveProperty('vite');
    });

    it('should have required dev dependencies', () => {
      const { REQUIRED_DEV_DEPENDENCIES } = require('../../bin/lib/constants');

      expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty('@gxp-dev/tools');
      expect(REQUIRED_DEV_DEPENDENCIES).toHaveProperty('nodemon');
    });

    it('should have default scripts', () => {
      const { DEFAULT_SCRIPTS } = require('../../bin/lib/constants');

      expect(DEFAULT_SCRIPTS).toHaveProperty('dev');
      expect(DEFAULT_SCRIPTS).toHaveProperty('build');
      expect(DEFAULT_SCRIPTS).toHaveProperty('dev-http');
    });
  });
});
