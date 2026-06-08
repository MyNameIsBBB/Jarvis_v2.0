import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { runAgentLoop } from '../agent/orchestrator';
import { GraphState } from '../agent/types';

const router = Router();

/**
 * POST /api/tasks
 * Initializes a new agent task and triggers the orchestrator loop asynchronously.
 */
router.post('/tasks', async (req, res) => {
  const { title, prompt } = req.body;

  if (!title || !prompt) {
    return res.status(400).json({ error: 'Missing required fields: "title" and "prompt".' });
  }

  try {
    const initialGraphState: GraphState = {
      messages: [
        { role: 'user', content: prompt },
      ],
      variables: {},
      tokenLogs: [],
    };

    const task = await prisma.agentTask.create({
      data: {
        title,
        status: 'IDLE',
        graphState: initialGraphState as any,
      },
    });

    // Fire orchestrator loop asynchronously
    runAgentLoop(task.id).catch((err) => {
      console.error(`[ASYNC ERROR] Error during agent initialization run for task ${task.id}:`, err);
    });

    return res.status(201).json({
      success: true,
      taskId: task.id,
      status: 'RUNNING',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
});

/**
 * GET /api/tasks
 * Fetches all tasks ordered by creation date.
 */
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await prisma.agentTask.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.json(tasks);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
});

/**
 * GET /api/tasks/:id
 * Fetches the current task status, messages, token logs, and execution state variables.
 */
router.get('/tasks/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const task = await prisma.agentTask.findUnique({
      where: { id },
    });

    if (!task) {
      return res.status(404).json({ error: `Task with ID ${id} not found.` });
    }

    return res.json(task);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
});

/**
 * POST /api/tasks/:id/resume
 * Resumes a task by injecting user input, updating status to RUNNING, and re-triggering the loop asynchronously.
 */
router.post('/tasks/:id/resume', async (req, res) => {
  const { id } = req.params;
  const { feedback } = req.body;

  if (!feedback) {
    return res.status(400).json({ error: 'Missing required field: "feedback".' });
  }

  try {
    const task = await prisma.agentTask.findUnique({
      where: { id },
    });

    if (!task) {
      return res.status(404).json({ error: `Task with ID ${id} not found.` });
    }

    if (task.status !== 'PAUSED' && task.status !== 'AWAITING_HUMAN') {
      return res.status(400).json({ error: `Task is in "${task.status}" state. Only PAUSED or AWAITING_HUMAN tasks can be resumed.` });
    }

    // Trigger agent loop asynchronously with the user feedback injection
    runAgentLoop(id, feedback).catch((err) => {
      console.error(`[ASYNC ERROR] Error during agent resume loop execution for task ${id}:`, err);
    });

    return res.json({
      success: true,
      message: 'Resume signal received. Loop restarted.',
      status: 'RUNNING',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || String(error) });
  }
});

export default router;
