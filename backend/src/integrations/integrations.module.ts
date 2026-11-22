import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { IntegrationsController } from './integrations.controller';
import { StepRunner } from './step-runner.service';

@Module({
  imports: [ConnectionsModule],
  controllers: [IntegrationsController],
  providers: [StepRunner],
  exports: [StepRunner],
})
export class IntegrationsModule {}
