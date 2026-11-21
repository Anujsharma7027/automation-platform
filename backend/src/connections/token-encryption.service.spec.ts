import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from './token-encryption.service';

describe('TokenEncryptionService', () => {
  const firstKey = Buffer.alloc(32, 7).toString('base64');
  const secondKey = Buffer.alloc(32, 9).toString('base64');

  const config = (values: Record<string, string>) => ({
    get: (name: string) => values[name],
  }) as unknown as ConfigService;

  it('encrypts and decrypts credentials using authenticated AES-GCM envelopes', () => {
    const encryption = new TokenEncryptionService(config({
      OAUTH_TOKEN_ENCRYPTION_KEY_ID: 'key-1', OAUTH_TOKEN_ENCRYPTION_KEY: firstKey,
    }));
    const encrypted = encryption.encrypt('refresh-token-fixture');
    expect(encrypted).toMatch(/^v1\.key-1\./);
    expect(encrypted).not.toContain('refresh-token-fixture');
    expect(encryption.decrypt(encrypted)).toBe('refresh-token-fixture');
  });

  it('can decrypt a previous key during a staged key rotation', () => {
    const oldEncryption = new TokenEncryptionService(config({
      OAUTH_TOKEN_ENCRYPTION_KEY_ID: 'old-key', OAUTH_TOKEN_ENCRYPTION_KEY: firstKey,
    }));
    const encrypted = oldEncryption.encrypt('access-token-fixture');
    const rotatedEncryption = new TokenEncryptionService(config({
      OAUTH_TOKEN_ENCRYPTION_KEY_ID: 'new-key',
      OAUTH_TOKEN_ENCRYPTION_KEY: secondKey,
      OAUTH_TOKEN_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({ 'old-key': firstKey }),
    }));
    expect(rotatedEncryption.decrypt(encrypted)).toBe('access-token-fixture');
    const reencrypted = rotatedEncryption.reencrypt(encrypted);
    expect(reencrypted).toMatch(/^v1\.new-key\./);
    expect(rotatedEncryption.decrypt(reencrypted)).toBe('access-token-fixture');
  });

  it('rejects tampered credentials and missing encryption configuration', () => {
    const configured = new TokenEncryptionService(config({
      OAUTH_TOKEN_ENCRYPTION_KEY_ID: 'key-1', OAUTH_TOKEN_ENCRYPTION_KEY: firstKey,
    }));
    const encrypted = configured.encrypt('secret-fixture');
    const parts = encrypted.split('.');
    parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`;
    expect(() => configured.decrypt(parts.join('.'))).toThrow('Stored OAuth credentials cannot be decrypted');
    const missing = new TokenEncryptionService(config({}));
    expect(() => missing.encrypt('secret-fixture')).toThrow('OAuth token encryption is not configured');
  });
});
