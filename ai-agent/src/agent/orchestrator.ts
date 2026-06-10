import axios from 'axios';
import { prisma } from '../utils/prisma';
import { config } from '../config';
import { registry } from '../tools/registry';
import { 
  broadcastToken, 
  broadcastToolStatus, 
  broadcastSessionUpdate 
} from '../server/ws';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4';

const SYSTEM_PROMPT_LARGE = `You are "Jarvis", a personal, friendly, and highly capable AI assistant companion.
You are running on the user's local machine/home lab.
You can chat about anything (coding, math, life, general knowledge, etc.).
You also have access to local tools that you can call natively to perform background tasks when the user requests them.
Only call tools when they are explicitly or implicitly required to satisfy the user's request. Otherwise, respond in friendly, flowing Markdown text.
IMPORTANT: When communicating in Thai, always refer to yourself as "ผม" and refer to the user as "คุณ".`;

const SYSTEM_PROMPT_SMALL = `You are Jarvis, a helpful local AI assistant. Keep responses brief, clear, and friendly. Call tools if necessary. IMPORTANT: When communicating in Thai, always refer to yourself as "ผม" and refer to the user as "คุณ".`;

/**
 * Orchestrator chat loop that manages sending history to Ollama,
 * streaming responses, and running tools recursively.
 */
export async function runAgentLoop(sessionId: string): Promise<void> {
  console.log(`[ORCHESTRATOR] Resuming session loop for ${sessionId}...`);

  try {
    // 1. Retrieve all past messages in the session
    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    const userMessages = messages.filter(m => m.role === 'user');
    const latestUserQuery = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

    // 2. Tune prompt complexity and context length based on LLM Profile
    let finalMessages = [...messages];
    let activeSystemPrompt = SYSTEM_PROMPT_LARGE;

    if (config.LLM_PROFILE === 'SMALL_MODEL') {
      activeSystemPrompt = SYSTEM_PROMPT_SMALL;
      if (messages.length > 4) {
        console.log(`[ORCHESTRATOR] SMALL_MODEL profile: Pruning context history from ${messages.length} to 4 messages.`);
        finalMessages = messages.slice(-4);
      }
    } else {
      if (messages.length > 20) {
        console.log(`[ORCHESTRATOR] LARGE_MODEL profile: Pruning context history to the last 20 messages.`);
        finalMessages = messages.slice(-20);
      }
    }

    const ollamaMessages = [
      { role: 'system', content: activeSystemPrompt },
      ...finalMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        ...(msg.name ? { name: msg.name } : {}),
        ...(msg.toolCalls ? { tool_calls: JSON.parse(msg.toolCalls) } : {}),
      })),
    ];

    // 3. Dynamic Tool Layering pre-check
    let activeCategories = ['FileManagement', 'HomeLab', 'Developer', 'SelfImprovement', 'Dynamic'];
    
    if (config.ENABLE_TOOLS_LAYERING && latestUserQuery) {
      console.log(`[LAYERING] Tools layering is enabled. Classifying user intent for: "${latestUserQuery.slice(0, 50)}..."`);
      try {
        const classificationPrompt = `System: You are an intent classifier. Categorize the user's latest query into zero, one, or more of these categories:
        - FileManagement (if the user wants to read, write, search, or list files/directories)
        - HomeLab (if the user wants to start, stop, or monitor home-lab systems)
        - Developer (if the user wants to run code execution, sandboxes, scripts, terminal commands, or search the web)
        - SelfImprovement (if the user wants to create a new tool, write code for a new function, or expand assistant capabilities)
        - Dynamic (if the user wants to run a custom dynamic tool previously created)
        
        User Query: "${latestUserQuery}"
        
        Respond ONLY with a comma-separated list of categories. Example response: FileManagement, Developer. If none apply, respond with: None.`;
        
        const classifyResponse = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
          model: OLLAMA_MODEL,
          messages: [{ role: 'user', content: classificationPrompt }],
          stream: false,
          options: { temperature: 0.1 }
        });
        
        const outputText = classifyResponse.data.message?.content || '';
        console.log(`[LAYERING] Raw classifier output: "${outputText.trim()}"`);
        
        const parsedCategories: string[] = [];
        if (outputText.includes('FileManagement')) parsedCategories.push('FileManagement');
        if (outputText.includes('HomeLab')) parsedCategories.push('HomeLab');
        if (outputText.includes('Developer')) parsedCategories.push('Developer');
        if (outputText.includes('SelfImprovement')) parsedCategories.push('SelfImprovement');
        if (outputText.includes('Dynamic')) parsedCategories.push('Dynamic');
        
        if (parsedCategories.length > 0) {
          activeCategories = parsedCategories;
        }
      } catch (e: any) {
        console.warn(`[LAYERING] Pre-check intent classification failed: ${e.message}. Falling back to all tool layers.`);
      }
    }

    console.log(`[LAYERING] Active tool categories for this turn:`, activeCategories);

    // Get active tools (scrubbed of blacklisted options inside registry.getAllTools())
    const activeTools = registry.getAllTools().filter(t => activeCategories.includes(t.category));
    const toolsToSend = activeTools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    console.log(`[ORCHESTRATOR] Sending request to Ollama (${OLLAMA_MODEL}) with ${ollamaMessages.length} messages and ${toolsToSend.length} active tools.`);

    const response = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
      model: OLLAMA_MODEL,
      messages: ollamaMessages,
      ...(toolsToSend.length > 0 ? { tools: toolsToSend } : {}),
      stream: true,
    }, {
      responseType: 'stream',
      headers: { 'Content-Type': 'application/json' },
      timeout: 300000, // 5 minutes timeout for slow CPU-only Linux servers
    });

    let assistantText = '';
    let toolCalls: any[] = [];
    let buffer = '';

    const stream = response.data;

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.tool_calls && parsed.message.tool_calls.length > 0) {
              toolCalls.push(...parsed.message.tool_calls);
            }
            if (parsed.message?.content) {
              const token = parsed.message.content;
              assistantText += token;
              broadcastToken(sessionId, token);
            }
          } catch (err) {
            console.error('[ORCHESTRATOR] Failed to parse line:', line, err);
          }
        }
      });

      stream.on('end', () => {
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer);
            if (parsed.message?.tool_calls) {
              toolCalls.push(...parsed.message.tool_calls);
            }
            if (parsed.message?.content) {
              assistantText += parsed.message.content;
              broadcastToken(sessionId, parsed.message.content);
            }
          } catch (e) {}
        }
        resolve();
      });

      stream.on('error', (err: any) => reject(err));
    });

    if (toolCalls.length > 0) {
      console.log(`[ORCHESTRATOR] Model returned ${toolCalls.length} tool calls.`);

      await prisma.message.create({
        data: {
          sessionId,
          role: 'assistant',
          content: ``, // Let the agent know this is purely a tool call request
          toolCalls: JSON.stringify(toolCalls),
        },
      });

      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        const toolArgs = tc.function.arguments || {};

        console.log(`[TOOL CALL] Executing registry tool "${toolName}"...`);
        broadcastToolStatus(sessionId, toolName, 'running');

        let toolResult = '';
        const registeredTool = registry.getTool(toolName);

        try {
          if (!registeredTool) {
            throw new Error(`Tool "${toolName}" is not registered in dynamic registry.`);
          }

          // Inject sessionId for human interruption prompt hook
          const injectedArgs = { ...toolArgs, sessionId };
          toolResult = await registeredTool.handler(injectedArgs);
          broadcastToolStatus(sessionId, toolName, 'completed', toolResult);
        } catch (toolError: any) {
          console.error(`[TOOL ERROR] Dynamic handler failed for "${toolName}":`, toolError);
          toolResult = JSON.stringify({ success: false, error: toolError.message || String(toolError) });
          broadcastToolStatus(sessionId, toolName, 'failed', toolResult);
        }

        await prisma.message.create({
          data: {
            sessionId,
            role: 'tool',
            name: toolName,
            content: toolResult,
          },
        });
      }

      // Re-run orchestrator loop recursively
      return runAgentLoop(sessionId);
    } else {
      if (assistantText.trim()) {
        await prisma.message.create({
          data: {
            sessionId,
            role: 'assistant',
            content: assistantText,
          },
        });
      }

      broadcastSessionUpdate(sessionId, 'chat_done');
      console.log(`[ORCHESTRATOR] Chat stream finished for session ${sessionId}.`);
    }

  } catch (error: any) {
    console.error(`[ORCHESTRATOR CRITICAL] Orchestrator loop crash:`, error.message || error);
    
    const errMsg = `System error: Failed to process assistant reasoning block (${error.message || String(error)}). Check local services.`;
    broadcastToken(sessionId, `\n\n*(Error: ${errMsg})*`);
    
    await prisma.message.create({
      data: {
        sessionId,
        role: 'assistant',
        content: `Error: ${errMsg}`,
      },
    });

    broadcastSessionUpdate(sessionId, 'chat_done');
  }
}
