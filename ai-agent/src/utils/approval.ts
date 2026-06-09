export interface ApprovalRequest {
  resolve: (value: string) => void;
  reject: (err: any) => void;
  prompt: string;
  variables: string;
}

export const waitingApprovals = new Map<string, ApprovalRequest>();
