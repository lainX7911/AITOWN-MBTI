import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const DEFAULT_DEPLOYMENT_NAME = process.env.MBTI_CONVEX_DEPLOYMENT ?? 'local-lainzhoux77-ai_town_mbti';
const DEFAULT_QUESTION =
  '我今年47岁，想知道什么样的女人适合我，最好以后能一起回岳阳生活。';

const args = parseArgs(process.argv.slice(2));
const question = args.question ?? process.env.MBTI_E2E_QUESTION ?? DEFAULT_QUESTION;
const targetEventCount = Number(args.targetEventCount ?? process.env.MBTI_E2E_TARGET_EVENTS ?? 7);
const userEntryMode = args.userEntryMode ?? process.env.MBTI_E2E_ENTRY_MODE ?? 'solo';
const outDir = join(
  repoRoot,
  args.outDir ?? process.env.MBTI_E2E_OUT_DIR ?? `output/e2e-script/${timestampSlug()}`,
);

async function main() {
  await mkdir(outDir, { recursive: true });
  const config = await readConvexConfig();
  const url = args.url ?? process.env.VITE_CONVEX_URL ?? `http://127.0.0.1:${config.ports.cloud}`;

  console.log('[mbti-e2e] planning startup questions');
  const startup = await runConvexFunction({
    functionName: 'mbtiTownPlanner:planStartupQuestions',
    args: { question, targetEventCount },
    url,
    adminKey: config.adminKey,
    rawPath: join(outDir, '01-startup.raw.log'),
  });

  const startupQuestions = startup?.plannedFocus?.startupQuestions ?? [];
  const requiredStartupQuestionCount = startup?.requiredStartupQuestionCount ?? startupQuestions.length;
  if (startupQuestions.length < requiredStartupQuestionCount) {
    throw new Error(
      `Expected ${requiredStartupQuestionCount} startup questions, got ${startupQuestions.length}`,
    );
  }

  const startupAnswers = startupQuestions.map((item, index) => buildStartupAnswer(item, index));
  assertAnswersMatchQuestions(startupQuestions, startupAnswers);
  await writeJson(join(outDir, '02-startup-answers.json'), {
    question,
    targetEventCount,
    userEntryMode,
    requiredStartupQuestionCount,
    startupQuestions,
    startupAnswers,
  });

  console.log('[mbti-e2e] creating scene request with matched startup answers');
  const startedAt = Date.now();
  let scene = await runConvexFunction({
    functionName: 'mbtiTownPlanner:planAndCreateSceneRequest',
    args: {
      question,
      targetEventCount,
      userEntryMode,
      plannedFocus: startup.plannedFocus,
      startupAnswers,
    },
    url,
    adminKey: config.adminKey,
    rawPath: join(outDir, '03-scene.raw.log'),
  });
  if (!scene?.questionFocus?.eventPlans?.length) {
    scene = await hydrateSceneFromRecentRequests({
      adminKey: config.adminKey,
      rawPath: join(outDir, '03-scene.raw.log'),
      url,
    }) ?? scene;
  }

  const elapsedMs = Date.now() - startedAt;
  const summary = summarizeScene({
    question,
    targetEventCount,
    userEntryMode,
    requiredStartupQuestionCount,
    startupQuestions,
    startupAnswers,
    scene,
    elapsedMs,
  });
  await writeJson(join(outDir, '04-scene.json'), scene);
  await writeJson(join(outDir, '05-summary.json'), summary);

  if (summary.eventCount < targetEventCount) {
    throw new Error(`Expected at least ${targetEventCount} events, got ${summary.eventCount}`);
  }
  if (summary.duplicateTitles.length > 0) {
    throw new Error(`Duplicate event titles: ${summary.duplicateTitles.join(', ')}`);
  }
  if (summary.placeholderHits.length > 0) {
    throw new Error(`Resident placeholder text leaked: ${summary.placeholderHits.join(', ')}`);
  }

  console.log('[mbti-e2e] passed');
  console.log(JSON.stringify({
    outDir,
    elapsedMs,
    eventCount: summary.eventCount,
    startupAnswerCount: startupAnswers.length,
    duplicateTitles: summary.duplicateTitles,
    placeholderHits: summary.placeholderHits,
  }, null, 2));
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const next = rawArgs[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

async function readConvexConfig() {
  const stateDir = join(
    homedir(),
    '.convex',
    'convex-backend-state',
    DEFAULT_DEPLOYMENT_NAME,
  );
  const configPath = join(stateDir, 'config.json');
  if (!existsSync(configPath)) {
    throw new Error(
      `Convex local config not found at ${configPath}. Start the backend first with npm run dev:backend.`,
    );
  }
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (!config?.ports?.cloud || !config?.adminKey) {
    throw new Error(`Invalid Convex local config at ${configPath}`);
  }
  return config;
}

async function runConvexFunction({ functionName, args: functionArgs, url, adminKey, rawPath }) {
  const stdoutChunks = [];
  const stderrChunks = [];
  const childArgs = [
    'convex',
    'run',
    functionName,
    JSON.stringify(functionArgs),
    '--url',
    url,
    '--admin-key',
    adminKey,
  ];
  const code = await new Promise((resolve, reject) => {
    const child = spawn('npx', childArgs, {
      cwd: repoRoot,
      env: {
        ...process.env,
        CONVEX_DEPLOYMENT: `local:${DEFAULT_DEPLOYMENT_NAME}`,
        VITE_CONVEX_URL: url,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('exit', resolve);
  });
  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  await writeFile(rawPath, `${stdout}\n${stderr}`, 'utf8');
  if (code !== 0) {
    throw new Error(`${functionName} failed with exit code ${code}. Raw log: ${rawPath}`);
  }
  const result = extractLastJsonValue(stdout);
  if (!result) {
    throw new Error(`Could not parse ${functionName} JSON result. Raw log: ${rawPath}`);
  }
  return result;
}

function extractLastJsonValue(text) {
  const values = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '{' && char !== '[') {
      continue;
    }
    const end = findJsonEnd(text, index);
    if (end < 0) {
      continue;
    }
    const candidate = text.slice(index, end + 1);
    try {
      values.push(JSON.parse(candidate));
      index = end;
    } catch {
      // Keep scanning; Convex logs can include object-like text before the result.
    }
  }
  return values.find(isSceneRequestResult)
    ?? values.find(isSceneRequestList)
    ?? values.find(isStartupQuestionResult)
    ?? values.at(-1);
}

function isSceneRequestResult(value) {
  return Boolean(
    value &&
      !Array.isArray(value) &&
      typeof value === 'object' &&
      value.sceneRequestId &&
      value.questionFocus &&
      Array.isArray(value.questionFocus.eventPlans),
  );
}

function isSceneRequestList(value) {
  return Boolean(
    Array.isArray(value) &&
      value.some((item) => item?.sceneRequestId || item?._id) &&
      value.some((item) => Array.isArray(item?.questionFocus?.eventPlans)),
  );
}

function isStartupQuestionResult(value) {
  return Boolean(
    value &&
      !Array.isArray(value) &&
      typeof value === 'object' &&
      value.plannedFocus &&
      Array.isArray(value.plannedFocus.startupQuestions),
  );
}

async function hydrateSceneFromRecentRequests({ adminKey, rawPath, url }) {
  const raw = await readFile(rawPath, 'utf8');
  const sceneRequestId = extractSceneRequestId(raw);
  if (!sceneRequestId) {
    return null;
  }
  const recent = await runConvexFunction({
    functionName: 'mbtiTown:listSceneRequests',
    args: { limit: 50 },
    url,
    adminKey,
    rawPath: rawPath.replace(/03-scene\.raw\.log$/, '03b-scene-requests.raw.log'),
  });
  if (!Array.isArray(recent)) {
    return null;
  }
  return recent.find((item) => item._id === sceneRequestId || item.sceneRequestId === sceneRequestId) ?? null;
}

function extractSceneRequestId(text) {
  const matches = [...text.matchAll(/"sceneRequestId"\s*:\s*"([^"]+)"/g)];
  return matches.at(-1)?.[1];
}

function findJsonEnd(text, start) {
  const opener = text[start];
  const closer = opener === '{' ? '}' : ']';
  const stack = [closer];
  let inString = false;
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      stack.push('}');
    } else if (char === '[') {
      stack.push(']');
    } else if (char === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) {
        return index;
      }
    } else if (char === closer && stack.length === 1) {
      return index;
    }
  }
  return -1;
}

function buildStartupAnswer(item, index) {
  const option = pickOption(item.question, item.options ?? [], index);
  return {
    question: item.question,
    answer: option,
    note: buildAnswerNote(item.question, option),
  };
}

function pickOption(questionText, options, index) {
  const text = `${questionText} ${options.join(' ')}`;
  const preferredPatterns = [
    /岳阳|老家|回去|定居|迁移/,
    /共同生活|一起生活|伴侣|婚姻|女人|老婆|相亲/,
    /照顾|养老|父母|健康|病|医院/,
    /钱|收入|房|存款|开销|退休/,
    /不能接受|底线|冲突|吵架/,
  ];
  for (const pattern of preferredPatterns) {
    if (!pattern.test(text)) {
      continue;
    }
    const matched = options.find((option) => pattern.test(option));
    if (matched) {
      return matched;
    }
  }
  return options[index % Math.max(1, options.length)] ?? '希望稳定、真实、能一起面对生活细节';
}

function buildAnswerNote(questionText, option) {
  if (/岳阳|老家|定居|回去/.test(`${questionText} ${option}`)) {
    return '倾向未来能回岳阳生活，但需要对方愿意适应当地亲友关系和日常节奏。';
  }
  if (/伴侣|女人|老婆|婚姻|相亲/.test(`${questionText} ${option}`)) {
    return '更看重踏实沟通、共同生活意愿和遇到现实压力时能不能一起商量。';
  }
  if (/钱|收入|房|存款|开销|退休/.test(`${questionText} ${option}`)) {
    return '财务安排要讲清楚，不能只靠口头承诺，也不希望关系变成单方面负担。';
  }
  if (/照顾|养老|健康|父母|病/.test(`${questionText} ${option}`)) {
    return '希望提前看清楚照护责任、身体风险和双方家庭边界。';
  }
  return '希望事件能贴近日常选择，而不是抽象性格判断。';
}

function assertAnswersMatchQuestions(startupQuestions, startupAnswers) {
  const normalize = (value) => value.replace(/[，。？！?,.\s]/g, '');
  const questionKeys = new Set(startupQuestions.map((item) => normalize(item.question)));
  const answerKeys = new Set(startupAnswers.map((item) => normalize(item.question)));
  if (questionKeys.size !== answerKeys.size) {
    throw new Error('Startup answer questions do not match startup question count');
  }
  for (const key of questionKeys) {
    if (!answerKeys.has(key)) {
      throw new Error('Startup answer question text does not match generated startup questions');
    }
  }
}

function summarizeScene({
  question,
  targetEventCount,
  userEntryMode,
  requiredStartupQuestionCount,
  startupQuestions,
  startupAnswers,
  scene,
  elapsedMs,
}) {
  const eventPlans = scene?.questionFocus?.eventPlans ?? [];
  const titles = eventPlans.map((event) => event.title).filter(Boolean);
  const duplicateTitles = findDuplicates(titles.map(normalizeTitle));
  const eventText = eventPlans
    .map((event) => [
      event.title,
      event.scene,
      event.trigger,
      event.informationGoal,
      event.judgmentSignal,
      ...(event.participants ?? []),
    ].join(' '))
    .join('\n');
  const placeholderHits = ['常驻居民A', '常驻居民B', '居民A', '居民B']
    .filter((placeholder) => eventText.includes(placeholder));
  return {
    question,
    targetEventCount,
    userEntryMode,
    requiredStartupQuestionCount,
    startupQuestionCount: startupQuestions.length,
    startupAnswerCount: startupAnswers.length,
    startupQuestions,
    startupAnswers,
    elapsedMs,
    sceneRequestId: scene?.sceneRequestId,
    selectedLocationKey: scene?.locationKey,
    selectedResidentKeys: scene?.residentKeys,
    eventCount: eventPlans.length,
    duplicateTitles,
    placeholderHits,
    events: eventPlans.map((event) => ({
      title: event.title,
      locationKey: event.locationKey,
      participants: event.participants,
      trigger: event.trigger,
      informationGoal: event.informationGoal,
      judgmentSignal: event.judgmentSignal,
    })),
  };
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

function normalizeTitle(value) {
  return value.replace(/[，。？！?,.\s]/g, '').toLowerCase();
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error('[mbti-e2e] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
