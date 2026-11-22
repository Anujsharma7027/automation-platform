/**
 * PROCESS_ROLE controls what a process does:
 * - `all` (default): HTTP API + background workers (simple single-server setups).
 * - `api`: HTTP API only. Scale horizontally behind a load balancer.
 * - `worker`: background workers only (polling + execution). Scale independently.
 */
export type ProcessRole = 'all' | 'api' | 'worker';

export function processRole(): ProcessRole {
  const role = process.env.PROCESS_ROLE?.trim().toLowerCase();
  return role === 'api' || role === 'worker' ? role : 'all';
}

export const runsWorkers = () => processRole() !== 'api';
