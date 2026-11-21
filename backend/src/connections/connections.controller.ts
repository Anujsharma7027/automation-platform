import {
  Controller, Delete, Get, HttpCode, Param, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/decorators/current-user/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { ConnectionsService } from './connections.service';
import { GmailCallbackDto } from './dto/gmail-callback.dto';
import { ListConnectionsDto } from './dto/list-connections.dto';

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Post('gmail/connect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  beginGmailConnect(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.connections.beginGmailConnect(user.userId);
  }

  @Get('gmail/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async gmailCallback(@Query() query: GmailCallbackDto, @Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      return response.redirect(302, await this.connections.handleGmailCallback(query));
    } catch {
      return response.status(503).send('Gmail authorization could not be completed. Return to Taskvyn and try again.');
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: ListConnectionsDto) {
    return this.connections.list(user.userId, query.provider);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  get(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.connections.get(user.userId, id);
  }

  @Post(':id/refresh')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  refresh(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.connections.refresh(user.userId, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  disconnect(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.connections.disconnect(user.userId, id);
  }
}
