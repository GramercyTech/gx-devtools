import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { EventEmitter } from 'events';

// AI Provider types
export type AIProvider = 'claude' | 'codex' | 'gemini';

export interface AIProviderInfo {
  id: AIProvider;
  name: string;
  available: boolean;
  method?: string; // For gemini: 'cli', 'api_key', 'gcloud'
  reason?: string;
}

// AI Configuration
export interface AIConfig {
  provider: AIProvider;
  systemPrompt: string;
  projectContext: boolean;
  maxContextTokens: number;
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

// Get AI config file path
function getAIConfigPath(): string {
  return path.join(getConfigDir(), 'ai-config.json');
}

// Load AI config
export function loadAIConfig(): AIConfig {
  try {
    const configPath = getAIConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Invalid or missing config file
  }
  return {
    provider: 'claude', // Default to Claude
    systemPrompt: 'You are a helpful assistant for GxP plugin development. Help the user build Vue.js components for the GxP kiosk platform.',
    projectContext: true,
    maxContextTokens: 4000,
  };
}

// Save AI config
export function saveAIConfig(config: AIConfig): void {
  ensureConfigDir();
  const configPath = getAIConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Check if a command exists
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Check available AI providers
export function getAvailableProviders(): AIProviderInfo[] {
  const providers: AIProviderInfo[] = [];

  // Check Claude CLI
  if (commandExists('claude')) {
    providers.push({
      id: 'claude',
      name: 'Claude',
      available: true,
    });
  } else {
    providers.push({
      id: 'claude',
      name: 'Claude',
      available: false,
      reason: 'Install: pnpm i -g @anthropic-ai/claude-code && claude login',
    });
  }

  // Check Codex CLI
  if (commandExists('codex')) {
    providers.push({
      id: 'codex',
      name: 'Codex',
      available: true,
    });
  } else {
    providers.push({
      id: 'codex',
      name: 'Codex',
      available: false,
      reason: 'Install: pnpm i -g @openai/codex && codex auth',
    });
  }

  // Check Gemini (CLI, API key, or gcloud)
  if (commandExists('gemini')) {
    providers.push({
      id: 'gemini',
      name: 'Gemini',
      available: true,
      method: 'cli',
    });
  } else if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    providers.push({
      id: 'gemini',
      name: 'Gemini',
      available: true,
      method: 'api_key',
    });
  } else if (commandExists('gcloud')) {
    try {
      const authList = execSync("gcloud auth list --format='value(account)'", { stdio: 'pipe' }).toString();
      if (authList.trim()) {
        providers.push({
          id: 'gemini',
          name: 'Gemini',
          available: true,
          method: 'gcloud',
        });
      }
    } catch {
      providers.push({
        id: 'gemini',
        name: 'Gemini',
        available: false,
        reason: 'Install: pnpm i -g @google/gemini-cli && gemini',
      });
    }
  } else {
    providers.push({
      id: 'gemini',
      name: 'Gemini',
      available: false,
      reason: 'Install: pnpm i -g @google/gemini-cli && gemini',
    });
  }

  return providers;
}

// Get provider display name with status
export function getProviderStatus(provider: AIProviderInfo): string {
  if (!provider.available) {
    return `${provider.name} (not available)`;
  }
  if (provider.method) {
    switch (provider.method) {
      case 'cli':
        return `${provider.name} (CLI)`;
      case 'api_key':
        return `${provider.name} (API key)`;
      case 'gcloud':
        return `${provider.name} (gcloud)`;
    }
  }
  return `${provider.name} (logged in)`;
}

// AI Service class
export class AIService extends EventEmitter {
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private projectContext: string = '';
  private currentProvider: AIProvider;
  private geminiMethod?: string;

  constructor() {
    super();
    const config = loadAIConfig();
    this.currentProvider = config.provider;

    // Determine gemini method if that's the current provider
    const providers = getAvailableProviders();
    const geminiProvider = providers.find(p => p.id === 'gemini');
    if (geminiProvider?.available) {
      this.geminiMethod = geminiProvider.method;
    }
  }

  // Get current provider
  getProvider(): AIProvider {
    return this.currentProvider;
  }

  // Set current provider
  setProvider(provider: AIProvider): { success: boolean; message: string } {
    const providers = getAvailableProviders();
    const providerInfo = providers.find(p => p.id === provider);

    if (!providerInfo) {
      return { success: false, message: `Unknown provider: ${provider}` };
    }

    if (!providerInfo.available) {
      return { success: false, message: `${providerInfo.name} is not available. ${providerInfo.reason || ''}` };
    }

    this.currentProvider = provider;
    if (provider === 'gemini') {
      this.geminiMethod = providerInfo.method;
    }

    // Save to config
    const config = loadAIConfig();
    config.provider = provider;
    saveAIConfig(config);

    this.clearConversation();
    return { success: true, message: `Switched to ${providerInfo.name}` };
  }

  // Check if current provider is available
  isAvailable(): boolean {
    const providers = getAvailableProviders();
    const current = providers.find(p => p.id === this.currentProvider);
    return current?.available || false;
  }

  // Get provider info
  getProviderInfo(): AIProviderInfo | undefined {
    const providers = getAvailableProviders();
    return providers.find(p => p.id === this.currentProvider);
  }

  // Load project context
  loadProjectContext(cwd: string): void {
    const files = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'README.md', 'package.json', 'app-manifest.json'];
    const contextParts: string[] = [];

    for (const file of files) {
      const filePath = path.join(cwd, file);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Limit each file to 2000 chars
          contextParts.push(`=== ${file} ===\n${content.slice(0, 2000)}`);
        } catch {
          // Skip unreadable files
        }
      }
    }

    this.projectContext = contextParts.join('\n\n');
  }

  // Send message using current provider
  async sendMessage(message: string): Promise<string> {
    const config = loadAIConfig();

    // Build context
    let systemContext = config.systemPrompt || '';
    if (config.projectContext && this.projectContext) {
      systemContext += '\n\nProject Context:\n' + this.projectContext;
    }

    switch (this.currentProvider) {
      case 'claude':
        return this.sendWithClaude(message, systemContext);
      case 'codex':
        return this.sendWithCodex(message, systemContext);
      case 'gemini':
        return this.sendWithGemini(message, systemContext);
      default:
        throw new Error(`Unknown provider: ${this.currentProvider}`);
    }
  }

  // Send message with Claude CLI
  private async sendWithClaude(message: string, systemContext: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      const fullPrompt = systemContext ? `${systemContext}\n\nUser: ${message}` : message;

      const claude = spawn('claude', ['--print', '-p', fullPrompt], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      claude.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude error: ${errorOutput || 'Unknown error'}`));
          return;
        }
        this.conversationHistory.push({ role: 'user', content: message });
        this.conversationHistory.push({ role: 'assistant', content: output });
        resolve(output.trim());
      });

      claude.on('error', (err) => {
        reject(new Error(`Failed to run Claude: ${err.message}`));
      });
    });
  }

  // Send message with Codex CLI
  private async sendWithCodex(message: string, systemContext: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      const fullPrompt = systemContext ? `${systemContext}\n\nUser: ${message}` : message;

      const codex = spawn('codex', ['--quiet', '-p', fullPrompt], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      codex.stdout.on('data', (data) => {
        output += data.toString();
      });

      codex.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      codex.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Codex error: ${errorOutput || 'Unknown error'}`));
          return;
        }
        this.conversationHistory.push({ role: 'user', content: message });
        this.conversationHistory.push({ role: 'assistant', content: output });
        resolve(output.trim());
      });

      codex.on('error', (err) => {
        reject(new Error(`Failed to run Codex: ${err.message}`));
      });
    });
  }

  // Send message with Gemini
  private async sendWithGemini(message: string, systemContext: string): Promise<string> {
    const fullPrompt = systemContext ? `${systemContext}\n\nUser: ${message}` : message;

    if (this.geminiMethod === 'cli') {
      return this.sendWithGeminiCli(fullPrompt);
    } else if (this.geminiMethod === 'api_key') {
      return this.sendWithGeminiApi(fullPrompt);
    } else if (this.geminiMethod === 'gcloud') {
      return this.sendWithGeminiGcloud(fullPrompt);
    }

    throw new Error('Gemini is not properly configured');
  }

  // Send with Gemini CLI
  private async sendWithGeminiCli(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      const gemini = spawn('gemini', ['-p', prompt], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      gemini.stdout.on('data', (data) => {
        output += data.toString();
      });

      gemini.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      gemini.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Gemini error: ${errorOutput || 'Unknown error'}`));
          return;
        }
        this.conversationHistory.push({ role: 'user', content: prompt });
        this.conversationHistory.push({ role: 'assistant', content: output });
        resolve(output.trim());
      });

      gemini.on('error', (err) => {
        reject(new Error(`Failed to run Gemini: ${err.message}`));
      });
    });
  }

  // Send with Gemini API
  private async sendWithGeminiApi(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';

    this.conversationHistory.push({ role: 'user', content: prompt });
    this.conversationHistory.push({ role: 'assistant', content: responseText });

    return responseText;
  }

  // Send with Gemini via gcloud
  private async sendWithGeminiGcloud(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let accessToken: string;
      let projectId: string;

      try {
        accessToken = execSync('gcloud auth print-access-token', { stdio: 'pipe' }).toString().trim();
        projectId = execSync('gcloud config get-value project', { stdio: 'pipe' }).toString().trim();
      } catch (error) {
        reject(new Error('Failed to get gcloud credentials'));
        return;
      }

      const requestBody = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
      });

      const curl = spawn('curl', [
        '-s', '-X', 'POST',
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-1.5-flash:generateContent`,
        '-H', `Authorization: Bearer ${accessToken}`,
        '-H', 'Content-Type: application/json',
        '-d', requestBody,
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      let output = '';
      let errorOutput = '';

      curl.stdout.on('data', (data) => { output += data.toString(); });
      curl.stderr.on('data', (data) => { errorOutput += data.toString(); });

      curl.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Gemini gcloud error: ${errorOutput}`));
          return;
        }

        try {
          const data = JSON.parse(output);
          const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
          this.conversationHistory.push({ role: 'user', content: prompt });
          this.conversationHistory.push({ role: 'assistant', content: responseText });
          resolve(responseText);
        } catch (parseError) {
          reject(new Error(`Failed to parse Gemini response`));
        }
      });
    });
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
export const aiService = new AIService();
