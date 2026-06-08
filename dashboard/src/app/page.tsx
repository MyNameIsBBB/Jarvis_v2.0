'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Activity, 
  Terminal, 
  ArrowRight, 
  Clock, 
  Send, 
  Server, 
  Cpu, 
  Database, 
  Sparkles, 
  Code, 
  AlertTriangle,
  RefreshCw,
  Plus
} from 'lucide-react';
import { useAgentWebSocket, WebSocketUpdatePayload } from '../hooks/useAgentWebSocket';
import { TaskCard, Task } from '../components/TaskCard';

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // New Task Form
  const [newTitle, setNewTitle] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Resume Form
  const [feedback, setFeedback] = useState('');
  const [isResuming, setIsResuming] = useState(false);

  const [apiError, setApiError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

  // Fetch tasks on initial render
  const fetchTasks = useCallback(async () => {
    try {
      setApiError(null);
      const res = await fetch(`${API_URL}/tasks`);
      if (!res.ok) throw new Error('Failed to retrieve task listings.');
      const data = await res.json();
      setTasks(data);
      if (data.length > 0 && !selectedTaskId) {
        setSelectedTaskId(data[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || String(err));
    }
  }, [API_URL, selectedTaskId]);

  useEffect(() => {
    fetchTasks();
  }, []);

  // Handle real-time WebSocket state updates
  const handleWebSocketUpdate = useCallback((payload: WebSocketUpdatePayload) => {
    setTasks((prevTasks) => {
      const index = prevTasks.findIndex((t) => t.id === payload.taskId);
      const existingTask = prevTasks[index];
      
      const updatedTask: Task = {
        id: payload.taskId,
        title: payload.title,
        status: payload.status,
        createdAt: existingTask?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        graphState: payload.graphState,
      };

      if (index > -1) {
        const newTasks = [...prevTasks];
        newTasks[index] = updatedTask;
        return newTasks;
      } else {
        return [updatedTask, ...prevTasks];
      }
    });
  }, []);

  const { isConnected: isWsConnected } = useAgentWebSocket(handleWebSocketUpdate);

  // Derive the active selected task object
  const selectedTask = useMemo(() => {
    return tasks.find(t => t.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  // Handle task submission
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPrompt.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, prompt: newPrompt }),
      });
      if (!res.ok) throw new Error('Could not create new task.');
      const data = await res.json();
      
      // Clear forms
      setNewTitle('');
      setNewPrompt('');
      
      // Optimistically select new task
      setSelectedTaskId(data.taskId);
      fetchTasks();
    } catch (err: any) {
      alert(err.message || 'Failed to submit task');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle task resume (approval)
  const handleResumeTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId || !feedback.trim()) return;

    setIsResuming(true);
    try {
      const res = await fetch(`${API_URL}/tasks/${selectedTaskId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      if (!res.ok) throw new Error('Could not send resume trigger request.');
      
      // Clear human input field
      setFeedback('');
      fetchTasks();
    } catch (err: any) {
      alert(err.message || 'Failed to resume task');
    } finally {
      setIsResuming(false);
    }
  };

  // Extract thoughts, plans, and next actions from the last assistant message
  const parsedAssistantState = useMemo(() => {
    if (!selectedTask) return null;
    const assistantMsgs = selectedTask.graphState.messages.filter(m => m.role === 'assistant');
    if (assistantMsgs.length === 0) return null;

    const lastMsg = assistantMsgs[assistantMsgs.length - 1];
    try {
      return JSON.parse(lastMsg.content);
    } catch (e) {
      return {
        thought: lastMsg.content,
        plan: 'Standard flow execution.',
        tool_to_use: 'Processing...',
        tool_args: {}
      };
    }
  }, [selectedTask]);

  // Aggregate metrics
  const tokenMetrics = useMemo(() => {
    if (!selectedTask || !selectedTask.graphState.tokenLogs) return { prompt: 0, completion: 0, total: 0 };
    return selectedTask.graphState.tokenLogs.reduce((acc, log) => {
      acc.prompt += log.promptTokens || 0;
      acc.completion += log.completionTokens || 0;
      acc.total += log.totalTokens || 0;
      return acc;
    }, { prompt: 0, completion: 0, total: 0 });
  }, [selectedTask]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-violet-500/30 selection:text-violet-200">
      {/* Top Header */}
      <header className="h-16 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.3)]">
            <Activity className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight bg-gradient-to-r from-zinc-100 via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
              Durable Agent Command Center
            </h1>
            <p className="text-[10px] text-zinc-500 font-mono -mt-0.5">V2.0 // TS + DOCKER SANDBOX</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs">
            <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-500 animate-ping' : 'bg-red-500'}`}></span>
            <span className="text-zinc-400 font-mono text-[10px]">
              {isWsConnected ? 'WS STREAM ONLINE' : 'WS DISCONNECTED'}
            </span>
          </div>
          <button 
            onClick={fetchTasks}
            className="p-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Grid Dashboard */}
      <main className="flex-1 grid grid-cols-12 overflow-hidden h-[calc(100vh-4rem)]">
        
        {/* Column 1: Left Task Controller Panel */}
        <section className="col-span-3 border-r border-zinc-900 flex flex-col bg-zinc-950/40">
          {/* New Task Form */}
          <div className="p-4 border-b border-zinc-900">
            <h3 className="font-semibold text-sm mb-3 text-zinc-200 flex items-center gap-2">
              <Plus className="w-4 h-4 text-violet-400" /> Initialize New Task
            </h3>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Task Title (e.g. Write CSV Parser)"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-lg px-3 py-2 text-xs placeholder:text-zinc-600 focus:outline-none transition-colors"
                required
              />
              <textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="System instructions & task prompt..."
                className="w-full h-20 bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-lg px-3 py-2 text-xs placeholder:text-zinc-600 focus:outline-none transition-colors resize-none"
                required
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(139,92,246,0.2)] transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isSubmitting ? 'Spawning Agent...' : 'Launch Agent Loop'}
              </button>
            </form>
          </div>

          {/* Task list container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-mono">
              Active Task Threads ({tasks.length})
            </h3>
            {apiError && (
              <div className="p-3 bg-red-950/20 border border-red-500/20 text-red-400 rounded-lg text-xs">
                {apiError}
              </div>
            )}
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-zinc-600 text-xs">
                No active task instances.
              </div>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isSelected={selectedTaskId === task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                />
              ))
            )}
          </div>
        </section>

        {/* Column 2: Center Thought-Loop chat */}
        <section className="col-span-6 flex flex-col bg-zinc-900/10 border-r border-zinc-900">
          {selectedTask ? (
            <>
              {/* Task Header */}
              <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-950/20 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-base text-zinc-100 flex items-center gap-2">
                    {selectedTask.title}
                  </h2>
                  <p className="text-[10px] text-zinc-500 font-mono select-all mt-0.5">ID: {selectedTask.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500">Updated: {new Date(selectedTask.updatedAt).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* Central Area: Thoughts block & messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Thoughts & Plans Section */}
                {parsedAssistantState && (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Thoughts block */}
                    <div className="bg-violet-950/5 border border-violet-500/20 rounded-xl p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                      <h4 className="text-xs font-bold text-violet-400 flex items-center gap-1.5 uppercase tracking-wide mb-2 font-mono">
                        <Sparkles className="w-3.5 h-3.5" /> Agent Thought Process
                      </h4>
                      <p className="text-xs text-zinc-300 leading-relaxed font-sans">{parsedAssistantState.thought}</p>
                    </div>

                    {/* Plans block */}
                    <div className="bg-indigo-950/5 border border-indigo-500/20 rounded-xl p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                      <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 uppercase tracking-wide mb-2 font-mono">
                        <Activity className="w-3.5 h-3.5" /> Active Execution Plan
                      </h4>
                      <p className="text-xs text-zinc-300 leading-relaxed font-sans">{parsedAssistantState.plan}</p>
                    </div>
                  </div>
                )}

                {/* 2. Chat history logs */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider font-mono">
                    Thread Execution Logs
                  </h3>
                  
                  {selectedTask.graphState.messages.map((msg, index) => {
                    if (msg.role === 'system') return null; // Filter backend prompts in chat representation
                    
                    // Parse if assistant JSON output
                    let parsedContent = msg.content;
                    let isJsonObj = false;
                    if (msg.role === 'assistant') {
                      try {
                        const parsed = JSON.parse(msg.content);
                        parsedContent = `Action: Executing ${parsed.tool_to_use}`;
                        isJsonObj = true;
                      } catch (e) {
                        isJsonObj = false;
                      }
                    }

                    // Format based on role
                    const isTool = msg.role === 'tool';
                    const isUser = msg.role === 'user';
                    
                    return (
                      <div 
                        key={index} 
                        className={`flex flex-col gap-1.5 max-w-[90%] ${
                          isUser ? 'ml-auto items-end' : 'mr-auto items-start'
                        }`}
                      >
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono px-1">
                          {isUser ? 'Human Feedback' : isTool ? `Tool Output // ${msg.name}` : 'Agent Action'}
                        </span>
                        
                        <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                          isUser 
                            ? 'bg-zinc-900 border-zinc-800 text-zinc-100 rounded-tr-none'
                            : isTool 
                            ? 'bg-zinc-950/80 border-zinc-900 font-mono text-zinc-400 w-full max-w-full overflow-x-auto rounded-tl-none' 
                            : 'bg-zinc-950 border-zinc-900 text-zinc-300 rounded-tl-none'
                        }`}>
                          {isTool ? (
                            <pre className="whitespace-pre-wrap leading-5 text-[11px]">
                              {(() => {
                                try {
                                  const parsedTool = JSON.parse(msg.content);
                                  if (parsedTool.stdout !== undefined || parsedTool.stderr !== undefined) {
                                    return (
                                      <>
                                        {parsedTool.stdout && <span className="text-emerald-500">{parsedTool.stdout}</span>}
                                        {parsedTool.stderr && <span className="text-red-400">{parsedTool.stderr}</span>}
                                        {parsedTool.exitCode !== undefined && (
                                          <span className="text-zinc-600 block mt-1">Exit Code: {parsedTool.exitCode}</span>
                                        )}
                                      </>
                                    );
                                  }
                                  return msg.content;
                                } catch (e) {
                                  return msg.content;
                                }
                              })()}
                            </pre>
                          ) : (
                            <p className="whitespace-pre-wrap">{parsedContent}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom human validation panel (AWAITING_HUMAN card) */}
              {selectedTask.status === 'AWAITING_HUMAN' && (
                <div className="p-6 border-t border-zinc-900 bg-zinc-950/60 backdrop-blur-md">
                  <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-5 shadow-[0_0_20px_rgba(245,158,11,0.05)]">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 text-amber-400 shrink-0">
                        <AlertTriangle className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-zinc-200">
                          Human Feedback Required
                        </h4>
                        <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                          The agent loop is paused awaiting approval or input to resume execution.
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleResumeTask} className="flex gap-3 mt-4">
                      <input
                        type="text"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Type approval response or clarify instructions..."
                        className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-lg px-4 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors"
                        required
                      />
                      <button
                        type="submit"
                        disabled={isResuming || !feedback.trim()}
                        className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all cursor-pointer"
                      >
                        <ArrowRight className="w-4 h-4" />
                        {isResuming ? 'Resuming...' : 'Approve & Resume'}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 select-none">
              <Terminal className="w-12 h-12 text-zinc-700 mb-4 stroke-1 animate-pulse" />
              <h3 className="font-bold text-zinc-400 mb-1">No Active Session Selected</h3>
              <p className="text-xs max-w-sm leading-relaxed text-zinc-600">
                Choose a task thread from the control panel sidebar, or create a new objective to launch the orchestrator loop.
              </p>
            </div>
          )}
        </section>

        {/* Column 3: Right Sidebar Monitor */}
        <section className="col-span-3 p-6 space-y-6 overflow-y-auto bg-zinc-950/40">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" /> System Monitor
          </h3>

          {selectedTask ? (
            <>
              {/* Task statistics */}
              <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Metrics & Variables
                </h4>
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-2.5 bg-zinc-950/60 rounded-lg border border-zinc-900">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Total Steps</p>
                    <p className="font-bold text-lg text-zinc-200 mt-0.5">
                      {selectedTask.graphState.messages.filter(m => m.role === 'assistant').length}
                    </p>
                  </div>
                  <div className="p-2.5 bg-zinc-950/60 rounded-lg border border-zinc-900">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Token Count</p>
                    <p className="font-bold text-lg text-violet-400 mt-0.5">
                      {tokenMetrics.total}
                    </p>
                  </div>
                </div>

                <div className="border-t border-zinc-900/80 pt-3 space-y-2 text-[11px] text-zinc-400 font-mono">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Prompt Tokens:</span>
                    <span>{tokenMetrics.prompt}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Completion Tokens:</span>
                    <span>{tokenMetrics.completion}</span>
                  </div>
                </div>
              </div>

              {/* State bindings json viewer */}
              <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-4 space-y-3 flex flex-col h-72">
                <h4 className="text-xs font-semibold text-zinc-400 flex items-center gap-1 shrink-0">
                  <Code className="w-3.5 h-3.5" /> Environment Variables
                </h4>
                <div className="flex-1 bg-zinc-950 border border-zinc-900 rounded-lg p-3 font-mono text-[10px] text-emerald-400 overflow-auto">
                  <pre>{JSON.stringify(selectedTask.graphState.variables || {}, null, 2)}</pre>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-zinc-700 font-mono text-xs border border-zinc-900 border-dashed rounded-xl">
              Awaiting session metrics...
            </div>
          )}

          {/* Infrastructure config */}
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-4 space-y-3 text-[11px] text-zinc-400 font-mono">
            <h4 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 font-sans mb-1">
              <Database className="w-3.5 h-3.5" /> Connection Settings
            </h4>
            <div className="flex justify-between">
              <span className="text-zinc-600">Ollama API:</span>
              <span>11434</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Sandbox:</span>
              <span className="text-zinc-300">Docker (node-alpine)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">ORM / Client:</span>
              <span className="text-zinc-300">Prisma (PostgreSQL)</span>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
