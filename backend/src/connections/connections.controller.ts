import {
  Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/decorators/current-user/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { ConnectionsService } from './connections.service';
import { BeginConnectDto } from './dto/begin-connect.dto';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import { ListConnectionsDto } from './dto/list-connections.dto';

const PROVIDER_PARAM = /^[a-z0-9_-]{1,64}$/;

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  /** Starts OAuth. `POST /connections/google/connect { apps: ["gmail","google_sheets"] }`. */
  @Post(':provider/connect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  beginConnect(@CurrentUser() user: AuthenticatedRequestUser, @Param('provider') provider: string, @Body() body: BeginConnectDto) {
    return this.connections.beginConnect(user.userId, PROVIDER_PARAM.test(provider) ? provider : '', body?.apps);
  }

  /** OAuth redirect target. Also serves the legacy `/connections/gmail/callback` URL. */
  @Get(':provider/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async oauthCallback(@Param('provider') provider: string, @Query() query: OAuthCallbackDto, @Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      return response.redirect(302, await this.connections.handleCallback(provider, query));
    } catch {
      return response.status(503).send('Authorization could not be completed. Return to Taskvyn and try again.');
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: ListConnectionsDto) {
    return this.connections.list(user.userId, query);
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
