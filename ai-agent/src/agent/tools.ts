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
