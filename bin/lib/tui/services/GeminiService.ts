import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import open from 'open';
import { EventEmitter } from 'events';

// Gemini configuration interface
export interface GeminiConfig {
  systemPrompt?: string;
  includeDocs?: string[];
  projectContext?: boolean;
  maxContextTokens?: number;
}

// Auth tokens interface
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Get the gxdev config directory
function getConfigDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.gxdev');
}

// Ensure config directory exists
function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

// Get auth file path
function getAuthFilePath(): string {
  return path.join(getConfigDir(), 'gemini-auth.json');
}

// Get config file path
function getConfigFilePath(): string {
  return path.join(getConfigDir(), 'gemini-config.json');
}

// Get docs directory path
function getDocsDir(): string {
  return path.join(getConfigDir(), 'gemini-docs');
}

// Load saved auth tokens
export function loadAuthTokens(): AuthTokens | null {
  try {
    const authPath = getAuthFilePath();
    if (fs.existsSync(authPath)) {
      const content = fs.readFileSync(authPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Invalid or missing auth file
  }
  return null;
}

// Save auth tokens
function saveAuthTokens(tokens: AuthTokens): void {
  ensureConfigDir();
  const authPath = getAuthFilePath();
  fs.writeFileSync(authPath, JSON.stringify(tokens, null, 2));
}

// Clear auth tokens
export function clearAuthTokens(): void {
  const authPath = getAuthFilePath();
  if (fs.existsSync(authPath)) {
    fs.unlinkSync(authPath);
  }
}

// Load Gemini config
export function loadGeminiConfig(): GeminiConfig {
  try {
    const configPath = getConfigFilePath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Invalid or missing config file
  }
  return {
    systemPrompt: 'You are a helpful assistant for GxP plugin development.',
    includeDocs: [],
    projectContext: true,
    maxContextTokens: 4000,
  };
}

// Save Gemini config
export function saveGeminiConfig(config: GeminiConfig): void {
  ensureConfigDir();
  const configPath = getConfigFilePath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Check if authenticated
export function isAuthenticated(): boolean {
  const tokens = loadAuthTokens();
  if (!tokens) return false;
  // Check if token is expired (with 5 min buffer)
  return tokens.expiresAt > Date.now() + 5 * 60 * 1000;
}

// Gemini Service class
export class GeminiService extends EventEmitter {
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private projectContext: string = '';

  constructor() {
    super();
  }

  // Start OAuth flow
  async startOAuthFlow(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      // Create local server for OAuth callback
      const PORT = 8234;
      let server: http.Server;

      const handleCallback = (req: http.IncomingMessage, res: http.ServerResponse) => {
        const url = new URL(req.url || '', `http://localhost:${PORT}`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Authentication Failed</h1><p>You can close this window.</p></body></html>');
            server.close();
            resolve({ success: false, message: `OAuth error: ${error}` });
            return;
          }

          if (code) {
            // Exchange code for tokens
            this.exchangeCodeForTokens(code)
              .then((tokens) => {
                saveAuthTokens(tokens);
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to gxdev.</p></body></html>');
                server.close();
                resolve({ success: true, message: 'Successfully authenticated with Google.' });
              })
              .catch((err) => {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h1>Authentication Failed</h1><p>Error exchanging code for tokens.</p></body></html>');
                server.close();
                resolve({ success: false, message: `Token exchange error: ${err.message}` });
              });
            return;
          }
        }

        res.writeHead(404);
        res.end('Not found');
      };

      server = http.createServer(handleCallback);

      server.listen(PORT, () => {
        // Construct OAuth URL
        // Note: These are placeholder values - you'll need to set up actual Google Cloud credentials
        const clientId = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
        const redirectUri = `http://localhost:${PORT}/callback`;
        const scope = 'https://www.googleapis.com/auth/generative-language';

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(clientId)}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent(scope)}` +
          `&access_type=offline` +
          `&prompt=consent`;

        this.emit('log', `Opening browser for Google authentication...`);
        this.emit('log', `If browser doesn't open, visit: ${authUrl}`);

        open(authUrl).catch(() => {
          this.emit('log', `Could not open browser automatically. Please visit the URL above.`);
        });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        resolve({ success: false, message: 'Authentication timed out. Please try again.' });
      }, 5 * 60 * 1000);
    });
  }

  // Exchange authorization code for tokens
  private async exchangeCodeForTokens(code: string): Promise<AuthTokens> {
    const clientId = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
    const redirectUri = 'http://localhost:8234/callback';

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };
  }

  // Refresh access token
  private async refreshAccessToken(): Promise<void> {
    const tokens = loadAuthTokens();
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: tokens.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json() as any;
    saveAuthTokens({
      accessToken: data.access_token,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + (data.expires_in * 1000),
    });
  }

  // Get valid access token (refresh if needed)
  private async getAccessToken(): Promise<string> {
    const tokens = loadAuthTokens();
    if (!tokens) {
      throw new Error('Not authenticated. Run /gemini enable first.');
    }

    // Check if token needs refresh (with 5 min buffer)
    if (tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
      await this.refreshAccessToken();
      const newTokens = loadAuthTokens();
      return newTokens!.accessToken;
    }

    return tokens.accessToken;
  }

  // Load project context
  loadProjectContext(cwd: string): void {
    const files = ['CLAUDE.md', 'README.md', 'package.json'];
    const contextParts: string[] = [];

    for (const file of files) {
      const filePath = path.join(cwd, file);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          contextParts.push(`=== ${file} ===\n${content.slice(0, 2000)}`);
        } catch {
          // Skip unreadable files
        }
      }
    }

    this.projectContext = contextParts.join('\n\n');
  }

  // Load custom docs
  loadCustomDocs(): string {
    const docsDir = getDocsDir();
    if (!fs.existsSync(docsDir)) {
      return '';
    }

    const docParts: string[] = [];
    try {
      const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
      for (const file of files.slice(0, 5)) { // Limit to 5 docs
        const content = fs.readFileSync(path.join(docsDir, file), 'utf-8');
        docParts.push(`=== ${file} ===\n${content.slice(0, 2000)}`);
      }
    } catch {
      // Skip on error
    }

    return docParts.join('\n\n');
  }

  // Send message to Gemini
  async sendMessage(message: string): Promise<string> {
    const config = loadGeminiConfig();
    const accessToken = await this.getAccessToken();

    // Build context
    let systemContext = config.systemPrompt || '';
    if (config.projectContext && this.projectContext) {
      systemContext += '\n\nProject Context:\n' + this.projectContext;
    }
    const customDocs = this.loadCustomDocs();
    if (customDocs) {
      systemContext += '\n\nDocumentation:\n' + customDocs;
    }

    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: message });

    // Prepare request body for Gemini API
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: systemContext + '\n\nUser: ' + message }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
      }
    };

    // Call Gemini API
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';

    // Add to conversation history
    this.conversationHistory.push({ role: 'assistant', content: responseText });

    return responseText;
  }

  // Clear conversation history
  clearConversation(): void {
    this.conversationHistory = [];
  }

  // Get conversation history
  getConversationHistory(): Array<{ role: string; content: string }> {
    return [...this.conversationHistory];
  }
}

// Singleton instance
export const geminiService = new GeminiService();
