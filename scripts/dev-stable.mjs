import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOCAL_BACKEND_INSTANCE_SECRET =
  '4361726e697461732c206c69746572616c6c79206d65616e696e6720226c6974';
const DEPLOYMENT_NAME = process.env.MBTI_CONVEX_DEPLOYMENT ?? 'local-lainzhoux77-ai_town_mbti';
const STATE_DIR = join(homedir(), '.convex', 'convex-backend-state', DEPLOYMENT_NAME);
const READY_TIMEOUT_MS = Number(process.env.MBTI_BACKEND_READY_TIMEOUT_MS ?? 120_000);
const RESTART_DELAY_MS = Number(process.env.MBTI_DEV_RESTART_DELAY_MS ?? 3_000);

const children = new Set();
let shuttingDown = false;

function log(message, extra) {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.log(`[dev] ${message}${suffix}`);
}

async function readConfig() {
  const config = JSON.parse(await readFile(join(STATE_DIR, 'config.json'), 'utf8'));
  if (!config?.ports?.cloud || !config?.ports?.site || !config?.backendVersion || !config?.adminKey) {
    throw new Error(`Invalid Convex local config at ${join(STATE_DIR, 'config.json')}`);
  }
  return config;
}

async function backendReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/instance_name`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok && (await response.text()) === DEPLOYMENT_NAME;
  } catch {
    return false;
  }
}

function spawnManaged(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      log(`${name} exited`, { code, signal });
      if (options.restart) {
        setTimeout(() => {
          if (!shuttingDown) {
            log(`restarting ${name}`);
            spawnManaged(name, command, args, options);
          }
        }, RESTART_DELAY_MS);
      }
    }
  });
  child.on('error', (error) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`[dev] ${name} failed`, error);
    }
  });
  return child;
}

async function startBackend(config) {
  if (await backendReady(config.ports.cloud)) {
    log('Convex backend already ready');
    return null;
  }
  const binaryPath = join(homedir(), '.convex', 'binaries', config.backendVersion, 'convex-local-backend');
  if (!existsSync(binaryPath)) {
    throw new Error(`Convex backend binary not found: ${binaryPath}`);
  }
  log('starting Convex local backend', { port: config.ports.cloud, timeoutMs: READY_TIMEOUT_MS });
  const backend = spawnManaged(
    'convex-local-backend',
    binaryPath,
    [
      '--port',
      String(config.ports.cloud),
      '--site-proxy-port',
      String(config.ports.site),
      '--sentry-identifier',
      createHash('sha256').update(DEPLOYMENT_NAME).digest('hex'),
      '--instance-name',
      DEPLOYMENT_NAME,
      '--instance-secret',
      LOCAL_BACKEND_INSTANCE_SECRET,
      '--local-storage',
      join(STATE_DIR, 'convex_local_storage'),
      '--beacon-tag',
      'cli-local-dev',
      join(STATE_DIR, 'convex_local_backend.sqlite3'),
    ],
    { stdio: 'inherit' },
  );
  const startedAt = Date.now();
  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    if (await backendReady(config.ports.cloud)) {
      log('Convex backend ready', { seconds: Math.round((Date.now() - startedAt) / 1000) });
      return backend;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Convex backend did not become ready within ${READY_TIMEOUT_MS}ms`);
}

async function runOnce(command, args, env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
    });
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
  const config = await readConfig();
  const url = `http://127.0.0.1:${config.ports.cloud}`;
  const env = {
    ...process.env,
    CONVEX_DEPLOYMENT: `local:${DEPLOYMENT_NAME}`,
    VITE_CONVEX_URL: url,
    VITE_CONVEX_SITE_URL: `http://127.0.0.1:${config.ports.site}`,
  };
  await startBackend(config);
  await runOnce('npx', ['convex', 'dev', '--once', '--url', url, '--admin-key', config.adminKey], env);
  await runOnce('npx', ['convex', 'run', 'init', '--url', url, '--admin-key', config.adminKey], env);
  spawnManaged('convex-dev', 'npx', ['convex', 'dev', '--tail-logs', '--url', url, '--admin-key', config.adminKey], {
    env,
    restart: true,
  });
  spawnManaged('vite', 'npx', ['vite', '--host', '0.0.0.0'], {
    env,
    restart: true,
  });
}

function shutdown() {
  shuttingDown = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((error) => {
  console.error('[dev] startup failed', error);
  shutdown();
});
