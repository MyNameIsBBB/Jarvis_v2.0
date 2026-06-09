import axios from 'axios';
import { prisma } from '../utils/prisma';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4';

interface RoutingResult {
  sessionId: string;
  isRedirect: boolean;
}

/**
 * Classifies a user's prompt and routes it to the most appropriate ChatSession.
 * - Conversational, greeting, math, or casual topics route to a persistent "General Chat" session.
 * - Topics matching existing projects or discussions route to that specific session.
 * - Distinct new topics trigger the creation of a new session with an LLM-generated title.
 */
export async function routeSessionMessage(
  prompt: string,
  currentSessionId: string | null
): Promise<RoutingResult> {
  console.log(`[ROUTER] Classifying prompt routing for: "${prompt.slice(0, 50)}..."`);

  try {
    // 1. Fetch all existing sessions
    const sessions = await prisma.chatSession.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    // 2. Ensure "General Chat" session exists
    let generalSession = sessions.find(s => s.title.toLowerCase() === 'general chat');
    if (!generalSession) {
      console.log(`[ROUTER] "General Chat" session not found. Creating default...`);
      generalSession = await prisma.chatSession.create({
        data: { title: 'General Chat' },
      });
      sessions.push(generalSession);
    }

    // If there is only the General Chat session, we don't need complex matching unless it's a completely new topic.
    // If sessions list is long, let's limit it to avoid context length overflow during classification
    const candidateSessions = sessions.slice(0, 15);

    const sessionListStr = candidateSessions
      .map((s) => `- Session ID: "${s.id}", Topic Title: "${s.title}"`)
      .join('\n');

    const systemPrompt = `You are a semantic conversational router. Analyze the user's input and choose the most relevant session from the list below, or decide to create a new one.

Existing Chat Sessions:
${sessionListStr}

Classification Rules:
1. General Sandbox: If the input is conversational, a greeting, math-centric, general advice, or basic chit-chat (e.g. "hi", "how are you", "what is 2+2", "tell me a joke"), choose the "General Chat" session ID: "${generalSession.id}".
2. Semantic Match: If the input is about a specific ongoing project, task, topic, or context matching one of the existing session titles (e.g., if input is about server status and there is a session about the server, or file coding when a coding session exists), choose that session's ID.
3. New Context: If the input introduces a completely distinct standalone objective, query, or project initialization not matching any existing session (e.g., "let's build a discord bot from scratch", "write a shopping list for carbonara recipe"), decide to create a new session.

You must respond ONLY with a raw JSON block matching this interface:
{
  "route": "GENERAL" | "EXISTING" | "NEW",
  "sessionId": "the-chosen-session-id-if-general-or-existing",
  "newTitle": "a suggested short 3-5 word title for the session if NEW"
}`;

    const response = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `User Input Prompt: "${prompt}"` }
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.1 }
    });

    const content = response.data.message?.content || '{}';
    console.log(`[ROUTER] LLM Classification response: "${content.trim()}"`);
    const parsed = JSON.parse(content);

    if (parsed.route === 'NEW' && parsed.newTitle) {
      console.log(`[ROUTER] Routing decided a NEW session is required. Title: "${parsed.newTitle}"`);
      const newSession = await prisma.chatSession.create({
        data: { title: parsed.newTitle },
      });
      return {
        sessionId: newSession.id,
        isRedirect: true,
      };
    }

    if (parsed.route === 'EXISTING' && parsed.sessionId) {
      const exists = sessions.some(s => s.id === parsed.sessionId);
      if (exists) {
        console.log(`[ROUTER] Routing matched an EXISTING session ID: "${parsed.sessionId}"`);
        return {
          sessionId: parsed.sessionId,
          isRedirect: parsed.sessionId !== currentSessionId,
        };
      }
    }

    // Default Fallback to General Chat
    console.log(`[ROUTER] Default routing to General Chat ID: "${generalSession.id}"`);
    return {
      sessionId: generalSession.id,
      isRedirect: generalSession.id !== currentSessionId,
    };

  } catch (error: any) {
    console.warn(`[ROUTER ERROR] Routing pre-check failed: ${error.message || error}. Falling back to current session or General.`);
    // Fallback to current session, or try to get/create General Chat
    try {
      let generalSession = await prisma.chatSession.findFirst({
        where: { title: 'General Chat' }
      });
      if (!generalSession) {
        generalSession = await prisma.chatSession.create({
          data: { title: 'General Chat' }
        });
      }
      const targetId = currentSessionId || generalSession.id;
      return {
        sessionId: targetId,
        isRedirect: targetId !== currentSessionId,
      };
    } catch (dbErr) {
      throw new Error(`Critical routing failure: ${error.message}`);
    }
  }
}
