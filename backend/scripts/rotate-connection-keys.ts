import 'reflect-metadata';
import mongoose from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { ConnectedAccount, ConnectedAccountSchema } from '../src/connections/schemas/connected-account.schema';
import { TokenEncryptionService } from '../src/connections/token-encryption.service';

async function main() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is required to rotate OAuth keys');
  const connection = await mongoose.createConnection(uri).asPromise();
  let rotated = 0;
  try {
    const accounts = connection.model(ConnectedAccount.name, ConnectedAccountSchema);
    const encryption = new TokenEncryptionService({
      get: (key: string) => process.env[key],
    } as unknown as ConfigService);
    const cursor = accounts.find().select('+encryptedAccessToken +encryptedRefreshToken').cursor();
    for await (const account of cursor) {
      const accessToken = encryption.reencrypt(account.encryptedAccessToken);
      const refreshToken = encryption.reencrypt(account.encryptedRefreshToken);
      if (accessToken === account.encryptedAccessToken && refreshToken === account.encryptedRefreshToken) continue;
      await accounts.updateOne(
        { _id: account._id },
        { $set: { encryptedAccessToken: accessToken, encryptedRefreshToken: refreshToken } },
      ).exec();
      rotated += 1;
    }
  } finally {
    await connection.close();
  }
  process.stdout.write(`Re-encrypted credentials for ${rotated} connections.\n`);
}

main().catch(() => {
  process.stderr.write('OAuth key rotation failed. Check active and previous keys, then rerun safely.\n');
  process.exitCode = 1;
});
