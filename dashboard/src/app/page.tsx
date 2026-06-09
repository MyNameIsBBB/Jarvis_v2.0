'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Server, 
  Plus,
  Trash2,
  ChevronRight,
  FolderOpen,
  Gamepad2,
  Terminal,
  Sparkles,
  Settings,
  Sun,
  Moon,
  Clock,
  Menu,
  X,
  Database,
  Lock
} from 'lucide-react';
import { useAgentWebSocket, WebSocketPayload } from '../hooks/useAgentWebSocket';
import ChatArea, { Message, ChatSession, BackendConfig } from '../components/ChatArea';

export default function Dashboard() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  // Input & Status
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTool, setActiveTool] = useState<{ name: string; status: 'running' | 'completed' | 'failed'; result?: string } | null>(null);
  const [backendConfig, setBackendConfig] = useState<BackendConfig | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<{ waiting: boolean; prompt?: string; variables?: string } | null>(null);
  
  // Message Queue system
  const [messageQueue, setMessageQueue] = useState<string[]>([]);

  // Voice States (STT & TTS)
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Theme management (Cozy Mode)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isAutoTheme, setIsAutoTheme] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Mobile Drawer toggles
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileMonitorOpen, setMobileMonitorOpen] = useState(false);
  
  // Connection / Status
  const [apiError, setApiError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Time-based automatic theme engine
  useEffect(() => {
    if (!isAutoTheme) return;

    const evaluateTimeTheme = () => {
      const currentHour = new Date().getHours();
      if (currentHour >= 6 && currentHour < 18) {
        setTheme('light');
      } else {
        setTheme('dark');
      }
    };

    evaluateTimeTheme();
    const interval = setInterval(evaluateTimeTheme, 60000);
    return () => clearInterval(interval);
  }, [isAutoTheme]);

  // Fetch backend configurations
  const fetchBackendConfig = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:3000/api/config`);
      if (res.ok) {
        const data = await res.json();
        setBackendConfig(data);
      }
    } catch (err) {
      console.warn('[CONFIG] Unable to connect to config endpoint.', err);
    }
  }, []);

  // Check approval status
  const checkApprovalStatus = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/approval-status`);
      if (res.ok) {
        const data = await res.json();
        setApprovalRequest(data);
      }
    } catch (err) {
      console.warn('[APPROVAL] Failed checking approval status', err);
    }
  }, [API_URL]);

  // Fetch all chat sessions
  const fetchSessions = useCallback(async (selectFirst = false) => {
    try {
      setApiError(null);
      const res = await fetch(`${API_URL}/sessions`);
      if (!res.ok) throw new Error('Failed to retrieve chat sessions.');
      const data = (await res.json()) as ChatSession[];
      setSessions(data);
      if (selectFirst && data.length > 0) {
        // If there's an ongoing session, choose it, or find General Chat
        const general = data.find(s => s.title.toLowerCase() === 'general chat');
        setSelectedSessionId(general ? general.id : data[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || String(err));
    }
  }, [API_URL]);

  // Fetch all messages in a session
  const fetchMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}`);
      if (!res.ok) throw new Error('Failed to load session history.');
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || String(err));
    }
  }, [API_URL]);

  useEffect(() => {
    fetchSessions(true);
    fetchBackendConfig();
  }, [fetchSessions, fetchBackendConfig]);

  useEffect(() => {
    if (selectedSessionId) {
      fetchMessages(selectedSessionId);
      checkApprovalStatus(selectedSessionId);
      setActiveTool(null);
      setIsProcessing(false);
    } else {
      setMessages([]);
      setApprovalRequest(null);
    }
    setMobileSidebarOpen(false);
    setMobileMonitorOpen(false);
  }, [selectedSessionId, fetchMessages, checkApprovalStatus]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTool]);

  // Message Queue worker loop
  useEffect(() => {
    const processQueue = async () => {
      if (messageQueue.length === 0 || isProcessing) return;

      const nextMessageText = messageQueue[0];
      setMessageQueue((prev) => prev.slice(1));
      setIsProcessing(true);

      // Instantly append user's text to state
      const tempUserMsg: Message = {
        id: Math.random().toString(),
        role: 'user',
        content: nextMessageText,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      try {
        const res = await fetch(`${API_URL}/sessions/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            content: nextMessageText, 
            currentSessionId: selectedSessionId 
          }),
        });

        if (!res.ok) throw new Error('Could not route message.');
        const data = await res.json();
        
        if (data.sessionId && data.sessionId !== selectedSessionId) {
          console.log(`[QUEUE ENGINE] API Redirecting to session: ${data.sessionId}`);
          setSelectedSessionId(data.sessionId);
        }
      } catch (err: any) {
        console.error(err);
        alert(err.message || 'Error processing message from queue.');
        setIsProcessing(false);
      }
    };

    processQueue();
  }, [messageQueue, isProcessing, selectedSessionId, API_URL]);

  // Handle incoming socket payloads
  const handleWebSocketMessage = useCallback((payload: WebSocketPayload) => {
    const { type, sessionId, token, toolName, status, result, eventType, targetSessionId } = payload;

    if (type === 'session_redirect') {
      if (targetSessionId && targetSessionId !== selectedSessionId) {
        console.log(`[WS REDIRECT] Shifting session viewport: ${selectedSessionId} -> ${targetSessionId}`);
        setSelectedSessionId(targetSessionId);
      }
      return;
    }

    if (sessionId && sessionId !== selectedSessionId) {
      if (type === 'session_update') {
        fetchSessions();
      }
      return;
    }

    switch (type) {
      case 'chat_token':
        setIsProcessing(true);
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...lastMsg,
              content: lastMsg.content + token,
            };
            return updated;
          } else {
            return [
              ...prev,
              {
                id: Math.random().toString(),
                role: 'assistant',
                content: token || '',
                createdAt: new Date().toISOString(),
              },
            ];
          }
        });
        break;

      case 'tool_status':
        if (toolName) {
          setActiveTool({
            name: toolName,
            status: status || 'running',
            result: result,
          });
          if (status === 'running') {
            setIsProcessing(true);
            if (toolName === 'human_interruption_prompt' && selectedSessionId) {
              checkApprovalStatus(selectedSessionId);
            }
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: Math.random().toString(),
                role: 'tool',
                name: toolName,
                content: result || '',
                createdAt: new Date().toISOString(),
              }
            ]);
            setActiveTool(null);
            if (toolName === 'human_interruption_prompt') {
              setApprovalRequest(null);
            }
          }
        }
        break;

      case 'session_update':
        fetchSessions();
        if (eventType === 'chat_done') {
          setIsProcessing(false);
          setActiveTool(null);
          setApprovalRequest(null);
          if (selectedSessionId) {
            fetchMessages(selectedSessionId);
          }
        }
        break;

      default:
        break;
    }
  }, [selectedSessionId, fetchSessions, fetchMessages, checkApprovalStatus]);

  const { isConnected: isWsConnected } = useAgentWebSocket(handleWebSocketMessage);

  // Push user prompt into sequential processing queue
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText;
    setInputText('');
    setMessageQueue((prev) => [...prev, text]);
  };

  const handleCreateNewSession = () => {
    setSelectedSessionId(null);
    setMessages([]);
    setActiveTool(null);
    setIsProcessing(false);
    setApprovalRequest(null);
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat session?')) return;

    try {
      const res = await fetch(`${API_URL}/sessions/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete session.');
      fetchSessions();
      if (selectedSessionId === id) {
        setSelectedSessionId(null);
        setApprovalRequest(null);
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting session.');
    }
  };

  const handleToggleTool = async (name: string, enabled: boolean) => {
    try {
      const res = await fetch(`${API_URL}/config/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, enabled })
      });
      if (res.ok) {
        fetchBackendConfig();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to toggle tool status.');
      }
    } catch (err) {
      console.error('[CONFIG] Tool toggle error:', err);
      alert('Error updating configuration switch.');
    }
  };

  const handleRespondApproval = async (approved: boolean, notes: string) => {
    if (!selectedSessionId) return;
    try {
      const res = await fetch(`${API_URL}/sessions/${selectedSessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, notes })
      });
      if (res.ok) {
        setApprovalRequest(null);
        fetchMessages(selectedSessionId);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to submit approval notes.');
      }
    } catch (err: any) {
      alert(err.message || 'Error communicating approval input.');
    }
  };

  // Speech-to-Text handler
  const handleToggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('Web Speech STT Recognition is not supported by your browser.');
        return;
      }

      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'th-TH'; // Default to Thai language recognition

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText((prev) => prev + (prev ? ' ' : '') + transcript);
        }
      };

      rec.onerror = (event: any) => {
        console.error('[STT ERROR] Speech recognition error:', event);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    }
  };

  // Text-to-Speech handler
  const handleSpeakText = (text: string, msgId: string) => {
    if (speakingMessageId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    // Cancel any active readouts
    window.speechSynthesis.cancel();

    // Sanitize message block
    const cleanText = text
      .replace(/\*\*|`|#/g, '')
      .replace(/\[Tool Call requested:.*?\]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Auto-select Thai voice if available
    const voices = window.speechSynthesis.getVoices();
    const thVoice = voices.find(v => v.lang.includes('th') || v.lang.includes('TH'));
    if (thVoice) {
      utterance.voice = thVoice;
    }

    utterance.onend = () => {
      setSpeakingMessageId(null);
    };

    utterance.onerror = () => {
      setSpeakingMessageId(null);
    };

    setSpeakingMessageId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const isLight = theme === 'light';
  
  // Theme styling applying Cozy White & Brown Earth Tone Palette
  const outerBg = isLight 
    ? 'bg-[#faf6f0] text-[#3f3a36] transition-colors duration-700 ease-in-out' 
    : 'bg-[#141210] text-[#f2eee9] transition-colors duration-700 ease-in-out';
  
  const headerBg = isLight 
    ? 'border-b border-[#e9dcce] bg-[#faf6f0]/85 backdrop-blur-md transition-colors duration-700 ease-in-out' 
    : 'border-b border-[#2a2622] bg-[#141210]/85 backdrop-blur-md transition-colors duration-700 ease-in-out';
  
  const sidebarBg = isLight 
    ? 'bg-[#f4ebe1] border-r border-[#e9dcce] transition-colors duration-700 ease-in-out' 
    : 'bg-[#1d1a17] border-r border-[#2a2622] transition-colors duration-700 ease-in-out';

  const systemSidebarBg = isLight 
    ? 'bg-[#f4ebe1] border-l border-[#e9dcce] transition-colors duration-700 ease-in-out' 
    : 'bg-[#1d1a17] border-l border-[#2a2622] transition-colors duration-700 ease-in-out';

  const submitButton = isLight
    ? 'bg-[#a07c5a] hover:bg-[#8e6b4a] text-white rounded-xl shadow-sm transition-all active:scale-95'
    : 'bg-[#8c7355] hover:bg-[#786146] text-white rounded-xl shadow-[0_2px_10px_rgba(140,115,85,0.15)] transition-all active:scale-95';

  const secondaryPanelHeader = isLight
    ? 'text-xs font-bold text-[#7c7267] uppercase tracking-widest font-mono flex items-center gap-2'
    : 'text-xs font-bold text-[#a89e95] uppercase tracking-widest font-mono flex items-center gap-2';

  // Shared Sidebar content (so we can reuse for desktop and mobile slide-out drawer)
  const renderSidebarContent = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 flex items-center justify-between shrink-0">
        <button
          onClick={handleCreateNewSession}
          className={`w-full py-2.5 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${submitButton}`}
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
        {/* Mobile close button inside drawer */}
        <button 
          onClick={() => setMobileSidebarOpen(false)}
          className="p-2 ml-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl md:hidden text-zinc-550"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <div className="px-3 py-1 text-[9px] font-bold text-[#7c7267] dark:text-[#a89e95] uppercase tracking-widest font-mono">
          Sessions ({sessions.length})
        </div>
        
        {apiError && (
          <div className="p-3 bg-red-950/15 border border-red-500/20 text-red-400 rounded-lg text-xs font-mono">
            {apiError}
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="text-center py-8 text-[#7c7267] dark:text-zinc-650 text-xs">
            No past sessions
          </div>
        ) : (
          sessions.map((session) => {
            const isSelected = selectedSessionId === session.id;
            return (
              <div
                key={session.id}
                onClick={() => setSelectedSessionId(session.id)}
                className={`group w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-[#a07c5a]/10 dark:bg-[#8c7355]/15 border border-[#a07c5a]/25 dark:border-[#8c7355]/30 text-[#a07c5a] dark:text-[#d4c3b3] shadow-sm' 
                    : 'text-[#7c7267] dark:text-[#a89e95] hover:bg-[#eadecc]/20 dark:hover:bg-zinc-800/30'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden mr-2">
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isSelected ? 'text-[#a07c5a] dark:text-[#d4c3b3] rotate-90' : 'text-zinc-500 group-hover:translate-x-0.5'}`} />
                  <span className="truncate font-semibold">{session.title}</span>
                </div>
                
                <button
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-500 hover:text-red-500 transition-all shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Settings Card inside drawer navigation menu */}
      <div className={`p-4 border-t shrink-0 space-y-3.5 ${isLight ? 'border-[#e9dcce]' : 'border-[#2a2622]'}`}>
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-[#7c7267] dark:text-[#a89e95] uppercase tracking-wider font-mono flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5 text-[#a07c5a] dark:text-[#8c7355]" /> Starter Tools Matrix
          </span>
        </div>

        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
          {backendConfig?.tools?.map((tool) => (
            <div key={tool.name} className="flex items-center justify-between gap-2 text-[10px] font-medium font-sans">
              <span className="truncate pr-1 text-[#5c544d] dark:text-[#c4b6a8]" title={tool.description}>
                {tool.name}
              </span>
              
              <div className="flex items-center gap-1.5 shrink-0">
                {tool.isGloballyDisabled && (
                  <div title="Locked by system environment rules">
                    <Lock className="w-3 h-3 text-zinc-500" />
                  </div>
                )}
                <button
                  disabled={tool.isGloballyDisabled}
                  onClick={() => handleToggleTool(tool.name, !tool.isEnabled)}
                  className={`w-7 h-4 rounded-full relative transition-colors duration-200 flex items-center cursor-pointer ${
                    tool.isGloballyDisabled 
                      ? 'bg-zinc-300 dark:bg-zinc-850 cursor-not-allowed'
                      : tool.isEnabled
                      ? 'bg-[#a07c5a] dark:bg-[#8c7355]'
                      : 'bg-zinc-300 dark:bg-zinc-800'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full bg-white shadow-sm absolute transform transition-transform duration-200 ${
                    tool.isEnabled ? 'translate-x-3.5 animate-pulse' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Shared System Monitor Content (Desktop/Mobile Drawer)
  const renderSystemMonitorContent = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#e9dcce] dark:border-[#2a2622] pb-3 md:border-b-0 md:pb-0">
        <h3 className={secondaryPanelHeader}>
          <Server className="w-4 h-4 text-[#a07c5a] dark:text-[#8c7355]" /> Active Registry
        </h3>
        <button 
          onClick={() => setMobileMonitorOpen(false)}
          className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-850 rounded-lg lg:hidden text-zinc-500"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      </div>

      <div className="space-y-3">
        <div className={`p-3.5 border rounded-xl space-y-2 ${isLight ? 'bg-[#faf6f0] border-[#e9dcce]' : 'bg-[#141210] border-[#2a2622]'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold flex items-center gap-1.5 font-sans">
              <FolderOpen className="w-3.5 h-3.5 text-[#a07c5a] dark:text-[#8c7355]" /> workspace_file_manager
            </span>
            <span className="text-[9px] border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-500 font-mono">ACTIVE</span>
          </div>
          <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] leading-normal font-sans">
            Natively manages files inside the local project workspace. Supports reading, writing, directory listing, and recursive file contents search.
          </p>
        </div>


        <div className={`p-3.5 border rounded-xl space-y-2 ${isLight ? 'bg-[#faf6f0] border-[#e9dcce]' : 'bg-[#141210] border-[#2a2622]'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold flex items-center gap-1.5 font-sans">
              <Terminal className="w-3.5 h-3.5 text-zinc-500" /> docker_sandbox_executor
            </span>
            <span className="text-[9px] bg-zinc-500/10 border border-zinc-500/20 px-1.5 py-0.5 rounded text-zinc-500 font-mono">SANDBOX</span>
          </div>
          <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] leading-normal font-sans">
            Spawns isolated NodeJS Docker container runtimes on-demand to test untrusted code scripts or execute sandbox commands safely.
          </p>
        </div>
      </div>

      {/* Infrastructure Config Details */}
      <div className={`border rounded-xl p-4 space-y-3 text-[10px] font-mono ${isLight ? 'bg-[#faf6f0] border-[#e9dcce]' : 'bg-[#141210] border-[#2a2622]'}`}>
        <h4 className="text-xs font-bold flex items-center gap-2 font-sans mb-1 uppercase tracking-wide">
          <Database className="w-4 h-4 text-[#a07c5a] dark:text-[#8c7355]" /> Infrastructure
        </h4>
        <div className="flex justify-between border-b border-[#e9dcce]/60 dark:border-zinc-800 pb-1.5">
          <span className="text-[#7c7267] dark:text-zinc-550">Ollama API URL:</span>
          <span>http://localhost:11434</span>
        </div>
        <div className="flex justify-between border-b border-[#e9dcce]/60 dark:border-zinc-800 pb-1.5">
          <span className="text-[#7c7267] dark:text-zinc-550">Model Name:</span>
          <span className="text-[#a07c5a] dark:text-[#d4c3b3]">gemma4</span>
        </div>
        <div className="flex justify-between border-b border-[#e9dcce]/60 dark:border-zinc-800 pb-1.5">
          <span className="text-[#7c7267] dark:text-zinc-550">Database Engine:</span>
          <span>SQLite (dev.db)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#7c7267] dark:text-zinc-550">Docker Sandbox:</span>
          <span>node:20-alpine</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${outerBg}`}>
      
      {/* Top Header */}
      <header className={`h-16 sticky top-0 z-40 px-4 md:px-6 flex items-center justify-between shrink-0 ${headerBg}`}>
        <div className="flex items-center gap-3">
          {/* Mobile hamburger menu toggle */}
          <button 
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl md:hidden text-zinc-550"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${
            isLight ? 'bg-[#a07c5a] text-white' : 'bg-[#8c7355] text-white'
          }`}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-tight flex items-center gap-1.5">
              Jarvis Assistant <span className={`text-[9px] py-0.5 px-1.5 border rounded-md font-mono ${
                isLight ? 'bg-zinc-205 border-zinc-300 text-zinc-600' : 'bg-zinc-850 border-zinc-800 text-[#a89e95]'
              }`}>v2.6</span>
            </h1>
            <p className="text-[8px] md:text-[9px] text-[#7c7267] dark:text-[#a89e95] font-mono -mt-0.5 uppercase tracking-wider">Configuration-Driven Hybrid Routing</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Queue Pending Indicator */}
          {messageQueue.length > 0 && (
            <div className="px-2.5 py-1 text-[9px] font-bold rounded-lg bg-[#a07c5a]/20 text-[#a07c5a] dark:text-[#d4c3b3] border border-[#a07c5a]/30 animate-pulse font-mono shrink-0">
              QUEUE: {messageQueue.length} PENDING
            </div>
          )}

          <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-mono tracking-wide ${
            isLight ? 'bg-[#f4ebe1] border-[#e9dcce]' : 'bg-[#1d1a17] border-[#2a2622]'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-550'}`}></span>
            <span className="text-[#7c7267] dark:text-[#a89e95]">
              {isWsConnected ? 'STREAM' : 'OFFLINE'}
            </span>
          </div>

          <div className={`flex items-center p-1 rounded-xl border ${
            isLight ? 'bg-[#f4ebe1] border-[#e9dcce]' : 'bg-[#1d1a17] border-[#2a2622]'
          }`}>
            <button
              onClick={() => { setIsAutoTheme(false); setTheme('light'); }}
              className={`p-1 rounded-lg cursor-pointer ${isLight && !isAutoTheme ? 'bg-[#faf6f0] text-[#a07c5a] shadow-sm' : 'text-zinc-400 hover:text-zinc-550'}`}
              title="Cozy Light Mode"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setIsAutoTheme(false); setTheme('dark'); }}
              className={`p-1 rounded-lg cursor-pointer ${!isLight && !isAutoTheme ? 'bg-[#202023] text-[#d4c3b3] shadow-sm' : 'text-zinc-450 hover:text-zinc-300'}`}
              title="Cozy Dark Mode"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsAutoTheme(true)}
              className={`p-1.5 text-[9px] font-mono font-bold uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer ${
                isAutoTheme ? 'bg-[#a07c5a]/10 border border-[#a07c5a]/20 text-[#a07c5a] dark:text-[#d4c3b3]' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Time-Based Automations"
            >
              <Clock className="w-3.5 h-3.5" />
              Auto
            </button>
          </div>

          {/* Mobile Monitor Toggle */}
          <button
            onClick={() => setMobileMonitorOpen(true)}
            className={`p-2 rounded-xl border lg:hidden ${
              isLight 
                ? 'bg-[#f4ebe1] border-[#e9dcce] text-zinc-700' 
                : 'bg-[#1d1a17] border-[#2a2622] text-zinc-300'
            }`}
          >
            <Server className="w-4 h-4" />
          </button>

          {/* Settings Trigger */}
          <button
            onClick={() => setShowSettingsModal(!showSettingsModal)}
            className={`p-2 rounded-xl border ${
              isLight 
                ? 'bg-[#f4ebe1] border-[#e9dcce] hover:bg-[#eadecc]/40 text-zinc-750' 
                : 'bg-[#1d1a17] border-[#2a2622] hover:bg-zinc-800 text-zinc-300'
            } transition-all`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container locked to calculation viewport */}
      <div className="flex-1 flex overflow-hidden h-[calc(100vh-4rem)] relative w-full">
        
        {/* Desktop Left Sidebar */}
        <aside className={`hidden md:flex w-64 flex-col shrink-0 h-full overflow-hidden ${sidebarBg}`}>
          {renderSidebarContent()}
        </aside>

        {/* Mobile Left Sidebar Drawer */}
        {mobileSidebarOpen && (
          <div 
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col transform ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:hidden h-full ${sidebarBg}`}>
          {renderSidebarContent()}
        </aside>

        {/* Separated Scrollable Chat component with voice extensions */}
        <ChatArea
          messages={messages}
          activeTool={activeTool}
          inputText={inputText}
          setInputText={setInputText}
          isProcessing={isProcessing}
          onSendMessage={handleSendMessage}
          selectedSessionId={selectedSessionId}
          sessions={sessions}
          theme={theme}
          backendConfig={backendConfig}
          chatEndRef={chatEndRef}
          approvalRequest={approvalRequest}
          onRespondApproval={handleRespondApproval}
          isListening={isListening}
          onToggleListening={handleToggleListening}
          speakingMessageId={speakingMessageId}
          onSpeak={handleSpeakText}
        />

        {/* Desktop Right Panel */}
        <aside className={`hidden lg:flex w-72 p-6 flex-col overflow-y-auto shrink-0 space-y-6 h-full ${systemSidebarBg}`}>
          {renderSystemMonitorContent()}
        </aside>

        {/* Mobile Right Drawer Backdrop */}
        {mobileMonitorOpen && (
          <div 
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileMonitorOpen(false)}
          />
        )}
        {/* Mobile Right Drawer Sidebar */}
        <aside className={`fixed inset-y-0 right-0 z-50 w-72 p-6 flex flex-col transform ${mobileMonitorOpen ? 'translate-x-0' : 'translate-x-full'} transition-transform duration-300 ease-in-out lg:hidden h-full ${systemSidebarBg} overflow-y-auto`}>
          {renderSystemMonitorContent()}
        </aside>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm rounded-3xl p-6 border shadow-2xl space-y-5 ${
            isLight ? 'bg-[#faf6f0] border-[#e9dcce] text-[#3f3a36]' : 'bg-[#1d1a17] border-[#2a2622] text-[#f2eee9]'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-[#e9dcce] dark:border-[#2a2622]">
              <h3 className="text-xs font-bold uppercase tracking-widest font-mono flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#a07c5a] dark:text-[#8c7355] animate-spin" /> Architectural Matrix
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-zinc-455 hover:text-zinc-300 font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold">LLM Profile Tuning</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                    backendConfig?.LLM_PROFILE === 'LARGE_MODEL' 
                      ? 'bg-[#a07c5a]/10 dark:bg-[#8c7355]/15 text-[#a07c5a] dark:text-[#d4c3b3] border border-[#a07c5a]/25 dark:border-[#8c7355]/30' 
                      : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                  }`}>
                    {backendConfig?.LLM_PROFILE || 'LOADING...'}
                  </span>
                </div>
                <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] leading-normal font-sans">
                  Sets memory window and context compression limits. Large mode supports 20+ turns context history.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold">Intent Tools Layering</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                    backendConfig?.ENABLE_TOOLS_LAYERING 
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-500/20' 
                      : 'bg-red-550/10 text-red-550 border border-red-500/20'
                  }`}>
                    {backendConfig?.ENABLE_TOOLS_LAYERING ? 'ENABLED (ON)' : 'DISABLED (OFF)'}
                  </span>
                </div>
                <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] leading-normal font-sans">
                  Runs intent classifier to only supply tools relative to current prompt clusters, saving LLM attention.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold">Dynamic Self-Improvement</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                    backendConfig?.ENABLE_SELF_IMPROVEMENT 
                      ? 'bg-[#a07c5a]/10 dark:bg-[#8c7355]/15 text-[#a07c5a] dark:text-[#d4c3b3] border border-[#a07c5a]/25 dark:border-[#8c7355]/30' 
                      : 'bg-zinc-500/10 text-zinc-550 border border-zinc-500/20'
                  }`}>
                    {backendConfig?.ENABLE_SELF_IMPROVEMENT ? 'UNLOCKED' : 'LOCKED (OFF)'}
                  </span>
                </div>
                <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] leading-normal font-sans">
                  Exposes the meta-tool handler `generate_and_register_tool` allowing Jarvis to expand its own code features at runtime.
                </p>
              </div>
            </div>

            <div className={`rounded-xl p-3.5 space-y-1.5 text-[9px] font-mono ${isLight ? 'bg-[#f4ebe1]/60' : 'bg-zinc-950/40'}`}>
              <div className="flex justify-between">
                <span>Docker Sandbox status:</span>
                <span className="text-zinc-750 dark:text-zinc-300">Enabled (node:20-alpine)</span>
              </div>
              <div className="flex justify-between">
                <span>Database persistence:</span>
                <span className="text-zinc-750 dark:text-zinc-300">SQLite Dev DB</span>
              </div>
            </div>

            <button
              onClick={() => setShowSettingsModal(false)}
              className={`w-full py-2 text-xs font-semibold rounded-xl text-white cursor-pointer ${
                isLight ? 'bg-zinc-700 hover:bg-zinc-800' : 'bg-zinc-800 hover:bg-zinc-750'
              }`}
            >
              Close settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
