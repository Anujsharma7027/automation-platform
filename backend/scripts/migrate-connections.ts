import 'reflect-metadata';
import mongoose from 'mongoose';
import { ConnectedAccount, ConnectedAccountSchema } from '../src/connections/schemas/connected-account.schema';
import { OAuthState, OAuthStateSchema } from '../src/connections/schemas/oauth-state.schema';
import { Workflow, WorkflowSchema } from '../src/workflows/schemas/workflow.schema';
import { WorkflowRun, WorkflowRunSchema } from '../src/workflows/schemas/workflow-run.schema';

async function main() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is required to apply connection indexes');
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const connectedAccounts = connection.model(ConnectedAccount.name, ConnectedAccountSchema);
    const oauthStates = connection.model(OAuthState.name, OAuthStateSchema);
    await connectedAccounts.createIndexes();
    await oauthStates.createIndexes();
    await connection.model(Workflow.name, WorkflowSchema).createIndexes();
    await connection.model(WorkflowRun.name, WorkflowRunSchema).createIndexes();
  } finally {
    await connection.close();
  }
}

main().catch(() => {
  process.stderr.write('Connection index migration failed. Check database availability and index conflicts.\n');
  process.exitCode = 1;
});
