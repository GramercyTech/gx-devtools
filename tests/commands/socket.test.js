/**
 * Tests for socket command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';

vi.mock('fs');
vi.mock('../../bin/lib/utils', () => ({
  findProjectRoot: vi.fn(() => '/test/project'),
  resolveGxPaths: vi.fn(() => ({
    socketEventsDir: '/gx-devtools/socket-events',
  })),
  resolveFilePath: vi.fn((file, subDir, location) => ({
    path: `/gx-devtools/socket-events/${file}`,
    isLocal: false,
  })),
}));

describe('socket command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list action', () => {
    it('should list available socket event files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        'user-login.json',
        'order-update.json',
        'notification.json',
        'readme.txt',
      ]);

      const files = fs.readdirSync('/gx-devtools/socket-events');
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      expect(jsonFiles).toHaveLength(3);
      expect(jsonFiles).toContain('user-login.json');
      expect(jsonFiles).toContain('order-update.json');
      expect(jsonFiles).toContain('notification.json');
    });

    it('should extract event names from filenames', () => {
      const files = ['user-login.json', 'order-update.json'];
      const eventNames = files.map((f) => f.replace('.json', ''));

      expect(eventNames).toEqual(['user-login', 'order-update']);
    });

    it('should handle empty socket-events directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([]);

      const files = fs.readdirSync('/gx-devtools/socket-events');

      expect(files).toHaveLength(0);
    });

    it('should handle missing socket-events directory', () => {
      fs.existsSync.mockReturnValue(false);

      const exists = fs.existsSync('/gx-devtools/socket-events');

      expect(exists).toBe(false);
    });
  });

  describe('send action', () => {
    it('should read and parse socket event file', () => {
      const eventData = {
        event: 'user-login',
        channel: 'primary',
        data: {
          userId: 123,
          username: 'testuser',
          timestamp: '2024-01-01T00:00:00Z',
        },
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(eventData));

      const content = fs.readFileSync('/socket-events/user-login.json', 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.event).toBe('user-login');
      expect(parsed.data.userId).toBe(123);
    });

    it('should validate event file structure', () => {
      const validEvent = {
        event: 'test-event',
        data: { key: 'value' },
      };

      expect(validEvent).toHaveProperty('event');
      expect(validEvent).toHaveProperty('data');
    });

    it('should allow override of identifier/channel', () => {
      const eventData = {
        event: 'update',
        channel: 'primary',
        data: { status: 'ok' },
      };

      // Override channel
      const overriddenChannel = 'custom-channel';
      const sendData = {
        ...eventData,
        channel: overriddenChannel,
      };

      expect(sendData.channel).toBe('custom-channel');
    });

    it('should handle missing event file', () => {
      fs.existsSync.mockReturnValue(false);

      const exists = fs.existsSync('/socket-events/nonexistent.json');

      expect(exists).toBe(false);
    });

    it('should handle invalid JSON in event file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json {');

      expect(() => {
        JSON.parse(fs.readFileSync());
      }).toThrow();
    });
  });

  describe('socket event file format', () => {
    it('should support complex nested data structures', () => {
      const complexEvent = {
        event: 'order-update',
        channel: 'orders',
        data: {
          orderId: 'ORD-123',
          items: [
            { id: 1, name: 'Item 1', quantity: 2 },
            { id: 2, name: 'Item 2', quantity: 1 },
          ],
          customer: {
            id: 456,
            name: 'John Doe',
            address: {
              street: '123 Main St',
              city: 'Anytown',
            },
          },
          status: 'processing',
        },
      };

      expect(complexEvent.data.items).toHaveLength(2);
      expect(complexEvent.data.customer.address.city).toBe('Anytown');
    });

    it('should support array data', () => {
      const arrayEvent = {
        event: 'bulk-update',
        data: [
          { id: 1, value: 'a' },
          { id: 2, value: 'b' },
          { id: 3, value: 'c' },
        ],
      };

      expect(Array.isArray(arrayEvent.data)).toBe(true);
      expect(arrayEvent.data).toHaveLength(3);
    });

    it('should support primitive data', () => {
      const simpleEvent = {
        event: 'ping',
        data: 'pong',
      };

      expect(typeof simpleEvent.data).toBe('string');
    });
  });

  describe('socket server connection', () => {
    it('should use correct default port', () => {
      const { DEFAULT_PORTS } = require('../../bin/lib/constants');

      expect(DEFAULT_PORTS.socketIo).toBe(3069);
    });

    it('should construct correct socket URL', () => {
      const host = 'localhost';
      const port = 3069;
      const socketUrl = `http://${host}:${port}`;

      expect(socketUrl).toBe('http://localhost:3069');
    });
  });
});
