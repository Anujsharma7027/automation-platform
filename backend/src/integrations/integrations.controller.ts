import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/decorators/current-user/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { AppRegistry } from '../engine/core/app-registry';
import { StepTestDto } from './dto/step-test.dto';
import { interactive } from './http-errors';
import { StepRunner } from './step-runner.service';

/** Integration catalog: what every installed app can do. */
@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly registry: AppRegistry, private readonly runner: StepRunner) {}

  @Get()
  list() {
    return this.registry.catalog();
  }

  @Get(':app')
  get(@Param('app') app: string) {
    return this.registry.catalog().find((item) => item.key === app) ?? this.registry.getApp(app);
  }

  /** Dynamic dropdown choices (calendars, worksheets, labels, folders...). */
  @Post(':app/options/:loader')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  options(@CurrentUser() user: AuthenticatedRequestUser, @Param('app') app: string, @Param('loader') loader: string, @Body() body: StepTestDto) {
    return interactive(() => this.runner.loadOptions(user.userId, app, loader, body.connectionId, body.input ?? {}));
  }

  /** Fetches recent real items for a trigger without starting anything (the builder "Test" tab). */
  @Post(':app/triggers/:trigger/test')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  testTrigger(@CurrentUser() user: AuthenticatedRequestUser, @Param('app') app: string, @Param('trigger') trigger: string, @Body() body: StepTestDto) {
    return interactive(async () => {
      const items = await this.runner.poll(user.userId, { app, operation: trigger, connectionId: body.connectionId, input: body.input });
      const sample = this.registry.getTrigger(app, trigger).trigger.sample;
      return { items: items.slice(0, 3), usedSample: items.length === 0, sample };
    });
  }
}
