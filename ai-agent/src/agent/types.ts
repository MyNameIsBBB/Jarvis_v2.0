export type TaskStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'AWAITING_HUMAN';

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface GraphState {
  messages: AgentMessage[];
  variables: Record<string, any>;
  tokenLogs?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    timestamp: string;
  }[];
}

export type ToolType = 'executeFileSystem' | 'executeDockerSandbox' | 'await_human' | 'complete_task';

export interface AgentLLMResponse {
  thought: string;
  plan: string;
  tool_to_use: ToolType;
  tool_args: Record<string, any>;
}

export interface FileSystemArgs {
  action: 'read' | 'write' | 'list';
  path: string;
  content?: string;
}

export interface DockerSandboxArgs {
  command: string;
}

export interface AwaitHumanArgs {
  prompt: string;
}
