export const TRIGGER_POLL_QUEUE = 'trigger-poll';
export const WORKFLOW_RUN_QUEUE = 'workflow-runs';

export interface TriggerPollJob { workflowId: string }
export interface WorkflowRunJob { runId: string }
