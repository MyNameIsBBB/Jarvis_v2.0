import path from 'path';
import fs from 'fs';
import Docker from 'dockerode';
import { runInSandbox } from '../utils/docker';

const HOST_WORKSPACE_DIR = path.resolve(__dirname, '../../workspace');

// Ensure directory exists
if (!fs.existsSync(HOST_WORKSPACE_DIR)) {
  fs.mkdirSync(HOST_WORKSPACE_DIR, { recursive: true });
}

/**
 * Resolves path and prevents directory traversal attacks.
 */
function resolveSafePath(relativePath: string): string {
  const resolved = path.resolve(HOST_WORKSPACE_DIR, relativePath);
  if (!resolved.startsWith(HOST_WORKSPACE_DIR)) {
    throw new Error(`Access Denied: Path "${relativePath}" resolves outside the sandbox workspace.`);
  }
  return resolved;
}

/**
 * Recursively searches for files containing a specific query.
 */
function recursiveSearch(
  dir: string,
  query: string,
  results: { path: string; line: number; content: string }[] = []
): { path: string; line: number; content: string }[] {
  if (results.length >= 50) return results; // Cap results
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
          recursiveSearch(fullPath, query, results);
        }
      } else {
        // Only search text files
        const ext = path.extname(file).toLowerCase();
        const textExtensions = ['.ts', '.js', '.json', '.md', '.txt', '.html', '.css', '.scss', '.yaml', '.yml', '.prisma', '.env'];
        if (textExtensions.includes(ext) || ext === '') {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes(query)) {
            const lines = content.split('\n');
            lines.forEach((line, index) => {
              if (line.includes(query) && results.length < 50) {
                const relPath = path.relative(HOST_WORKSPACE_DIR, fullPath);
                results.push({ path: relPath, line: index + 1, content: line.trim() });
              }
            });
          }
        }
      }
    }
  } catch (err) {
    // Ignore access errors on specific folders
  }
  return results;
}

/**
 * Tool: Workspace File Manager
 */
export async function workspace_file_manager(args: {
  action: 'read' | 'write' | 'list' | 'search';
  path: string;
  content?: string;
  query?: string;
}): Promise<string> {
  const { action, path: targetPath, content, query } = args;

  try {
    const safePath = resolveSafePath(targetPath);

    switch (action) {
      case 'read': {
        if (!fs.existsSync(safePath)) {
          return JSON.stringify({ success: false, error: `File not found: ${targetPath}` });
        }
        const fileContent = fs.readFileSync(safePath, 'utf8');
        return JSON.stringify({ success: true, content: fileContent });
      }

      case 'write': {
        if (content === undefined) {
          return JSON.stringify({ success: false, error: 'Write action requires "content" parameter.' });
        }
        const dir = path.dirname(safePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(safePath, content, 'utf8');
        return JSON.stringify({ success: true, message: `File written successfully at ${targetPath}` });
      }

      case 'list': {
        if (!fs.existsSync(safePath)) {
          return JSON.stringify({ success: false, error: `Directory not found: ${targetPath}` });
        }
        const stat = fs.statSync(safePath);
        if (!stat.isDirectory()) {
          return JSON.stringify({ success: false, error: `Path is not a directory: ${targetPath}` });
        }
        const files = fs.readdirSync(safePath);
        return JSON.stringify({ success: true, files });
      }

      case 'search': {
        if (!query) {
          return JSON.stringify({ success: false, error: 'Search action requires "query" parameter.' });
        }
        const results = recursiveSearch(HOST_WORKSPACE_DIR, query);
        return JSON.stringify({ success: true, results });
      }

      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    return JSON.stringify({ success: false, error: error.message || String(error) });
  }
}

// Simulated RCON / Minecraft State (Persisted in-memory since Docker may be disabled)
let simulatedMinecraftRunning = false;

/**
 * Tool: Minecraft Server Controller
 */
export async function minecraft_server_controller(args: {
  action: 'start' | 'stop' | 'status' | 'command';
  command?: string;
}): Promise<string> {
  const { action, command } = args;

  // If docker daemon is available and enabled
  if (process.env.DISABLE_DOCKER !== 'true') {
    try {
      const docker = new Docker();
      await docker.ping();

      // Find the minecraft container
      const containers = await docker.listContainers({ all: true });
      const mcContainerInfo = containers.find(c =>
        c.Names.some(name => name.toLowerCase().includes('minecraft'))
      );

      if (!mcContainerInfo) {
        return JSON.stringify({
          success: false,
          error: 'No container named "minecraft" found on this docker host.',
          fallbackInfo: 'Ensure you have a container containing "minecraft" in its name.',
        });
      }

      const container = docker.getContainer(mcContainerInfo.Id);

      switch (action) {
        case 'status':
          return JSON.stringify({
            success: true,
            containerId: mcContainerInfo.Id,
            status: mcContainerInfo.State,
            statusText: `Minecraft container is currently ${mcContainerInfo.State}`,
          });

        case 'start':
          if (mcContainerInfo.State === 'running') {
            return JSON.stringify({ success: true, message: 'Minecraft server is already running.' });
          }
          await container.start();
          return JSON.stringify({ success: true, message: 'Minecraft container started successfully.' });

        case 'stop':
          if (mcContainerInfo.State !== 'running') {
            return JSON.stringify({ success: true, message: 'Minecraft server is already stopped.' });
          }
          await container.stop();
          return JSON.stringify({ success: true, message: 'Minecraft container stopped successfully.' });

        case 'command':
          if (mcContainerInfo.State !== 'running') {
            return JSON.stringify({ success: false, error: 'Cannot run commands while Minecraft server is stopped.' });
          }
          if (!command) {
            return JSON.stringify({ success: false, error: 'Action "command" requires "command" parameter.' });
          }
          
          // Use docker exec to run command inside the container.
          // RCON can be invoked inside the container via mc-send-to-console or rcon-cli depending on setup.
          // Fallback to sending command to the attach stream or RCON command line tool.
          const execObj = await container.exec({
            Cmd: ['sh', '-c', `rcon-cli ${command} || mc-send-to-console ${command}`],
            AttachStdout: true,
            AttachStderr: true,
          });

          const execStream = await execObj.start({});
          const output = await new Promise<string>((resolve) => {
            let out = '';
            execStream.on('data', chunk => out += chunk.toString('utf8'));
            execStream.on('end', () => resolve(out));
          });

          return JSON.stringify({
            success: true,
            commandExecuted: command,
            output: output.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim(), // Clean binary codes
          });

        default:
          return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (err: any) {
      // If docker fails, fallback to simulated
      console.warn(`Minecraft Docker controller failed: ${err.message}. Falling back to simulation.`);
    }
  }

  // Simulated local Minecraft Server Controller
  switch (action) {
    case 'status':
      return JSON.stringify({
        success: true,
        status: simulatedMinecraftRunning ? 'running' : 'exited',
        statusText: `[SIMULATED] Minecraft server is ${simulatedMinecraftRunning ? 'RUNNING' : 'STOPPED'}`,
      });

    case 'start':
      simulatedMinecraftRunning = true;
      return JSON.stringify({
        success: true,
        message: '[SIMULATED] Minecraft server booted successfully (Port 25565).',
      });

    case 'stop':
      simulatedMinecraftRunning = false;
      return JSON.stringify({
        success: true,
        message: '[SIMULATED] Minecraft server shut down gracefully.',
      });

    case 'command':
      if (!simulatedMinecraftRunning) {
        return JSON.stringify({
          success: false,
          error: '[SIMULATED] Cannot run commands on a stopped server.',
        });
      }
      if (!command) {
        return JSON.stringify({ success: false, error: 'Command parameter missing.' });
      }
      return JSON.stringify({
        success: true,
        commandExecuted: command,
        output: `[SIMULATED RCON OUTPUT]: Command "${command}" executed successfully. 0 players online.`,
      });

    default:
      return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
  }
}

/**
 * Tool: Docker Sandbox Executor (runs shell commands in isolated container)
 */
export async function docker_sandbox_executor(args: { command: string }): Promise<string> {
  const { command } = args;
  try {
    const result = await runInSandbox(command);
    return JSON.stringify(result);
  } catch (error: any) {
    return JSON.stringify({
      stdout: '',
      stderr: error.message || String(error),
      exitCode: 1,
    });
  }
}
