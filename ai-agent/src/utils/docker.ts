import Docker from 'dockerode';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);
let docker: Docker | null = null;

try {
  docker = new Docker();
} catch (err) {
  console.warn('Dockerode client initialization failed. Sandbox will fall back to local shell execution.');
}

const IMAGE_NAME = 'node:20-alpine';
const HOST_WORKSPACE_DIR = path.resolve(__dirname, '../../workspace');

// Ensure host workspace directory exists
if (!fs.existsSync(HOST_WORKSPACE_DIR)) {
  fs.mkdirSync(HOST_WORKSPACE_DIR, { recursive: true });
}

/**
 * Decodes Docker's multiplexed stream format.
 * Header format: [8 bytes] -> Byte 0: stream type (1=stdout, 2=stderr), Bytes 4-7: content length.
 */
function decodeDockerLogs(buffer: Buffer): { stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const type = buffer.readUInt8(offset);
    const length = buffer.readUInt32BE(offset + 4);
    offset += 8;

    if (offset + length > buffer.length) break;
    const chunk = buffer.subarray(offset, offset + length).toString('utf8');
    if (type === 1) {
      stdout += chunk;
    } else if (type === 2) {
      stderr += chunk;
    }
    offset += length;
  }

  return { stdout, stderr };
}

/**
 * Ensures the target Docker image is downloaded.
 */
async function ensureImage(dockerClient: Docker): Promise<void> {
  const images = await dockerClient.listImages();
  const hasImage = images.some(img => img.RepoTags && img.RepoTags.includes(IMAGE_NAME));

  if (!hasImage) {
    console.log(`Docker image ${IMAGE_NAME} not found. Pulling...`);
    const stream = await dockerClient.pull(IMAGE_NAME);
    await new Promise((resolve, reject) => {
      dockerClient.modem.followProgress(stream, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
    console.log(`Docker image ${IMAGE_NAME} successfully pulled.`);
  }
}

/**
 * Executes a command inside the isolated Docker sandbox.
 * Falls back to local execution if Docker is unavailable.
 */
export async function runInSandbox(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (!docker) {
    return runLocally(command);
  }

  try {
    // Ping docker daemon to check if it's reachable
    await docker.ping();
    await ensureImage(docker);

    const container = await docker.createContainer({
      Image: IMAGE_NAME,
      Cmd: ['sh', '-c', command],
      WorkingDir: '/workspace',
      HostConfig: {
        Binds: [`${HOST_WORKSPACE_DIR}:/workspace`],
      },
    });

    await container.start();
    
    // Wait for the execution to finish
    const waitResult = await container.wait();
    const exitCode = waitResult.StatusCode;

    // Fetch container logs (multiplexed)
    const logBuffer = (await container.logs({
      stdout: true,
      stderr: true,
      tail: 'all',
    } as any)) as unknown as Buffer;

    const { stdout, stderr } = decodeDockerLogs(logBuffer);

    // Clean up
    await container.remove();

    return { stdout, stderr, exitCode };
  } catch (error: any) {
    console.warn(`Docker sandbox execution failed: ${error.message || error}. Falling back to host shell execution.`);
    return runLocally(command);
  }
}

/**
 * Fallback local execution if Docker daemon is not running or fails.
 */
async function runLocally(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  console.log(`[SANDBOX FALLBACK] Running locally inside workspace: ${command}`);
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: HOST_WORKSPACE_DIR,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || String(error),
      exitCode: error.code !== undefined ? error.code : 1,
    };
  }
}
