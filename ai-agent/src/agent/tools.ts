import path from 'path';
import fs from 'fs';
import { runInSandbox } from '../utils/docker';
import { prisma } from '../utils/prisma';
import { broadcastTaskUpdate } from '../server/ws';
import { GraphState, TaskStatus } from './types';

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
 * Safe File System Tool
 */
export async function executeFileSystem(args: {
  action: 'read' | 'write' | 'list';
  path: string;
  content?: string;
}): Promise<string> {
  const { action, path: targetPath, content } = args;

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
        // Ensure subdirectories exist
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

      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    return JSON.stringify({ success: false, error: error.message || String(error) });
  }
}

/**
 * Docker Sandbox Execution Tool
 */
export async function executeDockerSandbox(args: { command: string }): Promise<string> {
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

/**
 * Interruption Handler (Awaiting Human input)
 */
export async function handleInterruption(
  taskId: string,
  state: GraphState,
  args: { prompt: string }
): Promise<{ interrupted: boolean; message: string }> {
  const { prompt } = args;

  // Append interruption prompt as assistant request to messages
  state.messages.push({
    role: 'assistant',
    content: `[PAUSED: Awaiting user response to prompt: "${prompt}"]`,
  });

  const updatedStatus: TaskStatus = 'AWAITING_HUMAN';

  // Update Prisma task status and save the exact state snapshot
  const updatedTask = await prisma.agentTask.update({
    where: { id: taskId },
    data: {
      status: updatedStatus,
      graphState: state as any,
    },
  });

  // Emit WebSocket notification to the client UI
  broadcastTaskUpdate({
    taskId,
    status: updatedStatus,
    title: updatedTask.title,
    graphState: state,
    interruptionPrompt: prompt,
  });

  console.log(`[INTERRUPT] Task ${taskId} is now AWAITING_HUMAN. Prompt: "${prompt}"`);

  return {
    interrupted: true,
    message: `Interrupted. Waiting for user response: ${prompt}`,
  };
}
