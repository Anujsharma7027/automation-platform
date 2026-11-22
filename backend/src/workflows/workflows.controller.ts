import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/decorators/current-user/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { CreateWorkflowDto, ListRunsDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.workflows.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: CreateWorkflowDto) {
    return this.workflows.create(user.userId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.workflows.get(user.userId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.workflows.remove(user.userId, id);
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.workflows.activate(user.userId, id);
  }

  @Post(':id/pause')
  @HttpCode(200)
  pause(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.workflows.pause(user.userId, id);
  }

  /** Runs the actions once using the latest real trigger item. */
  @Post(':id/run')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  runNow(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.workflows.runNow(user.userId, id);
  }

  @Get(':id/runs')
  runs(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Query() query: ListRunsDto) {
    return this.workflows.listRuns(user.userId, id, query.limit);
  }

  @Get(':id/runs/:runId')
  run(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Param('runId') runId: string) {
    return this.workflows.getRun(user.userId, id, runId);
  }
}
