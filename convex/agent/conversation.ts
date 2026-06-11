import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { ActionCtx, internalQuery } from '../_generated/server';
import { LLMMessage, chatCompletion } from '../util/llm';
import * as memory from './memory';
import { api, internal } from '../_generated/api';
import * as embeddingsCache from './embeddingsCache';
import { GameId, conversationId, playerId } from '../aiTown/ids';
import { NUM_MEMORIES_TO_SEARCH } from '../constants';

const selfInternal = internal.agent.conversation;

export async function startConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
  options?: {
    sceneInstruction?: string;
  },
): Promise<string> {
  const { player, otherPlayer, agent, otherAgent, lastConversation } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const embedding = await embeddingsCache.fetch(ctx, `${player.name} 正在和 ${otherPlayer.name} 对话`);

  const memories = filterMemoriesForConversation(
    await memory.searchMemories(
    ctx,
    player.id as GameId<'players'>,
    embedding,
    Number(process.env.NUM_MEMORIES_TO_SEARCH) || NUM_MEMORIES_TO_SEARCH,
    ),
    otherPlayerId,
  );

  const memoryWithOtherPlayer = memories.find(
    (m) => m.data.type === 'conversation' && m.data.playerIds.includes(otherPlayerId),
  );
  const prompt = conversationPromptBase(
    player.name,
    otherPlayer.name,
    options?.sceneInstruction ?? '你刚刚主动开始这段对话。',
  );
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...previousConversationPrompt(otherPlayer, lastConversation));
  prompt.push(...relatedMemoriesPrompt(memories));
  if (memoryWithOtherPlayer) {
    prompt.push(
      `如果自然，可以提到一点上次对话里的具体细节；不要为了提及而生硬重复。`,
    );
  }
  const lastPrompt = `${player.name} 对 ${otherPlayer.name}：`;
  prompt.push(lastPrompt);

  const { content } = await chatCompletion({
    messages: [
      {
        role: 'system',
        content: prompt.slice(0, -1).join('\n'),
      },
      {
        role: 'user',
        content: lastPrompt,
      },
    ],
    max_tokens: 80,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return sanitizeConversationMessage(content, lastPrompt, prompt.join('\n'), agent?.identity, otherAgent?.identity);
}

function trimContentPrefx(content: string, prompt: string) {
  if (content.startsWith(prompt)) {
    return content.slice(prompt.length).trim();
  }
  return content;
}

function sanitizeConversationMessage(
  content: string,
  prompt: string,
  context: string,
  speakerIdentity?: string,
  otherIdentity?: string,
) {
  let text = trimContentPrefx(content, prompt)
    .replace(/^[“"']|[”"']$/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (mapsPrimaryRelationship(otherIdentity)) {
    text = text.replace(/她/g, '你').replace(/他/g, '你').replace(/TA/g, '你');
  }
  if (mapsPrimaryRelationship(speakerIdentity)) {
    text = text.replace(/她/g, '我').replace(/他/g, '我').replace(/TA/g, '我');
  }
  const professional = isProfessionalContext(context);
  if (!professional) {
    text = normalizeEverydaySpeech(text);
    text = firstNaturalSentence(text);
  }
  const maxLength = professional ? 140 : 32;
  if (text.length > maxLength) {
    text = text.slice(0, maxLength).replace(/[，,；;：:、][^，,；;：:、]*$/, '').trim();
  }
  return text || everydayFallback(speakerIdentity);
}

function mapsPrimaryRelationship(identity?: string) {
  if (!identity) return false;
  return /强关系映射|对应问题里的谁|关系映射/.test(identity) && /伴侣|女朋友|男朋友|对象|对方|她|他|TA/.test(identity);
}

function firstNaturalSentence(text: string) {
  const match = text.match(/^.+?[。！？!?]/);
  if (match) return match[0].trim();
  const comma = text.match(/^.{8,38}?[，,；;]/);
  if (comma) return comma[0].replace(/[，,；;]$/, '。').trim();
  return text;
}

function normalizeEverydaySpeech(text: string) {
  const blockedPatterns = [
    /命题/g,
    /诅咒/g,
    /剧本/g,
    /边界不是墙/g,
    /像.*一样/g,
    /针.*扎/g,
    /灵魂/g,
    /黑即白/g,
    /必须先亲手打破/g,
    /学会/g,
    /彻底/g,
    /本质/g,
    /博弈/g,
    /结局/g,
    /存在.*证明/g,
    /填补空白/g,
    /手术刀/g,
    /精准地切开/g,
    /过去所有/g,
    /被接纳/g,
  ];
  if (blockedPatterns.some((pattern) => pattern.test(text))) {
    return '我听到了，但你能不能先说具体一点？';
  }
  return text
    .replace(/这种矛盾并非无解的诅咒[^。！？!?]*/g, '这事确实有点难')
    .replace(/你更害怕失去她/g, '你是不是怕我会离开')
    .replace(/失去自己/g, '把自己弄丢')
    .replace(/她/g, '你');
}

function everydayFallback(speakerIdentity?: string) {
  return mapsPrimaryRelationship(speakerIdentity)
    ? '我先缓一下，等会儿再聊。'
    : '我先想一下。';
}

function isProfessionalContext(text: string) {
  return /技术|代码|算法|模型|论文|医学|法律|财务|金融|投资|项目|产品|业务|数据|方案|架构|设计|研究|报告/.test(
    text,
  );
}

export async function continueConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer, conversation, agent, otherAgent } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const now = Date.now();
  const started = new Date(conversation.created);
  const embedding = await embeddingsCache.fetch(ctx, `你怎么看待 ${otherPlayer.name}？`);
  const memories = filterMemoriesForConversation(
    await memory.searchMemories(ctx, player.id as GameId<'players'>, embedding, 3),
    otherPlayerId,
  );
  const prompt = [
    ...conversationPromptBase(player.name, otherPlayer.name, '你正在继续这段对话。'),
    `对话开始于 ${started.toLocaleString()}，现在是 ${now.toLocaleString()}。`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...relatedMemoriesPrompt(memories));
  prompt.push(
    `下面是当前聊天历史。不要重新打招呼，不要复述设定。`,
    `如果这是亲密关系、朋友、家人等日常问题：只输出一句 15-35 字的生活化回复。`,
    `只有在讨论技术、工作、医学、法律、财务等专业问题时，才可以输出 80-140 字的解释。`,
  );

  const llmMessages: LLMMessage[] = [
    {
      role: 'system',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  const lastPrompt = `${player.name} 对 ${otherPlayer.name}：`;
  llmMessages.push({ role: 'user', content: lastPrompt });

  const { content } = await chatCompletion({
    messages: llmMessages,
    max_tokens: 80,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return sanitizeConversationMessage(content, lastPrompt, prompt.join('\n'), agent?.identity, otherAgent?.identity);
}

export async function leaveConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
): Promise<string> {
  const { player, otherPlayer, conversation, agent, otherAgent } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const prompt = conversationPromptBase(player.name, otherPlayer.name, '你准备结束这段对话。');
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(
    `下面是当前聊天历史。`,
    `只输出 ${player.name} 此刻要发给 ${otherPlayer.name} 的一句自然结束语，控制在 30 字以内。`,
  );
  const llmMessages: LLMMessage[] = [
    {
      role: 'system',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  const lastPrompt = `${player.name} 对 ${otherPlayer.name}：`;
  llmMessages.push({ role: 'user', content: lastPrompt });

  const { content } = await chatCompletion({
    messages: llmMessages,
    max_tokens: 60,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return sanitizeConversationMessage(content, lastPrompt, prompt.join('\n'), agent?.identity, otherAgent?.identity);
}

function agentPrompts(
  otherPlayer: { name: string },
  agent: { identity: string; plan: string } | null,
  otherAgent: { identity: string; plan: string } | null,
): string[] {
  const prompt = [];
  if (agent) {
    prompt.push(`你的身份设定：${agent.identity}`);
    prompt.push(`你的当前目标：${agent.plan}`);
    if (/人格代码|人格权重|行为倾向/.test(agent.identity)) {
      prompt.push(
        `人格约束：你是用户人格代理，发言必须符合身份设定中的 MBTI 权重和行为倾向。`,
        `不要变成通用安慰者、咨询师或旁观分析者；你只能按自己的焦虑、退缩、修复动机、事实核验、情绪敏感度自然回应。`,
        `如果你倾向退缩，就先表达需要缓一下；如果修复动机强，就短句尝试确认；如果含义推演强，就会问对方这句话是什么意思；如果事实核验强，就先问具体情况。`,
      );
    }
  }
  if (otherAgent) {
    prompt.push(
      `${otherPlayer.name} 的身份设定：${otherAgent.identity}`,
      `注意：上面这张对方角色卡里的“你”指${otherPlayer.name}，不是指你；角色卡里的“我”指名为“我”的实验当事人，不一定是当前对话对象。`,
    );
    prompt.push(
      `如果当前问题里的“伴侣、女朋友、男朋友、她、他、对方”等称呼对应 ${otherPlayer.name}，你必须把它理解为正在和你聊天的这个人，不要再说成第三者。`,
    );
  }
  return prompt;
}

function conversationPromptBase(playerName: string, otherPlayerName: string, sceneInstruction: string) {
  return [
    `你现在扮演“${playerName}”，正在和“${otherPlayerName}”一对一聊天。`,
    sceneInstruction,
    playerName !== '我' && otherPlayerName !== '我'
      ? `当前对话双方都不是名为“我”的当事人。不要把你和“我”的亲密关系记忆，当成你和${otherPlayerName}之间刚发生的事。`
      : '',
    `称呼规则：你只能用“我”表达自己，用“你”称呼正在对话的 ${otherPlayerName}。`,
    `不要用“他”“她”“TA”指代正在对话的 ${otherPlayerName}，除非说的是第三个不在场的人。`,
    `语言风格：像微信里普通人聊天，短句、具体、克制，不要文艺腔、舞台腔、小说旁白、括号动作或大段心理描写。`,
    `日常问题的内容规则：一次只说一件小事，15-35 字，不讲大道理，不打比方，不分析整段关系，不把结论一次性说透。`,
    `专业问题的内容规则：可以稍长，但仍要分清事实、建议和不确定性。`,
    `输出规则：只输出 ${playerName} 要说的一句话，不要写动作、旁白标题，不要写“${playerName} 对 ${otherPlayerName}：”前缀。`,
  ].filter(Boolean);
}

function previousConversationPrompt(
  otherPlayer: { name: string },
  conversation: { created: number } | null,
): string[] {
  const prompt = [];
  if (conversation) {
    const prev = new Date(conversation.created);
    const now = new Date();
    prompt.push(
      `你和 ${
        otherPlayer.name
      } 上次聊天是在 ${prev.toLocaleString()}，现在是 ${now.toLocaleString()}。`,
    );
  }
  return prompt;
}

function relatedMemoriesPrompt(memories: memory.Memory[]): string[] {
  const prompt = [];
  if (memories.length > 0) {
    prompt.push(`以下是相关记忆，按相关度从高到低排列：`);
    prompt.push(`记忆只用于理解背景，不要模仿记忆里的长句、旁白或文学化表达。`);
    for (const memory of memories) {
      prompt.push(' - ' + memory.description);
    }
  }
  return prompt;
}

function filterMemoriesForConversation(memories: memory.Memory[], otherPlayerId: GameId<'players'>) {
  return memories.filter((item) => {
    if (item.data.type === 'conversation') {
      return item.data.playerIds.includes(otherPlayerId);
    }
    if (item.data.type === 'relationship') {
      return item.data.playerId === otherPlayerId;
    }
    return false;
  });
}

async function previousMessages(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  player: { id: string; name: string },
  otherPlayer: { id: string; name: string },
  conversationId: GameId<'conversations'>,
) {
  const llmMessages: LLMMessage[] = [];
  const prevMessages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  for (const message of prevMessages) {
    const author = message.author === player.id ? player : otherPlayer;
    const recipient = message.author === player.id ? otherPlayer : player;
    llmMessages.push({
      role: 'user',
      content: `${author.name} 对 ${recipient.name}：${message.text}`,
    });
  }
  return llmMessages;
}

export const queryPromptData = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId,
    otherPlayerId: playerId,
    conversationId,
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }
    const player = world.players.find((p) => p.id === args.playerId);
    if (!player) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!playerDescription) {
      throw new Error(`Player description for ${args.playerId} not found`);
    }
    const otherPlayer = world.players.find((p) => p.id === args.otherPlayerId);
    if (!otherPlayer) {
      throw new Error(`Player ${args.otherPlayerId} not found`);
    }
    const otherPlayerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.otherPlayerId))
      .first();
    if (!otherPlayerDescription) {
      throw new Error(`Player description for ${args.otherPlayerId} not found`);
    }
    const conversation = world.conversations.find((c) => c.id === args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const agent = world.agents.find((a) => a.playerId === args.playerId);
    if (!agent) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const agentDescription = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', agent.id))
      .first();
    if (!agentDescription) {
      throw new Error(`Agent description for ${agent.id} not found`);
    }
    const otherAgent = world.agents.find((a) => a.playerId === args.otherPlayerId);
    let otherAgentDescription;
    if (otherAgent) {
      otherAgentDescription = await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', otherAgent.id))
        .first();
      if (!otherAgentDescription) {
        throw new Error(`Agent description for ${otherAgent.id} not found`);
      }
    }
    const lastTogether = await ctx.db
      .query('participatedTogether')
      .withIndex('edge', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('player1', args.playerId)
          .eq('player2', args.otherPlayerId),
      )
      // Order by conversation end time descending.
      .order('desc')
      .first();

    let lastConversation = null;
    if (lastTogether) {
      lastConversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) =>
          q.eq('worldId', args.worldId).eq('id', lastTogether.conversationId),
        )
        .first();
      if (!lastConversation) {
        throw new Error(`Conversation ${lastTogether.conversationId} not found`);
      }
    }
    return {
      player: { name: playerDescription.name, ...player },
      otherPlayer: { name: otherPlayerDescription.name, ...otherPlayer },
      conversation,
      agent: { identity: agentDescription.identity, plan: agentDescription.plan, ...agent },
      otherAgent: otherAgent && {
        identity: otherAgentDescription!.identity,
        plan: otherAgentDescription!.plan,
        ...otherAgent,
      },
      lastConversation,
    };
  },
});

function stopWords(otherPlayer: string, player: string) {
  // These are the words we ask the LLM to stop on. OpenAI only supports 4.
  const variants = [`${otherPlayer} to ${player}`, `${otherPlayer} 对 ${player}`];
  return variants.flatMap((stop) => [stop + ':', stop.toLowerCase() + ':']);
}
