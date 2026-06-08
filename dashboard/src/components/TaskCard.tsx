import React from 'react';
import { 
  Play, 
  CheckCircle, 
  PauseCircle, 
  HelpCircle, 
  Circle,
  MessageSquare,
  Cpu
} from 'lucide-react';

export interface Task {
  id: string;
  title: string;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'AWAITING_HUMAN';
  createdAt: string;
  updatedAt: string;
  graphState: {
    messages: { role: string; content: string; name?: string }[];
    variables: Record<string, any>;
    tokenLogs?: { promptTokens: number; completionTokens: number; totalTokens: number; timestamp: string }[];
  };
}

interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, isSelected, onClick }) => {
  const getStatusDetails = (status: Task['status']) => {
    switch (status) {
      case 'RUNNING':
        return {
          icon: <Play className="w-4 h-4 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />,
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]',
          containerClass: 'border-emerald-500/20 hover:border-emerald-500/40',
        };
      case 'AWAITING_HUMAN':
        return {
          icon: <HelpCircle className="w-4 h-4 text-amber-400 animate-pulse" />,
          badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.15)]',
          containerClass: 'border-amber-500/30 hover:border-amber-500/50',
        };
      case 'PAUSED':
        return {
          icon: <PauseCircle className="w-4 h-4 text-zinc-400" />,
          badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
          containerClass: 'border-zinc-800 hover:border-zinc-700',
        };
      case 'COMPLETED':
        return {
          icon: <CheckCircle className="w-4 h-4 text-sky-400" />,
          badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
          containerClass: 'border-sky-500/20 hover:border-sky-500/40',
        };
      default:
        return {
          icon: <Circle className="w-4 h-4 text-violet-400" />,
          badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
          containerClass: 'border-zinc-800 hover:border-violet-500/20',
        };
    }
  };

  const details = getStatusDetails(task.status);
  const formattedDate = new Date(task.createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const totalTokens = task.graphState.tokenLogs?.reduce((sum, log) => sum + (log.totalTokens || 0), 0) || 0;

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border text-left cursor-pointer transition-all duration-300 select-none bg-zinc-950/60 backdrop-blur-md ${
        isSelected
          ? 'bg-zinc-900/90 border-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.15)]'
          : `${details.containerClass} text-zinc-300`
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h4 className="font-semibold text-sm line-clamp-2 text-zinc-100 group-hover:text-white transition-colors">
          {task.title}
        </h4>
        <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${details.badgeClass}`}>
          {details.icon}
          {task.status.replace('_', ' ')}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{formattedDate}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-zinc-400">
            <MessageSquare className="w-3.5 h-3.5" />
            {task.graphState.messages.length}
          </span>
          {totalTokens > 0 && (
            <span className="flex items-center gap-1 text-violet-400">
              <Cpu className="w-3.5 h-3.5" />
              {totalTokens}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
