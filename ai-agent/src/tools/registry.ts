import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { config } from '../config';
import { 
  workspace_file_manager, 
  docker_sandbox_executor 
} from '../agent/tools';
import { waitingApprovals } from '../utils/approval';

const execAsync = promisify(exec);

const DYNAMIC_TOOLS_DIR = path.resolve(__dirname, 'dynamic');
const DIST_DYNAMIC_TOOLS_DIR = path.resolve(__dirname, '../../dist/tools/dynamic');

// Ensure dynamic directories exist
if (!fs.existsSync(DYNAMIC_TOOLS_DIR)) {
  fs.mkdirSync(DYNAMIC_TOOLS_DIR, { recursive: true });
}
if (!fs.existsSync(DIST_DYNAMIC_TOOLS_DIR)) {
  fs.mkdirSync(DIST_DYNAMIC_TOOLS_DIR, { recursive: true });
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  category: 'FileManagement' | 'HomeLab' | 'Developer' | 'SelfImprovement' | 'Dynamic';
  handler: (args: any) => Promise<string>;
}

function resolveSafePath(relativePath: string): string {
  const hostWorkspace = path.resolve(__dirname, '../../workspace');
  if (!fs.existsSync(hostWorkspace)) {
    fs.mkdirSync(hostWorkspace, { recursive: true });
  }
  const resolved = path.resolve(hostWorkspace, relativePath);
  if (!resolved.startsWith(hostWorkspace)) {
    throw new Error(`Access Denied: Path "${relativePath}" resolves outside the workspace boundary.`);
  }
  return resolved;
}

function htmlToText(html: string): string {
  let text = html.replace(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text.slice(0, 2000);
}

class ToolRegistry {
  private registry: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerBaseTools();
  }

  private registerBaseTools() {
    // 1. read_file_secure
    this.registerTool({
      name: 'read_file_secure',
      description: 'Reads the text content of a file securely from the local workspace directory.',
      category: 'FileManagement',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to file inside workspace.' }
        },
        required: ['path']
      },
      handler: async (args: { path: string }) => {
        try {
          const safePath = resolveSafePath(args.path);
          if (!fs.existsSync(safePath)) {
            return JSON.stringify({ success: false, error: `File not found: ${args.path}` });
          }
          const content = fs.readFileSync(safePath, 'utf8');
          return JSON.stringify({ success: true, content });
        } catch (e: any) {
          return JSON.stringify({ success: false, error: e.message || String(e) });
        }
      }
    });

    // 2. write_file_secure
    this.registerTool({
      name: 'write_file_secure',
      description: 'Writes text content securely to a file in the local workspace directory.',
      category: 'FileManagement',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to target file inside workspace.' },
          content: { type: 'string', description: 'Text content to write.' }
        },
        required: ['path', 'content']
      },
      handler: async (args: { path: string; content: string }) => {
        try {
          const safePath = resolveSafePath(args.path);
          const dir = path.dirname(safePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(safePath, args.content, 'utf8');
          return JSON.stringify({ success: true, message: `File written successfully at ${args.path}` });
        } catch (e: any) {
          return JSON.stringify({ success: false, error: e.message || String(e) });
        }
      }
    });

    // 3. execute_sandbox_cmd
    this.registerTool({
      name: 'execute_sandbox_cmd',
      description: 'Executes shell commands safely inside the container sandbox (fallback to local workspace shell).',
      category: 'Developer',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command line string to execute.' }
        },
        required: ['command']
      },
      handler: async (args: { command: string }) => {
        return docker_sandbox_executor(args);
      }
    });

    // 4. fetch_web_resource
    this.registerTool({
      name: 'fetch_web_resource',
      description: 'Executes an HTTP GET or POST request to fetch remote URL resource content.',
      category: 'Developer',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Target remote HTTP URL.' },
          method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method.' },
          data: { type: 'string', description: 'Optional JSON payload string for POST requests.' },
          headers: { type: 'string', description: 'Optional JSON request headers string.' }
        },
        required: ['url', 'method']
      },
      handler: async (args: { url: string; method: 'GET' | 'POST'; data?: string; headers?: string }) => {
        try {
          const parsedHeaders = args.headers ? JSON.parse(args.headers) : {};
          const parsedData = args.data ? JSON.parse(args.data) : undefined;
          const res = await axios({
            url: args.url,
            method: args.method,
            headers: parsedHeaders,
            data: parsedData,
            timeout: 15000
          });
          const textRes = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data);
          return JSON.stringify({ success: true, status: res.status, data: textRes.slice(0, 2500) });
        } catch (e: any) {
          return JSON.stringify({ success: false, error: e.message || String(e) });
        }
      }
    });

    // 4.5 web_search
    this.registerTool({
      name: 'web_search',
      description: 'Perform a web search using a search engine to find current information, news, or URLs for a given query.',
      category: 'Developer',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query string.' }
        },
        required: ['query']
      },
      handler: async (args: { query: string }) => {
        try {
          // Use DuckDuckGo HTML Lite search
          const res = await axios.post(
            'https://lite.duckduckgo.com/lite/',
            new URLSearchParams({ q: args.query }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 15000
            }
          );
          
          const html = res.data;
          const results: string[] = [];
          
          // Basic regex to extract results from duckduckgo lite
          const resultRegex = /<a rel="nofollow" href="([^"]+)" class="result-url">[^<]+<\/a>.*?<td class="result-snippet">([^<]+)<\/td>/gs;
          let match;
          let count = 0;
          while ((match = resultRegex.exec(html)) !== null && count < 5) {
            results.push(`URL: ${match[1]}\nSnippet: ${match[2].trim()}`);
            count++;
          }
          
          // Fallback if the first regex doesn't match the current Lite HTML structure
          if (results.length === 0) {
             const alternativeRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a><\/td><\/tr><tr><td class="result-snippet">([^<]+)<\/td>/gs;
             let altMatch;
             let altCount = 0;
             while ((altMatch = alternativeRegex.exec(html)) !== null && altCount < 5) {
               results.push(`URL: ${altMatch[1]}\nTitle: ${altMatch[2].trim()}\nSnippet: ${altMatch[3].trim()}`);
               altCount++;
             }
          }

          if (results.length === 0) {
             // Second fallback: generic link extraction
             const linksRegex = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
             let linkMatch;
             let linkCount = 0;
             while ((linkMatch = linksRegex.exec(html)) !== null && linkCount < 10) {
               if (linkMatch[1].startsWith('http') && !linkMatch[1].includes('duckduckgo.com')) {
                 results.push(`URL: ${linkMatch[1]}\nTitle: ${linkMatch[2].trim()}`);
                 linkCount++;
               }
             }
          }

          if (results.length === 0) {
            return JSON.stringify({ success: false, error: 'No results found. Try a different query.' });
          }
          return JSON.stringify({ success: true, results: results.join('\\n\\n') });
        } catch (e: any) {
          return JSON.stringify({ success: false, error: e.message || String(e) });
        }
      }
    });

    // 5. web_search_scraper
    this.registerTool({
      name: 'web_search_scraper',
      description: 'Scrapes structural text summaries or DOM representations from a remote web target url.',
      category: 'Developer',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Remote page URL.' },
          selector: { type: 'string', description: 'Optional CSS selector to query specific elements.' }
        },
        required: ['url']
      },
      handler: async (args: { url: string; selector?: string }) => {
        try {
          const res = await axios.get(args.url, { timeout: 15000 });
          const cleanedText = htmlToText(res.data);
          return JSON.stringify({ success: true, url: args.url, content: cleanedText });
        } catch (e: any) {
          return JSON.stringify({ success: false, error: e.message || String(e) });
        }
      }
    });

    // 6. system_resource_monitor
    this.registerTool({
      name: 'system_resource_monitor',
      description: 'Introspects local home-lab VM resource loads (CPU/memory load metrics, active servers logs).',
      category: 'HomeLab',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['metrics'] }
        },
        required: ['action']
      },
      handler: async (args: { action: 'metrics' }) => {
        try {
          if (args.action === 'metrics') {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const memUsagePct = ((usedMem / totalMem) * 100).toFixed(1);
            return JSON.stringify({
              success: true,
              platform: os.platform(),
              cpuLoad: os.loadavg(),
              memory: {
                totalGB: (totalMem / 1024 / 1024 / 1024).toFixed(1),
                usedGB: (usedMem / 1024 / 1024 / 1024).toFixed(1),
                freeGB: (freeMem / 1024 / 1024 / 1024).toFixed(1),
                pctUsed: memUsagePct
              }
            });
          }
          return JSON.stringify({ success: false, error: `Unsupported action: ${args.action}` });
        } catch (e: any) {
          return JSON.stringify({ success: false, error: e.message || String(e) });
        }
      }
    });

    // 7. prisma_metadata_inspector
    this.registerTool({
      name: 'prisma_metadata_inspector',
      description: 'Introspects existing database structure schemas to understand active tables and properties.',
      category: 'Developer',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['inspect'] }
        },
        required: ['action']
      },
      handler: async (args: { action: 'inspect' }) => {
        try {
          const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
          if (!fs.existsSync(schemaPath)) {
            return JSON.stringify({ success: false, error: 'schema.prisma file not found.' });
          }
          const schema = fs.readFileSync(schemaPath, 'utf8');
          return JSON.stringify({ success: true, schema });
        } catch (e: any) {
          return JSON.stringify({ success: false, error: e.message || String(e) });
        }
      }
    });

    // 8. human_interruption_prompt
    this.registerTool({
      name: 'human_interruption_prompt',
      description: 'Suspends the automated execution flow to await human configuration verification or review inputs.',
      category: 'SelfImprovement',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Explanation or warning prompt shown to the user.' },
          variables: { type: 'string', description: 'JSON string representing the variables/state to verify.' }
        },
        required: ['prompt', 'variables']
      },
      handler: async (args: { prompt: string; variables: string; sessionId?: string }) => {
        const sessId = args.sessionId;
        if (!sessId) {
          return JSON.stringify({ success: false, error: 'Active Session ID is required for human interruption prompts.' });
        }
        console.log(`[INTERRUPTION] Pausing thought loop for session: ${sessId}...`);
        return new Promise<string>((resolve, reject) => {
          waitingApprovals.set(sessId, {
            resolve,
            reject,
            prompt: args.prompt,
            variables: args.variables
          });
        });
      }
    });

    // 9. generate_and_register_tool (conditional meta self-improvement tool)
    if (config.ENABLE_SELF_IMPROVEMENT) {
      this.registerTool({
        name: 'generate_and_register_tool',
        description: 'Creates a brand new typescript tool, tests, compiles, and registers it into active memory.',
        category: 'SelfImprovement',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the tool (use lower_snake_case only, e.g. get_weather_forecast).' },
            description: { type: 'string', description: 'Clear documentation explaining what the tool does.' },
            tsCode: { 
              type: 'string', 
              description: 'Complete TypeScript source code. It must export a default handler function: `export default async function handler(args: any): Promise<string> { ... }`' 
            }
          },
          required: ['name', 'description', 'tsCode']
        },
        handler: async (args: { name: string; description: string; tsCode: string }) => {
          return this.handleGenerateNewTool(args.name, args.description, args.tsCode);
        }
      });
    }

    this.loadExistingDynamicTools();
  }

  public registerTool(tool: ToolDefinition) {
    this.registry.set(tool.name, tool);
    console.log(`[REGISTRY] Tool "${tool.name}" successfully registered.`);
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.registry.get(name);
  }

  /**
   * Filter and return active tools (scrubbing/withholding blacklisted ones)
   */
  public getAllTools(): ToolDefinition[] {
    const disabled = config.DISABLED_TOOLS || [];
    return Array.from(this.registry.values()).filter(t => !disabled.includes(t.name));
  }

  /**
   * Return all registered tools including disabled ones for dashboard toggle status
   */
  public getAllBaseTools(): ToolDefinition[] {
    return Array.from(this.registry.values());
  }

  private loadExistingDynamicTools() {
    try {
      if (!fs.existsSync(DYNAMIC_TOOLS_DIR)) return;
      const files = fs.readdirSync(DYNAMIC_TOOLS_DIR);
      for (const file of files) {
        if (file.endsWith('.ts') && !file.includes('.test.')) {
          const name = path.basename(file, '.ts');
          this.loadDynamicToolByName(name);
        }
      }
    } catch (e) {
      console.warn('[REGISTRY] Failed loading pre-existing dynamic tools:', e);
    }
  }

  private loadDynamicToolByName(name: string): boolean {
    try {
      const isProd = __dirname.includes('dist');
      
      let loadPath = '';
      if (isProd) {
        loadPath = path.resolve(DIST_DYNAMIC_TOOLS_DIR, `${name}.js`);
        if (!fs.existsSync(loadPath)) {
          console.warn(`[REGISTRY] Dynamic tool JS file not found in production output folder: ${loadPath}`);
          return false;
        }
      } else {
        loadPath = path.resolve(DYNAMIC_TOOLS_DIR, `${name}.ts`);
      }

      if (require.cache[require.resolve(loadPath)]) {
        delete require.cache[require.resolve(loadPath)];
      }

      const moduleExport = require(loadPath);
      const handlerFn = moduleExport.default || moduleExport.handler;

      if (typeof handlerFn !== 'function') {
        console.error(`[REGISTRY] Dynamic tool "${name}" did not export a default function.`);
        return false;
      }

      this.registerTool({
        name,
        description: `Dynamically generated tool.`,
        category: 'Dynamic',
        parameters: {
          type: 'object',
          properties: {
            args: { type: 'object', description: 'Arguments for dynamic tool.' }
          }
        },
        handler: async (args: any) => {
          try {
            const unpackedArgs = args.args !== undefined ? args.args : args;
            return await handlerFn(unpackedArgs);
          } catch (err: any) {
            return JSON.stringify({ success: false, error: err.message || String(err) });
          }
        }
      });

      return true;
    } catch (err) {
      console.error(`[REGISTRY] Failed to import dynamic tool "${name}":`, err);
      return false;
    }
  }

  private async handleGenerateNewTool(name: string, description: string, tsCode: string): Promise<string> {
    const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '');
    const tsPath = path.resolve(DYNAMIC_TOOLS_DIR, `${cleanName}.ts`);
    const isProd = __dirname.includes('dist');

    console.log(`[SELF-IMPROVEMENT] Generating new tool "${cleanName}"...`);

    try {
      fs.writeFileSync(tsPath, tsCode, 'utf8');
      console.log(`[SELF-IMPROVEMENT] TS file written to ${tsPath}`);

      const cmd = `npm run test:dynamic ${cleanName}`;
      console.log(`[SELF-IMPROVEMENT] Running compilation and sandbox test check: ${cmd}`);
      
      const cwd = path.resolve(__dirname, '../..');
      const testResult = await execAsync(cmd, { cwd });
      console.log(`[SELF-IMPROVEMENT] Compilation/Test successful:\n`, testResult.stdout);

      if (isProd) {
        console.log(`[SELF-IMPROVEMENT] Compiling TS code to production build...`);
        const compileCmd = `npx tsc ${tsPath} --outDir ${DIST_DYNAMIC_TOOLS_DIR} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`;
        await execAsync(compileCmd, { cwd });
      }

      const loaded = this.loadDynamicToolByName(cleanName);
      if (!loaded) {
        throw new Error('Verification script passed, but registry failed to import the module.');
      }

      return JSON.stringify({
        success: true,
        message: `Dynamic tool "${cleanName}" was successfully written, compiled, tested, and registered into active memory. You can use it now!`,
        testLogs: testResult.stdout
      });

    } catch (error: any) {
      console.error(`[SELF-IMPROVEMENT ERROR] Failed to generate tool "${cleanName}":`, error.message || error);
      
      try {
        if (fs.existsSync(tsPath)) fs.unlinkSync(tsPath);
      } catch (e) {}

      return JSON.stringify({
        success: false,
        error: `Self-improvement code generation failed: ${error.stderr || error.message || String(error)}`,
        suggestion: 'Ensure the TS code exports a default async function and does not contain syntax/type errors.'
      });
    }
  }
}

export const registry = new ToolRegistry();
export default registry;
