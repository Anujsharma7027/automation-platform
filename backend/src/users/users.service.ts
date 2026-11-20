import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthProviderName, User, UserDocument, UserProfile } from './schemas/user.schema/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  async findByEmail(email: string, includePassword = false): Promise<UserDocument | null> {
    const query = this.users.findOne({ email: normalizeEmail(email) });
    if (includePassword) query.select('+passwordHash');
    query.select('+googleSub');
    return query.exec() as Promise<UserDocument | null>;
  }

  async findByGoogleSub(googleSub: string): Promise<UserDocument | null> {
    return this.users.findOne({
      $or: [
        { 'auth.googleSub': googleSub },
        { 'auth.providers': { $elemMatch: { provider: 'google', providerId: googleSub } } },
        { googleSub },
      ],
    }).select('+googleSub').exec() as Promise<UserDocument | null>;
  }

  async findById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.users.findById(id).exec() as Promise<UserDocument | null>;
  }

  async create(input: {
    name?: string; email: string; passwordHash?: string; googleSub?: string; isEmailVerified?: boolean;
    emailVerified?: boolean; profile?: Partial<UserProfile>; provider?: AuthProviderName; lastLoginAt?: Date;
  }): Promise<UserDocument> {
    const provider = input.provider ?? (input.googleSub ? 'google' : input.passwordHash ? 'email' : undefined);
    const providerId = input.googleSub ?? (provider === 'email' ? normalizeEmail(input.email) : undefined);
    const profile = { ...input.profile, ...(input.name ? { name: input.name.trim() } : {}) };
    return new this.users({
      ...input,
      email: normalizeEmail(input.email),
      profile,
      auth: {
        ...(provider ? { provider } : {}),
        ...(input.googleSub ? { googleSub: input.googleSub } : {}),
        providers: provider && providerId ? [{ provider, providerId }] : [],
      },
      emailVerified: input.emailVerified ?? input.isEmailVerified ?? false,
      isEmailVerified: input.isEmailVerified ?? input.emailVerified ?? false,
    }).save() as Promise<UserDocument>;
  }

  async updateGoogleSignIn(id: string, googleSub: string, profile: Partial<UserProfile>): Promise<UserDocument | null> {
    const set: Record<string, string | Date | boolean> = { lastLoginAt: new Date(), emailVerified: true, isEmailVerified: true };
    for (const [key, value] of Object.entries(profile)) {
      if (typeof value === 'string' && value.trim()) set[`profile.${key}`] = value.trim();
    }
    return this.users.findOneAndUpdate(
      { _id: id },
      {
        $set: { ...set, 'auth.provider': 'google', 'auth.googleSub': googleSub },
        $addToSet: { 'auth.providers': { provider: 'google', providerId: googleSub } },
      },
      { new: true, runValidators: true },
    ).select('+googleSub').exec() as Promise<UserDocument | null>;
  }

  async markVerified(id: string): Promise<void> {
    const user = await this.users.findByIdAndUpdate(id, { isEmailVerified: true, emailVerified: true }, { new: true }).exec();
    if (!user) throw new NotFoundException('Account not found');
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.users.updateOne({ _id: id }, { passwordHash }).exec();
  }

  async profile(id: string) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Account not found');
    return {
      id: user.id, name: user.profile?.name ?? user.name, email: user.email,
      isEmailVerified: user.emailVerified ?? user.isEmailVerified, createdAt: user.createdAt,
    };
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
