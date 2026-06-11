import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const DEPLOYMENT_NAME = process.env.MBTI_CONVEX_DEPLOYMENT ?? 'local-lainzhoux77-ai_town_mbti';
const CONFIG_PATH =
  process.env.MBTI_CONVEX_CONFIG ??
  join(homedir(), '.convex', 'convex-backend-state', DEPLOYMENT_NAME, 'config.json');
const KEEP_LATEST = Number(process.env.MBTI_CLEANUP_KEEP_LATEST ?? 12);
const COMPLETED_MAX_AGE_MS = Number(
  process.env.MBTI_CLEANUP_COMPLETED_MAX_AGE_MS ?? 3 * 24 * 60 * 60 * 1000,
);
const STALE_ACTIVE_MAX_AGE_MS = Number(
  process.env.MBTI_CLEANUP_STALE_ACTIVE_MAX_AGE_MS ?? 2 * 60 * 60 * 1000,
);
const RUN_TIMEOUT_MS = Number(process.env.MBTI_CLEANUP_RUN_TIMEOUT_MS ?? 2 * 60 * 1000);

function log(message, extra) {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
}

async function readDeploymentConfig() {
  const raw = await readFile(CONFIG_PATH, 'utf8');
  const config = JSON.parse(raw);
  const port = config?.ports?.cloud;
  if (!port || !config.adminKey) {
    throw new Error(`Invalid Convex local config at ${CONFIG_PATH}`);
  }
  return {
    adminKey: config.adminKey,
    url: `http://127.0.0.1:${port}`,
  };
}

async function isBackendReady(url) {
  try {
    const response = await fetch(`${url}/instance_name`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      return false;
    }
    return (await response.text()) === DEPLOYMENT_NAME;
  } catch {
    return false;
  }
}

function runConvex(functionName, args, deployment) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      [
        'convex',
        'run',
        functionName,
        JSON.stringify(args),
        '--url',
        deployment.url,
        '--admin-key',
        deployment.adminKey,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      },
    );
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${functionName} timed out after ${RUN_TIMEOUT_MS}ms`));
    }, RUN_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${functionName} exited with ${code}: ${stderr.trim() || stdout.trim()}`));
      }
    });
  });
}

async function main() {
  const deployment = await readDeploymentConfig();
  if (!(await isBackendReady(deployment.url))) {
    log('Convex backend is not ready; cleanup skipped', { url: deployment.url });
    return;
  }

  const cleanupResult = await runConvex(
    'mbti:cleanupStaleMbtiExperiments',
    {
      keepLatest: KEEP_LATEST,
      completedMaxAgeMs: COMPLETED_MAX_AGE_MS,
      staleActiveMaxAgeMs: STALE_ACTIVE_MAX_AGE_MS,
    },
    deployment,
  );
  log('stale MBTI experiment cleanup finished', { result: cleanupResult });

  const orphanResult = await runConvex('mbti:clearOrphanMemoryEmbeddings', {}, deployment);
  log('orphan memory embedding cleanup finished', { result: orphanResult });
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] cleanup failed`, error);
  process.exitCode = 1;
});
