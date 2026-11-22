import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TRIGGER_POLL_QUEUE, WORKFLOW_RUN_QUEUE } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // redis:// or rediss:// (TLS). maxRetriesPerRequest must be null for BullMQ workers.
        connection: { url: config.get<string>('REDIS_URL')?.trim() || 'redis://127.0.0.1:6379', maxRetriesPerRequest: null },
        prefix: config.get<string>('BULLMQ_PREFIX')?.trim() || 'taskvyn',
      }),
    }),
    BullModule.registerQueue(
      {
        name: TRIGGER_POLL_QUEUE,
        defaultJobOptions: { removeOnComplete: { count: 200 }, removeOnFail: { count: 1000 }, attempts: 1 },
      },
      {
        name: WORKFLOW_RUN_QUEUE,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 15_000 },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
