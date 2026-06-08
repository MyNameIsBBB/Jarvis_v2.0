import axios from 'axios';
import { prisma } from '../utils/prisma';
import { executeFileSystem, executeDockerSandbox, handleInterruption } from './tools';
import { broadcastTaskUpdate } from '../server/ws';
import { GraphState, TaskStatus, AgentLLMResponse, AgentMessage } from './types';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

const SYSTEM_PROMPT = `You are a custom, lightweight, durable Agentic AI system.
You solve tasks by executing tools. You run inside a step-by-step thinking loop.
After each tool execution, you will see the tool's output.

You MUST respond with a single, valid JSON object matching this schema:
{
  "thought": "Detail your reasoning about the objective, recent execution results, and what to do next.",
  "plan": "Explain your step-by-step strategy to complete the objective.",
  "tool_to_use": "executeFileSystem" | "executeDockerSandbox" | "await_human" | "complete_task",
  "tool_args": {
     // For 'executeFileSystem': { "action": "read" | "write" | "list", "path": "relativePath", "content": "fileContentToWrite?" }
     // For 'executeDockerSandbox': { "command": "shellCommand" }
     // For 'await_human': { "prompt": "Question or prompt requiring human response" }
     // For 'complete_task': {}
  }
}

Rules:
1. ONLY write JSON. No markdown blocks around JSON, no extra text, no apologies.
2. All file paths must be relative to the workspace folder.
3. Sandbox actions run inside a container. Make sure scripts are created before you execute them.
4. If you require clarification or feedback from a human, use the 'await_human' tool immediately. Do not guess.`;

/**
 * Strips markdown code blocks and parses LLM JSON response.
 */
function parseJSONResponse(rawContent: string): AgentLLMResponse {
  let cleaned = rawContent.trim();
  // Remove markdown code blocks if the LLM wrapped it
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/, '').replace(/```$/, '').trim();
  }
  return JSON.parse(cleaned) as AgentLLMResponse;
}

/**
 * Running loop of the durable state machine.
 */
export async function runAgentLoop(taskId: string, userFeedback?: string): Promise<void> {
  console.log(`[ORCHESTRATOR] Starting/Resuming task ${taskId}...`);

  // 1. Fetch the latest task state
  const task = await prisma.agentTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new Error(`Task with ID ${taskId} not found.`);
  }

  let state: GraphState = task.graphState as unknown as GraphState;
  let status: TaskStatus = task.status as TaskStatus;

  // 2. Handle Resume & Pause checks
  if (status === 'PAUSED' || status === 'AWAITING_HUMAN') {
    if (!userFeedback) {
      console.log(`[ORCHESTRATOR] Task ${taskId} is currently paused and no user feedback was provided. Halting.`);
      return;
    }

    // Append user feedback and transition back to RUNNING
    state.messages.push({
      role: 'user',
      content: `[USER RESPONSE/FEEDBACK]: ${userFeedback}`,
    });
    status = 'RUNNING';

    // Persist this initial change
    await prisma.agentTask.update({
      where: { id: taskId },
      data: {
        status,
        graphState: state as any,
      },
    });

    console.log(`[ORCHESTRATOR] Feedback injected. Task ${taskId} status reset to RUNNING.`);
  } else if (status === 'COMPLETED') {
    console.log(`[ORCHESTRATOR] Task ${taskId} is already COMPLETED. Halting.`);
    return;
  } else {
    // If IDLE, transition to RUNNING
    status = 'RUNNING';
    await prisma.agentTask.update({
      where: { id: taskId },
      data: { status },
    });
  }

  // Maximum safety iteration counter to avoid infinite API loops
  let iterations = 0;
  const maxIterations = 30;

  // 3. Enter core reasoning loop
  while (status === 'RUNNING' && iterations < maxIterations) {
    iterations++;
    console.log(`[ORCHESTRATOR] Task ${taskId} - Iteration ${iterations}`);

    // Map system prompt and task messages for Ollama API
    const messagesToSend = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...state.messages.map(m => ({ role: m.role, content: m.content })),
    ];

    let parsedResponse: AgentLLMResponse;
    let tokenLogEntry: any = null;

    try {
      // Call local Ollama chat API
      const response = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
        model: OLLAMA_MODEL,
        messages: messagesToSend,
        format: 'json',
        stream: false,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 90000, // 90s timeout for heavier models running locally
      });

      const rawContent = response.data.message.content;
      tokenLogEntry = {
        promptTokens: response.data.prompt_eval_count || 0,
        completionTokens: response.data.eval_count || 0,
        totalTokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0),
        timestamp: new Date().toISOString(),
      };

      parsedResponse = parseJSONResponse(rawContent);
      console.log(`[THOUGHT] ${parsedResponse.thought}`);
      console.log(`[PLAN] ${parsedResponse.plan}`);
      console.log(`[ACTION] Tool: ${parsedResponse.tool_to_use}`);
    } catch (err: any) {
      console.error('[OLLAMA ERROR] API Call or parsing failed:', err.message || err);
      // Log error to agent state and retry or pause
      const errorMsg = `System/LLM Call Error: ${err.message || String(err)}`;
      state.messages.push({
        role: 'system',
        content: `Error occurred: ${errorMsg}. Please adjust your output formatting or commands.`,
      });

      // Pause to avoid infinite crashing
      status = 'PAUSED';
      await prisma.agentTask.update({
        where: { id: taskId },
        data: {
          status,
          graphState: state as any,
        },
      });
      broadcastTaskUpdate({ taskId, status, title: task.title, graphState: state });
      break;
    }

    // Append LLM's response to history
    state.messages.push({
      role: 'assistant',
      content: JSON.stringify(parsedResponse),
    });

    if (tokenLogEntry) {
      if (!state.tokenLogs) state.tokenLogs = [];
      state.tokenLogs.push(tokenLogEntry);
    }

    let toolResult = '';
    let isInterrupted = false;

    // 4. Handle tool execution via switch-case
    switch (parsedResponse.tool_to_use) {
      case 'executeFileSystem': {
        const fileArgs = parsedResponse.tool_args as any;
        toolResult = await executeFileSystem(fileArgs);
        break;
      }

      case 'executeDockerSandbox': {
        const dockerArgs = parsedResponse.tool_args as any;
        toolResult = await executeDockerSandbox(dockerArgs);
        break;
      }

      case 'await_human': {
        const humanArgs = parsedResponse.tool_args as any;
        const result = await handleInterruption(taskId, state, humanArgs);
        isInterrupted = result.interrupted;
        status = 'AWAITING_HUMAN';
        break;
      }

      case 'complete_task': {
        status = 'COMPLETED';
        toolResult = JSON.stringify({ success: true, message: 'Task completed successfully' });
        break;
      }

      default:
        toolResult = JSON.stringify({
          success: false,
          error: `Unknown tool requested: "${parsedResponse.tool_to_use}"`,
        });
        break;
    }

    if (isInterrupted) {
      // Interruption handler saves state and broadcasts, so we exit loop
      break;
    }

    // Append tool output to state
    state.messages.push({
      role: 'tool',
      name: parsedResponse.tool_to_use,
      content: toolResult,
    });

    // 5. Update Task Snapshot to database (Durable State persistence)
    const updatedTask = await prisma.agentTask.update({
      where: { id: taskId },
      data: {
        status,
        graphState: state as any,
      },
    });

    // Broadcast update via WebSocket
    broadcastTaskUpdate({
      taskId,
      status,
      title: updatedTask.title,
      graphState: state,
    });

    console.log(`[ORCHESTRATOR] Task ${taskId} status updated to ${status}. Snapshot saved.`);
  }

  if (iterations >= maxIterations && status === 'RUNNING') {
    console.warn(`[ORCHESTRATOR] Task reached maximum iterations (${maxIterations}) and was paused.`);
    status = 'PAUSED';
    await prisma.agentTask.update({
      where: { id: taskId },
      data: { status },
    });
    broadcastTaskUpdate({ taskId, status, title: task.title, graphState: state });
  }

  console.log(`[ORCHESTRATOR] Loop finished for task ${taskId}. Current status: ${status}`);
}
