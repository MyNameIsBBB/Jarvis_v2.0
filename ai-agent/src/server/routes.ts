import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { runAgentLoop } from '../agent/orchestrator';
import { broadcastSessionUpdate } from './ws';
import { config, IMMUTABLE_DISABLED_TOOLS } from '../config';
import { registry } from '../tools/registry';
import { waitingApprovals } from '../utils/approval';

const router = Router();

/**
 * GET /api/config
 * Exposes the active LLM Profile, feature flags, and current base tool statuses.
 */
router.get('/config', (req, res) => {
  const allTools = registry.getAllBaseTools();
  const disabledList = config.DISABLED_TOOLS || [];
  
  const toolsInfo = allTools.map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
    isGloballyDisabled: IMMUTABLE_DISABLED_TOOLS.includes(t.name),
    isEnabled: !disabledList.includes(t.name)
  }));

  return res.json({
    ...config,
    tools: toolsInfo
  });
});

/**
 * POST /api/config/tools
 * Toggles a tool's enablement status unless it's locked by environment configurations.
 */
router.post('/config/tools', (req, res) => {
  const { name, enabled } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Tool name is required.' });
  }

  // If locked at infrastructure level, deny change
  if (IMMUTABLE_DISABLED_TOOLS.includes(name)) {
    return res.status(403).json({ error: `Tool "${name}" is locked at the infrastructure level by environment variables.` });
  }

  if (enabled) {
    // Enable the tool by removing it from the disabled array
    config.DISABLED_TOOLS = config.DISABLED_TOOLS.filter(t => t !== name);
  } else {
    // Disable it by adding it to the disabled array
    if (!config.DISABLED_TOOLS.includes(name)) {
      config.DISABLED_TOOLS.push(name);
    }
  }

  console.log(`[CONFIG] Tool "${name}" set to enabled=${enabled}. Current disabled list:`, config.DISABLED_TOOLS);
  return res.json({ success: true, config });
});

/**
 * POST /api/sessions/:id/respond
 * Resolves the suspended promise for human interruption prompts.
 */
router.post('/sessions/:id/respond', (req, res) => {
  const { id } = req.params;
  const { approved, notes } = req.body;

  const approvalReq = waitingApprovals.get(id);
  if (!approvalReq) {
    return res.status(404).json({ error: 'No active human interruption request found for this session.' });
  }

  waitingApprovals.delete(id);
  
  // Resolve the suspended Promise inside the tool execution
  approvalReq.resolve(JSON.stringify({ 
    success: true, 
    approved: !!approved, 
    notes: notes || '' 
  }));

  console.log(`[APPROVAL] Human responded to session ${id}: approved=${approved}, notes="${notes || ''}"`);
  return res.json({ success: true });
});

/**
 * GET /api/sessions/:id/approval-status
 * Fetches whether a session is currently waiting for human approval.
 */
router.get('/sessions/:id/approval-status', (req, res) => {
  const { id } = req.params;
  const approvalReq = waitingApprovals.get(id);
  if (!approvalReq) {
    return res.json({ waiting: false });
  }
  return res.json({ 
    waiting: true, 
    prompt: approvalReq.prompt, 
    variables: approvalReq.variables 
  });
});

/**
 * GET /api/sessions
 * Returns all chat sessions ordered by updated date.
 */
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await prisma.chatSession.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { messages: true }
        }
      }
    });
    return res.json(sessions);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
});

/**
 * POST /api/sessions
 * Creates a new chat session with an optional initial prompt message.
 */
router.post('/sessions', async (req, res) => {
  const { title, prompt } = req.body;

  try {
    const defaultTitle = title || (prompt ? (prompt.slice(0, 30) + (prompt.length > 30 ? '...' : '')) : 'New Session');

    const session = await prisma.chatSession.create({
      data: {
        title: defaultTitle,
      },
    });

    if (prompt) {
      await prisma.message.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: prompt,
        },
      });

      runAgentLoop(session.id).catch((err) => {
        console.error(`[ASYNC ERROR] Error running orchestrator for session ${session.id}:`, err);
      });
    }

    broadcastSessionUpdate(session.id, 'session_created');

    return res.status(201).json(session);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
});

/**
 * GET /api/sessions/:id
 * Fetches the session and all associated messages.
 */
router.get('/sessions/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: `Session with ID ${id} not found.` });
    }

    return res.json(session);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
});

/**
 * POST /api/sessions/:id/messages
 * Adds a new user message to the session and triggers the orchestrator loop.
 */
router.post('/sessions/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Missing required field: "content".' });
  }

  try {
    const session = await prisma.chatSession.findUnique({
      where: { id },
    });

    if (!session) {
      return res.status(404).json({ error: `Session with ID ${id} not found.` });
    }

    const userMessage = await prisma.message.create({
      data: {
        sessionId: id,
        role: 'user',
        content,
      },
    });

    await prisma.chatSession.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    runAgentLoop(id).catch((err) => {
      console.error(`[ASYNC ERROR] Error during chat loop execution for session ${id}:`, err);
    });

    return res.json({
      success: true,
      messageId: userMessage.id,
      status: 'PROCESSING',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
});

/**
 * DELETE /api/sessions/:id
 * Deletes a session and its associated messages.
 */
router.delete('/sessions/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const session = await prisma.chatSession.findUnique({
      where: { id },
    });

    if (!session) {
      return res.status(404).json({ error: `Session with ID ${id} not found.` });
    }

    await prisma.chatSession.delete({
      where: { id },
    });

    broadcastSessionUpdate(id, 'session_deleted');

    return res.json({ success: true, message: 'Session deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
});

export default router;
