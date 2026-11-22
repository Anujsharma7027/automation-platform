import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConnectedAccountDocument = HydratedDocument<ConnectedAccount>;
export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';

@Schema({ timestamps: true, versionKey: false })
export class ConnectedAccount {
  createdAt!: Date;
  updatedAt!: Date;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId!: Types.ObjectId;

  /** OAuth provider id (e.g. `google`). Validated against the provider registry. */
  @Prop({ required: true, trim: true, maxlength: 64 })
  provider!: string;

  @Prop({ required: true, trim: true, maxlength: 255 })
  externalAccountId!: string;

  @Prop({ required: true, lowercase: true, trim: true, maxlength: 320 })
  accountEmail!: string;

  @Prop({ trim: true, maxlength: 200 })
  displayName?: string;

  @Prop({ required: true, select: false })
  encryptedAccessToken!: string;

  @Prop({ required: true, select: false })
  encryptedRefreshToken!: string;

  @Prop({ required: true })
  accessTokenExpiresAt!: Date;

  @Prop({ type: [String], default: [] })
  grantedScopes!: string[];

  @Prop({ required: true, enum: ['CONNECTING', 'CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR'], default: 'CONNECTED', index: true })
  status!: ConnectionStatus;

  @Prop()
  lastValidatedAt?: Date;
}

export const ConnectedAccountSchema = SchemaFactory.createForClass(ConnectedAccount);
ConnectedAccountSchema.index(
  { userId: 1, provider: 1, externalAccountId: 1 },
  { unique: true, name: 'unique_user_provider_account' },
);
ConnectedAccountSchema.index({ userId: 1, provider: 1, status: 1 }, { name: 'user_provider_status' });
ConnectedAccountSchema.index({ userId: 1, provider: 1, updatedAt: -1 }, { name: 'user_provider_recent' });
