import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { TRIGGER_POLL_QUEUE, TriggerPollJob } from '../queue/queue.constants';
import { runsWorkers } from './process-role';
import { Workflow } from './schemas/workflow.schema';

/** Owns the BullMQ job scheduler (repeatable poll) of every active workflow. */
@Injectable()
export class TriggerScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(TriggerScheduler.name);

  constructor(
    @InjectQueue(TRIGGER_POLL_QUEUE) private readonly queue: Queue<TriggerPollJob>,
    @InjectModel(Workflow.name) private readonly workflows: Model<Workflow>,
  ) {}

  async schedule(workflow: { id: string; pollIntervalSeconds: number }) {
    await this.queue.upsertJobScheduler(
      schedulerId(workflow.id),
      { every: workflow.pollIntervalSeconds * 1000 },
      { name: 'poll', data: { workflowId: workflow.id } },
    );
  }

  async unschedule(workflowId: string) {
    await this.queue.removeJobScheduler(schedulerId(workflowId));
  }

  /** Immediate poll (used on activation to record existing items right away). */
  async pollNow(workflowId: string) {
    await this.queue.add('poll', { workflowId }, { jobId: `poll-now-${workflowId}-${Date.now()}` });
  }

  /** Re-creates schedulers after a Redis flush or deploy, so Mongo stays the source of truth. */
  async onApplicationBootstrap() {
    if (!runsWorkers() || process.env.SCHEDULER_RECONCILE === 'false') return;
    try {
      let count = 0;
      for await (const workflow of this.workflows.find({ status: 'active' }).select('_id pollIntervalSeconds').cursor()) {
        await this.schedule({ id: workflow.id as string, pollIntervalSeconds: workflow.pollIntervalSeconds });
        count += 1;
      }
      this.logger.log(`Reconciled ${count} active workflow schedule(s)`);
    } catch (error) {
      this.logger.error(`Schedule reconciliation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}

function schedulerId(workflowId: string) {
  return `workflow-${workflowId}`;
}
