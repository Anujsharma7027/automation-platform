import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TRIGGER_POLL_QUEUE, TriggerPollJob } from '../../queue/queue.constants';
import { WorkflowEngine } from '../workflow-engine.service';

@Processor(TRIGGER_POLL_QUEUE, { concurrency: Number(process.env.TRIGGER_POLL_CONCURRENCY ?? 10) })
export class TriggerPollProcessor extends WorkerHost {
  constructor(private readonly engine: WorkflowEngine) {
    super();
  }

  async process(job: Job<TriggerPollJob>): Promise<void> {
    await this.engine.pollWorkflow(job.data.workflowId);
  }
}
