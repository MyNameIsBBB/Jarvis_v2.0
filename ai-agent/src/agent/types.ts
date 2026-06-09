export interface ChatMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  createdAt?: Date;
}

export interface ToolCall {
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

export interface OllamaChatResponse {
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: ToolCall[];
  };
  done: boolean;
}
