import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { EmailOtp } from './schemas/email-otp.schema/email-otp.schema';
import { RefreshSession } from './schemas/refresh-session.schema/refresh-session.schema';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(
      {} as UsersService,
      {} as MailService,
      {} as JwtService,
      {} as ConfigService,
      {} as Model<EmailOtp>,
      {} as Model<RefreshSession>,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
