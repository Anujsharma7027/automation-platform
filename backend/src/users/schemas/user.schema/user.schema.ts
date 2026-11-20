import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;
export type AuthProviderName = 'google' | 'email' | 'apple';

@Schema({ _id: false })
export class UserProfile {
  @Prop({ trim: true, maxlength: 100 }) name?: string;
  @Prop({ trim: true, maxlength: 100 }) firstName?: string;
  @Prop({ trim: true, maxlength: 100 }) lastName?: string;
  @Prop({ trim: true, maxlength: 2048 }) avatarUrl?: string;
}
const UserProfileSchema = SchemaFactory.createForClass(UserProfile);

@Schema({ _id: false })
export class UserAuthProvider {
  @Prop({ required: true, enum: ['google', 'email', 'apple'] }) provider!: AuthProviderName;
  @Prop({ required: true, trim: true, maxlength: 255 }) providerId!: string;
}
const UserAuthProviderSchema = SchemaFactory.createForClass(UserAuthProvider);

@Schema({ _id: false })
export class UserAuth {
  @Prop({ enum: ['google', 'email', 'apple'] })
  provider?: AuthProviderName;

  @Prop({ select: false, trim: true, maxlength: 255 })
  googleSub?: string;

  @Prop({ type: [{ type: UserAuthProviderSchema }], default: [] })
  providers!: UserAuthProvider[];
}
const UserAuthSchema = SchemaFactory.createForClass(UserAuth);

@Schema({ _id: false })
export class UserPreferences {
  @Prop({ default: 'system', enum: ['system', 'light', 'dark'] }) theme!: 'system' | 'light' | 'dark';
  @Prop({ default: true }) notificationsEnabled!: boolean;
  @Prop({ trim: true, maxlength: 100 }) timezone?: string;
}
const UserPreferencesSchema = SchemaFactory.createForClass(UserPreferences);

@Schema({ timestamps: true, versionKey: false })
export class User {
  createdAt!: Date;
  updatedAt!: Date;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, maxlength: 320 })
  email!: string;

  @Prop({ default: false, index: true })
  emailVerified!: boolean;

  @Prop({ type: UserProfileSchema, default: () => ({}) })
  profile!: UserProfile;

  @Prop({ type: UserAuthSchema, default: () => ({}) })
  auth!: UserAuth;

  @Prop({ default: 'user', enum: ['user', 'admin'], index: true })
  role!: 'user' | 'admin';

  @Prop({ default: 'active', enum: ['active', 'suspended', 'deactivated'], index: true })
  status!: 'active' | 'suspended' | 'deactivated';

  @Prop({ default: false })
  onboardingCompleted!: boolean;

  @Prop({ type: UserPreferencesSchema, default: () => ({}) })
  preferences!: UserPreferences;

  @Prop()
  lastLoginAt?: Date;

  // Transitional fields retained for existing email/password accounts and old documents.
  @Prop({ trim: true, maxlength: 100 })
  name?: string;

  @Prop({ required: false, select: false })
  passwordHash?: string;

  @Prop({ unique: true, sparse: true, select: false })
  googleSub?: string;

  @Prop({ default: false, index: true })
  isEmailVerified!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index(
  { 'auth.googleSub': 1 },
  { unique: true, sparse: true, name: 'unique_google_subject' },
);
UserSchema.index(
  { 'auth.providers.provider': 1, 'auth.providers.providerId': 1 },
  {
    unique: true,
    name: 'unique_auth_provider_identity',
    partialFilterExpression: { 'auth.providers.provider': { $exists: true }, 'auth.providers.providerId': { $exists: true } },
  },
);
