import { executeFileSystem } from './agent/tools';
import { runInSandbox } from './utils/docker';

async function runVerification() {
  console.log('====================================================');
  console.log('    AGENTIC ARCHITECTURE VERIFICATION RUNNER       ');
  console.log('====================================================\n');

  let testsPassed = 0;
  let testsTotal = 0;

  // --- Test 1: Directory Traversal Prevention ---
  testsTotal++;
  console.log('[TEST 1] Verifying Directory Traversal Protection...');
  try {
    // Attempting to write a file outside the workspace using directory traversal
    const resultStr = await executeFileSystem({
      action: 'write',
      path: '../../host_tamper.txt',
      content: 'malicious content',
    });
    const result = JSON.parse(resultStr);
    if (!result.success && result.error.includes('Access Denied')) {
      console.log(`✔ TEST 1 PASSED: Sandbox successfully blocked access. Message: ${result.error}`);
      testsPassed++;
    } else {
      console.error(`❌ TEST 1 FAILED: Traversal path was allowed! Result:`, result);
    }
  } catch (error: any) {
    console.error('❌ TEST 1 FAILED with unexpected exception:', error);
  }

  // --- Test 2: File System Write & Read Inside Workspace ---
  testsTotal++;
  console.log('\n[TEST 2] Verifying File Write/Read inside Workspace...');
  try {
    const writeResultStr = await executeFileSystem({
      action: 'write',
      path: 'test_script.js',
      content: 'console.log("Hello from Sandbox JS Execution!")',
    });
    const writeResult = JSON.parse(writeResultStr);
    console.log(`Write Result:`, writeResult);

    const readResultStr = await executeFileSystem({
      action: 'read',
      path: 'test_script.js',
    });
    const readResult = JSON.parse(readResultStr);
    console.log(`Read Result:`, readResult);

    if (writeResult.success && readResult.success && readResult.content.includes('Hello from Sandbox JS Execution')) {
      console.log('✔ TEST 2 PASSED: File successfully written and read.');
      testsPassed++;
    } else {
      console.error('❌ TEST 2 FAILED: Write or Read output verification failed.');
    }
  } catch (error: any) {
    console.error('❌ TEST 2 FAILED with error:', error);
  }

  // --- Test 3: Sandbox Code Execution Command ---
  testsTotal++;
  console.log('\n[TEST 3] Verifying Sandboxed Execution (Docker / Fallback)...');
  try {
    const runResult = await runInSandbox('node test_script.js');
    console.log('Command stdout:', runResult.stdout.trim());
    console.log('Command stderr:', runResult.stderr.trim());
    console.log('Exit Code:', runResult.exitCode);

    if (runResult.stdout.trim().includes('Hello from Sandbox JS Execution') && runResult.exitCode === 0) {
      console.log('✔ TEST 3 PASSED: Script successfully executed in Sandbox.');
      testsPassed++;
    } else {
      console.error('❌ TEST 3 FAILED: Run results do not match expected output.');
    }
  } catch (error: any) {
    console.error('❌ TEST 3 FAILED with error:', error);
  }

  console.log('\n====================================================');
  console.log(`  VERIFICATION RESULTS: ${testsPassed} / ${testsTotal} PASSED`);
  console.log('====================================================\n');
  console.log('To run the local server:');
  console.log('  npm run dev\n');
  console.log('To start agent runs, make POST requests to:');
  console.log('  http://localhost:3000/api/tasks\n');
}

runVerification().catch((err) => {
  console.error('Unexpected verification error:', err);
});
