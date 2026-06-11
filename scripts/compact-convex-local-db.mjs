import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEPLOYMENT_NAME = process.env.MBTI_CONVEX_DEPLOYMENT ?? 'local-lainzhoux77-ai_town_mbti';
const STATE_DIR = join(homedir(), '.convex', 'convex-backend-state', DEPLOYMENT_NAME);

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

async function backendReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/instance_name`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function main() {
  const config = JSON.parse(await readFile(join(STATE_DIR, 'config.json'), 'utf8'));
  const dbPath = join(STATE_DIR, 'convex_local_backend.sqlite3');
  if (await backendReady(config.ports.cloud)) {
    throw new Error('Convex backend is running. Stop npm run dev before compacting the local database.');
  }
  const before = (await stat(dbPath)).size;
  console.log(`[compact] local db before: ${formatBytes(before)}`);
  await run('sqlite3', [
    dbPath,
    'PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA optimize;',
  ]);
  const after = (await stat(dbPath)).size;
  console.log(`[compact] local db after: ${formatBytes(after)}`);
}

main().catch((error) => {
  console.error('[compact] failed', error);
  process.exitCode = 1;
});
