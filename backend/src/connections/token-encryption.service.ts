import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class TokenEncryptionService {
  constructor(private readonly config: ConfigService) {}

  encrypt(plaintext: string): string {
    const { id, key } = this.activeKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', id, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  decrypt(envelope: string): string {
    const [version, keyId, encodedIv, encodedTag, encodedCiphertext, ...extra] = envelope.split('.');
    if (version !== 'v1' || !keyId || !encodedIv || !encodedTag || !encodedCiphertext || extra.length) {
      throw new ServiceUnavailableException('Stored OAuth credentials cannot be decrypted');
    }
    const key = this.keyById(keyId);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64url'));
      decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Stored OAuth credentials cannot be decrypted');
    }
  }

  reencrypt(envelope: string): string {
    const [, keyId] = envelope.split('.');
    const active = this.activeKey();
    if (keyId === active.id) return envelope;
    return this.encrypt(this.decrypt(envelope));
  }

  private activeKey(): { id: string; key: Buffer } {
    const id = this.config.get<string>('OAUTH_TOKEN_ENCRYPTION_KEY_ID')?.trim();
    const encodedKey = this.config.get<string>('OAUTH_TOKEN_ENCRYPTION_KEY')?.trim();
    if (!id || !/^[a-zA-Z0-9_-]{1,40}$/.test(id) || !encodedKey) {
      throw new ServiceUnavailableException('OAuth token encryption is not configured');
    }
    return { id, key: decodeKey(encodedKey) };
  }

  private keyById(keyId: string): Buffer {
    const { id, key } = this.activeKey();
    if (id === keyId) return key;
    const encodedPrevious = this.config.get<string>('OAUTH_TOKEN_ENCRYPTION_PREVIOUS_KEYS');
    if (!encodedPrevious) throw new ServiceUnavailableException('Stored OAuth credentials cannot be decrypted');
    try {
      const previous = JSON.parse(encodedPrevious) as Record<string, unknown>;
      const encodedKey = previous[keyId];
      if (typeof encodedKey !== 'string') throw new Error('Missing previous key');
      return decodeKey(encodedKey);
    } catch {
      throw new ServiceUnavailableException('Stored OAuth credentials cannot be decrypted');
    }
  }
}

function decodeKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new ServiceUnavailableException('OAuth token encryption key must decode to 32 bytes');
  return key;
}
