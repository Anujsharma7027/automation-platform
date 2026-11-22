import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OAuthStateDocument = HydratedDocument<OAuthState>;

@Schema({ timestamps: true, versionKey: false })
export class OAuthState {
  @Prop({ required: true, unique: true, select: false })
  stateHash!: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User', index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 64 })
  provider!: string;

  /** Apps the user is connecting; their scopes must be granted on callback. */
  @Prop({ type: [String], default: [] })
  apps!: string[];

  @Prop({ required: true, index: true })
  expiresAt!: Date;
}

export const OAuthStateSchema = SchemaFactory.createForClass(OAuthState);
OAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'oauth_state_ttl' });
