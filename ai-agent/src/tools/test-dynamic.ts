import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const DYNAMIC_TOOLS_DIR = path.resolve(__dirname, 'dynamic');

async function verifyTool() {
  const toolName = process.argv[2];
  if (!toolName) {
    console.error('Error: Tool name argument is missing.');
    process.exit(1);
  }

  const tsPath = path.resolve(DYNAMIC_TOOLS_DIR, `${toolName}.ts`);

  if (!fs.existsSync(tsPath)) {
    console.error(`Error: Dynamic tool file not found: ${tsPath}`);
    process.exit(1);
  }

  console.log(`[TEST-DYNAMIC] Verifying compilation of tool "${toolName}"...`);

  try {
    // 1. Run typechecking / compilation simulation
    // We run tsc --noEmit on the specific file to check for typescript errors
    const tsconfigPath = path.resolve(__dirname, '../../tsconfig.json');
    const checkCmd = `npx tsc ${tsPath} --noEmit --esModuleInterop --skipLibCheck`;
    
    console.log(`Executing: ${checkCmd}`);
    const { stdout, stderr } = await execAsync(checkCmd);
    if (stderr || stdout) {
      console.log(stdout);
      console.warn(stderr);
    }

    // 2. Try importing it to verify it exports a default function
    // We register ts-node or tsx to read it
    const moduleExport = require(tsPath);
    const handlerFn = moduleExport.default || moduleExport.handler;

    if (typeof handlerFn !== 'function') {
      throw new Error('Verification failed: The tool module must export a default function.');
    }

    console.log(`✔ [TEST-DYNAMIC] Tool "${toolName}" successfully compiled and validated!`);
    process.exit(0);
  } catch (error: any) {
    console.error(`❌ [TEST-DYNAMIC] Verification failed for tool "${toolName}":`, error.message || error);
    process.exit(1);
  }
}

verifyTool();
