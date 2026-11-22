import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConnectionsModule } from '../connections/connections.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { QueueModule } from '../queue/queue.module';
import { TriggerPollProcessor } from './processors/trigger-poll.processor';
import { WorkflowRunProcessor } from './processors/workflow-run.processor';
import { runsWorkers } from './process-role';
import { WorkflowRun, WorkflowRunSchema } from './schemas/workflow-run.schema';
import { Workflow, WorkflowSchema } from './schemas/workflow.schema';
import { TriggerScheduler } from './trigger-scheduler.service';
import { WorkflowEngine } from './workflow-engine.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowRun.name, schema: WorkflowRunSchema },
    ]),
    QueueModule,
    ConnectionsModule,
    IntegrationsModule,
  ],
  controllers: [WorkflowsController],
  providers: [
    TriggerScheduler,
    WorkflowEngine,
    WorkflowsService,
    // Workers only run where PROCESS_ROLE allows (all | worker).
    ...(runsWorkers() ? [TriggerPollProcessor, WorkflowRunProcessor] : []),
  ],
})
export class WorkflowsModule {}
