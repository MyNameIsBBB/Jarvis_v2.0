'use client';

import React from 'react';
import { 
  Activity, 
  Send, 
  Sparkles, 
  Code, 
  FolderOpen, 
  Gamepad2, 
  Terminal, 
  User, 
  Compass,
  Link,
  Cpu,
  Lock,
  CheckCircle2,
  FileCode
} from 'lucide-react';

export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string | null;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackendConfig {
  ENABLE_TOOLS_LAYERING: boolean;
  ENABLE_SELF_IMPROVEMENT: boolean;
  LLM_PROFILE: 'SMALL_MODEL' | 'LARGE_MODEL';
  tools?: {
    name: string;
    description: string;
    category: string;
    isGloballyDisabled: boolean;
    isEnabled: boolean;
  }[];
}

interface ChatAreaProps {
  messages: Message[];
  activeTool: { name: string; status: 'running' | 'completed' | 'failed'; result?: string } | null;
  inputText: string;
  setInputText: (text: string) => void;
  isProcessing: boolean;
  onSendMessage: (e: React.FormEvent) => void;
  selectedSessionId: string | null;
  sessions: ChatSession[];
  theme: 'light' | 'dark';
  backendConfig: BackendConfig | null;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  approvalRequest: { waiting: boolean; prompt?: string; variables?: string } | null;
  onRespondApproval: (approved: boolean, notes: string) => Promise<void>;
}

export default function ChatArea({
  messages,
  activeTool,
  inputText,
  setInputText,
  isProcessing,
  onSendMessage,
  selectedSessionId,
  sessions,
  theme,
  backendConfig,
  chatEndRef,
  approvalRequest,
  onRespondApproval
}: ChatAreaProps) {
  
  const isLight = theme === 'light';

  const bubbleUser = isLight 
    ? 'bg-[#eadecc] text-[#3f3a36] border border-[#d6c4ae] rounded-tr-none' 
    : 'bg-[#2d2d30] text-[#f2eee9] border border-zinc-800 rounded-tr-none';
  
  const bubbleAssistant = isLight 
    ? 'bg-[#f4ebe1]/35 border border-[#e9dcce]/50 text-zinc-850 rounded-tl-none shadow-sm' 
    : 'bg-[#1d1a17]/40 border border-[#2a2622] text-[#f2eee9] rounded-tl-none shadow-sm';
  
  const bubbleTool = isLight 
    ? 'bg-[#fdfbf7] border border-[#e9dcce] text-zinc-700 rounded-tl-none border-dashed' 
    : 'bg-[#121214] border border-[#2a2622] text-[#a89e95] rounded-tl-none border-dashed';

  const suggestionCard = isLight
    ? 'p-4 border border-[#e9dcce] bg-[#fdfbf7] hover:border-[#a07c5a] hover:bg-[#eadecc]/20 rounded-2xl text-left transition-all cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.02)]'
    : 'p-4 border border-[#2a2622] bg-[#1d1a17]/40 hover:border-[#8c7355]/25 hover:bg-[#8c7355]/5 rounded-2xl text-left transition-all cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.1)]';

  const submitButton = isLight
    ? 'bg-[#a07c5a] hover:bg-[#8e6b4a] text-white rounded-xl shadow-sm transition-all active:scale-95'
    : 'bg-[#8c7355] hover:bg-[#786146] text-white rounded-xl shadow-[0_2px_10px_rgba(140,115,85,0.15)] transition-all active:scale-95';

  // Custom tool badges descriptor based on running tool intent (Clay/Brown Earth Tones)
  const renderDynamicToolBadge = (tool: { name: string; status: 'running' | 'completed' | 'failed' }) => {
    switch (tool.name) {
      case 'generate_and_register_tool':
        return (
          <div className="flex flex-col gap-1.5 p-4 rounded-2xl border bg-[#a07c5a]/10 dark:bg-[#8c7355]/10 border-[#a07c5a]/20 dark:border-[#8c7355]/20 text-[#a07c5a] dark:text-[#d4c3b3] font-sans shadow-sm animate-pulse">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Code className="w-4 h-4 animate-spin text-[#a07c5a] dark:text-[#d4c3b3]" />
              <span>⚙️ Jarvis is compiling a new dynamic tool...</span>
            </div>
            <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] pl-6 leading-relaxed">
              Writing TypeScript code & running compilation sandbox tests...
            </p>
          </div>
        );
      case 'execute_sandbox_cmd':
        return (
          <div className="flex flex-col gap-1.5 p-4 rounded-2xl border bg-zinc-400/10 dark:bg-zinc-500/10 border-zinc-300 dark:border-zinc-800 text-zinc-750 dark:text-zinc-350 font-sans shadow-sm animate-pulse">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Terminal className="w-4 h-4 animate-pulse text-zinc-500" />
              <span>🧪 Running sandbox console command...</span>
            </div>
            <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] pl-6 leading-relaxed">
              Evaluating safe process runtime environment limits.
            </p>
          </div>
        );
      case 'read_file_secure':
      case 'write_file_secure':
        return (
          <div className="flex items-center gap-2.5 p-3 rounded-2xl border bg-zinc-300/15 dark:bg-zinc-850/20 text-[#7c7267] dark:text-[#d4c3b3] text-xs font-medium shadow-sm">
            <FolderOpen className="w-4 h-4 text-[#a07c5a] dark:text-[#8c7355] animate-pulse" />
            <span>📁 Secure file system agent active...</span>
          </div>
        );
      case 'system_resource_monitor':
        return (
          <div className="flex items-center gap-2.5 p-3 rounded-2xl border bg-[#a07c5a]/10 dark:bg-[#8c7355]/10 border-[#a07c5a]/20 dark:border-[#8c7355]/20 text-[#a07c5a] dark:text-[#d4c3b3] text-xs font-medium shadow-sm">
            <Cpu className="w-4 h-4 text-[#a07c5a] dark:text-[#8c7355] animate-bounce" />
            <span>🖥️ Monitoring system specs & server statuses...</span>
          </div>
        );
      case 'fetch_web_resource':
      case 'web_search_scraper':
        return (
          <div className="flex items-center gap-2.5 p-3 rounded-2xl border bg-zinc-300/15 dark:bg-zinc-800/10 text-zinc-650 dark:text-zinc-350 text-xs font-medium shadow-sm">
            <Link className="w-4 h-4 text-[#a07c5a] dark:text-[#8c7355] animate-pulse" />
            <span>🌐 Scraping target HTML pages...</span>
          </div>
        );
      case 'human_interruption_prompt':
        return (
          <div className="flex items-center gap-2.5 p-3 rounded-2xl border bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-500 text-xs font-medium shadow-sm animate-pulse">
            <Lock className="w-4 h-4 text-amber-500" />
            <span>⚠️ Awaiting human interruption approval input...</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2.5 p-3 rounded-2xl border bg-zinc-300/15 dark:bg-zinc-800/10 text-zinc-650 dark:text-zinc-350 text-xs font-medium shadow-sm">
            <Activity className="w-4 h-4 text-[#a07c5a] dark:text-[#8c7355] animate-ping" />
            <span>⚙️ Launching: "{tool.name}"...</span>
          </div>
        );
    }
  };

  // Basic markdown text styling
  const renderFormattedText = (text: string) => {
    if (!text) return null;
    if (text.startsWith('[Tool Call requested:')) {
      return (
        <span className="italic text-zinc-400 dark:text-zinc-500 font-mono text-[10px] block py-1">
          ⚙️ Jarvis is launching background tool...
        </span>
      );
    }

    const lines = text.split('\n');
    let insideCodeBlock = false;
    let codeBlockContent: string[] = [];

    return lines.map((line, lineIndex) => {
      if (line.trim().startsWith('```')) {
        if (insideCodeBlock) {
          insideCodeBlock = false;
          const code = codeBlockContent.join('\n');
          codeBlockContent = [];
          return (
            <pre key={lineIndex} className="bg-zinc-850 dark:bg-[#121214] border border-[#eadecc] dark:border-[#2a2622] p-4 rounded-xl font-mono text-[11px] text-zinc-350 dark:text-zinc-300 my-2.5 overflow-x-auto max-w-full">
              <code>{code}</code>
            </pre>
          );
        } else {
          insideCodeBlock = true;
          return null;
        }
      }

      if (insideCodeBlock) {
        codeBlockContent.push(line);
        return null;
      }

      const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
      const parsedLine = parts.map((part, partIndex) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={partIndex} className="text-[#a07c5a] dark:text-[#d4c3b3] font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={partIndex} className="bg-[#f4ebe1]/80 dark:bg-zinc-950 border border-[#eadecc] dark:border-zinc-850 px-1.5 py-0.5 rounded text-[11px] font-mono text-[#a07c5a] dark:text-[#d4c3b3]">{part.slice(1, -1)}</code>;
        }
        return part;
      });

      return (
        <p key={lineIndex} className="min-h-[1.2rem] leading-relaxed my-1 font-sans">
          {parsedLine}
        </p>
      );
    });
  };

  return (
    <main className="flex-1 flex flex-col relative overflow-hidden bg-transparent h-full">
      {selectedSessionId && (
        <div className={`px-6 py-3 flex items-center justify-between shrink-0 z-10 ${
          isLight ? 'bg-[#faf6f0]/40 border-b border-[#e9dcce]/60' : 'bg-zinc-950/10 border-b border-[#2a2622]'
        }`}>
          <div>
            <h2 className="font-bold text-xs">
              {sessions.find(s => s.id === selectedSessionId)?.title || 'Current chat'}
            </h2>
            <p className="text-[9px] text-zinc-500 font-mono -mt-0.5">Session ID: {selectedSessionId}</p>
          </div>
        </div>
      )}

      {/* Chat Messages scroll area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6 pb-28">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-4 md:p-8 text-center text-zinc-500 select-none">
            <Compass className="w-10 h-10 text-[#a07c5a] dark:text-[#8c7355] opacity-35 mb-4 stroke-1 animate-pulse" />
            <h3 className="font-bold text-zinc-700 dark:text-zinc-300 mb-1 font-sans">Cozy Jarvis Workspace</h3>
            <p className="text-xs max-w-sm leading-relaxed text-zinc-550 dark:text-[#a89e95] mb-6">
              Hello! How can I assist you today? You can choose one of the suggestions below to explore my integration tools:
            </p>

            {/* Suggestions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl w-full">
              <div 
                onClick={() => setInputText("Tell me about the gemma4 LLM capabilities")}
                className={suggestionCard}
              >
                <p className="text-xs font-bold flex items-center gap-1.5 text-[#a07c5a] dark:text-[#d4c3b3]">
                  <Sparkles className="w-3.5 h-3.5" /> General Chat
                </p>
                <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] mt-1.5 leading-normal font-sans">"Tell me about the gemma4 LLM capabilities"</p>
              </div>
              <div 
                onClick={() => setInputText("Check the status of my Minecraft Server")}
                className={suggestionCard}
              >
                <p className="text-xs font-bold flex items-center gap-1.5 text-[#a07c5a] dark:text-[#d4c3b3]">
                  <Gamepad2 className="w-3.5 h-3.5" /> Game Server Control
                </p>
                <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] mt-1.5 leading-normal font-sans">"Check status of Minecraft server"</p>
              </div>
              <div 
                onClick={() => setInputText("Create a weather_helper tool that fetches temp")}
                className={suggestionCard}
              >
                <p className="text-xs font-bold flex items-center gap-1.5 text-[#a07c5a] dark:text-[#d4c3b3]">
                  <Code className="w-3.5 h-3.5" /> Self-Improvement
                </p>
                <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] mt-1.5 leading-normal font-sans">"Create a weather_helper tool that fetches temp"</p>
              </div>
              <div 
                onClick={() => setInputText("Search workspace directory for index files")}
                className={suggestionCard}
              >
                <p className="text-xs font-bold flex items-center gap-1.5 text-[#a07c5a] dark:text-[#d4c3b3]">
                  <FolderOpen className="w-3.5 h-3.5" /> Workspace Manager
                </p>
                <p className="text-[10px] text-[#7c7267] dark:text-[#a89e95] mt-1.5 leading-normal font-sans">"Search workspace directory for index files"</p>
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            if (msg.role === 'system') return null;

            const isUser = msg.role === 'user';
            const isTool = msg.role === 'tool';

            return (
              <div
                key={msg.id || index}
                className={`flex items-start gap-3 md:gap-4 max-w-[95%] md:max-w-[85%] ${
                  isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Icon */}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${
                  isUser 
                    ? 'bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-500 dark:text-zinc-300' 
                    : isTool 
                    ? 'bg-zinc-200/50 dark:bg-zinc-950 border-zinc-350 dark:border-zinc-850 text-zinc-500'
                    : isLight
                    ? 'bg-[#a07c5a] text-white border-[#8e6b4a]'
                    : 'bg-[#8c7355] border-[#786146] text-white'
                }`}>
                  {isUser ? <User className="w-4 h-4" /> : isTool ? <Code className="w-3.5 h-3.5" /> : <Sparkles className="w-4 h-4" />}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-1 w-full font-sans">
                  <div className={`text-[9px] font-mono text-zinc-400 dark:text-[#a89e95] uppercase tracking-widest px-1 ${
                    isUser ? 'text-right' : 'text-left'
                  }`}>
                    {isUser ? 'You' : isTool ? `Background Tool output // ${msg.name}` : 'Jarvis'}
                  </div>

                  {/* Bubble */}
                  <div className={`p-4 rounded-2xl text-xs leading-relaxed transition-all ${
                    isUser ? bubbleUser : isTool ? bubbleTool : bubbleAssistant
                  }`}>
                    {isTool ? (
                      <pre className="whitespace-pre-wrap leading-5 text-[10px]">
                        {(() => {
                          try {
                            const parsedTool = JSON.parse(msg.content);
                            if (parsedTool.success !== undefined) {
                              return (
                                <>
                                  {parsedTool.success ? (
                                    <span className="text-emerald-650 dark:text-emerald-500 font-bold flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Success
                                    </span>
                                  ) : (
                                    <span className="text-red-500 font-bold">✖ Failed</span>
                                  )}
                                  {parsedTool.message && <div className="text-zinc-650 dark:text-[#a89e95] mt-1">{parsedTool.message}</div>}
                                  {parsedTool.content && <div className="text-zinc-650 dark:text-[#a89e95] mt-1 bg-zinc-100 dark:bg-zinc-950 p-2.5 rounded border border-[#eadecc] dark:border-zinc-850 font-mono whitespace-pre-wrap">{parsedTool.content}</div>}
                                  {parsedTool.schema && (
                                    <div className="mt-2 bg-zinc-100 dark:bg-zinc-950 p-2.5 rounded border border-[#eadecc] dark:border-zinc-850 font-mono text-[9px] text-zinc-550 dark:text-zinc-400">
                                      <div className="font-bold flex items-center gap-1 mb-1 text-[#a07c5a] dark:text-[#d4c3b3]">
                                        <FileCode className="w-3.5 h-3.5" /> schema.prisma Schema Definition:
                                      </div>
                                      {parsedTool.schema}
                                    </div>
                                  )}
                                  {parsedTool.testLogs && (
                                    <div className="mt-2">
                                      <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Sandbox Compile/Verification Output:</div>
                                      <div className="bg-zinc-100 dark:bg-zinc-950 text-zinc-650 dark:text-[#a89e95] p-2.5 rounded border border-[#eadecc] dark:border-zinc-850 text-[9px] font-mono whitespace-pre-wrap">
                                        {parsedTool.testLogs}
                                      </div>
                                    </div>
                                  )}
                                  {parsedTool.error && <div className="text-red-450 mt-1">{parsedTool.error}</div>}
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
                      renderFormattedText(msg.content)
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Dynamic tool status */}
        {activeTool && (
          <div className="flex items-center gap-4 max-w-[80%] mr-auto">
            <div className="w-8 h-8 rounded-xl bg-[#a07c5a]/10 dark:bg-[#8c7355]/10 border border-[#a07c5a]/20 dark:border-[#8c7355]/20 text-[#a07c5a] dark:text-[#d4c3b3] flex items-center justify-center animate-pulse">
              <Activity className="w-4 h-4" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono text-zinc-550 uppercase tracking-widest">Runtime Process</span>
              {renderDynamicToolBadge(activeTool)}
            </div>
          </div>
        )}

        {/* Human Authorization Prompt Overlay */}
        {approvalRequest?.waiting && (
          <div className={`p-5 rounded-2xl border shadow-md space-y-4 max-w-[90%] md:max-w-[75%] mr-auto ${
            isLight 
              ? 'bg-[#faf6f0] border-[#a07c5a]/45 text-[#3f3a36]' 
              : 'bg-[#1d1a17] border-[#8c7355]/45 text-[#f2eee9]'
          }`}>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-500">
              <span className="animate-pulse w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
              <span>⚠️ Action Authorization Required</span>
            </div>
            
            <p className="text-xs font-medium leading-relaxed">
              {approvalRequest.prompt}
            </p>

            {approvalRequest.variables && (
              <div className="space-y-1">
                <span className="text-[9px] font-mono text-zinc-550 uppercase tracking-wider">State Variables:</span>
                <pre className={`p-3 rounded-xl border text-[10px] font-mono overflow-x-auto max-h-40 ${
                  isLight ? 'bg-[#f4ebe1]/50 border-[#e9dcce]' : 'bg-zinc-950/40 border-[#2a2622]'
                }`}>
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(approvalRequest.variables), null, 2);
                    } catch (e) {
                      return approvalRequest.variables;
                    }
                  })()}
                </pre>
              </div>
            )}

            <div className="space-y-2">
              <span className="text-[9px] font-mono text-zinc-550 uppercase tracking-wider">Verification Notes (Optional):</span>
              <input
                type="text"
                placeholder="E.g., verified Minecraft backup path, check log parameters..."
                id="approval-notes-input"
                className={`w-full focus:outline-none rounded-xl px-3.5 py-2 text-xs border ${
                  isLight 
                    ? 'bg-[#fdfbf7] border-[#e9dcce] focus:border-[#a07c5a] text-[#3f3a36]' 
                    : 'bg-zinc-900 border-zinc-800 focus:border-[#8c7355] text-[#f2eee9]'
                }`}
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={async () => {
                  const inputEl = document.getElementById('approval-notes-input') as HTMLInputElement;
                  const notes = inputEl ? inputEl.value : '';
                  await onRespondApproval(true, notes);
                }}
                className={`px-4 py-2 text-xs font-bold text-white rounded-xl cursor-pointer ${submitButton}`}
              >
                Approve & Execute
              </button>
              <button
                onClick={async () => {
                  const inputEl = document.getElementById('approval-notes-input') as HTMLInputElement;
                  const notes = inputEl ? inputEl.value : '';
                  await onRespondApproval(false, notes);
                }}
                className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                  isLight 
                    ? 'border-[#e9dcce] hover:bg-[#eadecc]/20 text-[#3f3a36]' 
                    : 'border-[#2a2622] hover:bg-zinc-800 text-[#f2eee9]'
                }`}
              >
                Deny request
              </button>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Panel absolute bottom */}
      <div className={`absolute bottom-0 left-0 right-0 p-4 border-t pb-safe z-25 ${
        isLight ? 'border-[#e9dcce] bg-[#faf6f0]' : 'border-[#2a2622] bg-[#141210]'
      }`}>
        <form onSubmit={onSendMessage} className="max-w-4xl mx-auto flex items-center gap-3 relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isProcessing ? "Jarvis is processing..." : "Ask Jarvis to run commands, check server status, or create new functions..."}
            disabled={isProcessing}
            className={`focus:outline-none rounded-2xl px-5 py-3.5 text-xs pr-14 transition-colors border w-full ${
              isLight 
                ? 'bg-[#fdfbf7] border-[#e9dcce] focus:border-[#a07c5a] text-[#3f3a36] placeholder-[#7c7267]' 
                : 'bg-zinc-900 border-zinc-800/80 focus:border-[#8c7355] text-[#f2eee9] placeholder-[#a89e95]'
            }`}
            required
          />
          <button
            type="submit"
            disabled={isProcessing || !inputText.trim()}
            className={`absolute right-2.5 p-2 ${submitButton} disabled:opacity-30 disabled:hover:scale-100`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="text-center text-[9px] text-[#7c7267] dark:text-[#a89e95] mt-2.5 font-mono uppercase tracking-wider flex items-center justify-center gap-3">
          <span>Local inference: Ollama (gemma4)</span>
          {backendConfig && (
            <>
              <span>•</span>
              <span className={backendConfig.LLM_PROFILE === 'LARGE_MODEL' ? 'text-[#a07c5a] dark:text-[#d4c3b3] font-semibold' : 'text-zinc-550'}>
                Profile: {backendConfig.LLM_PROFILE}
              </span>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
