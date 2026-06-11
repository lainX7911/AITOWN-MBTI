import { v } from 'convex/values';
import { QueryCtx, mutation, query } from './_generated/server';
import { Id } from './_generated/dataModel';
import { insertInput } from './aiTown/insertInput';
import { conversationId, playerId } from './aiTown/ids';

export const listMessages = query({
  args: {
    worldId: v.id('worlds'),
    conversationId,
  },
  handler: async (ctx, args) => {
    return await readMessagesWithContext(ctx, args.worldId, args.conversationId);
  },
});

export const listMessagesWithContext = query({
  args: {
    worldId: v.id('worlds'),
    conversationId,
  },
  handler: async (ctx, args) => {
    const messages = await readMessagesWithContext(ctx, args.worldId, args.conversationId);
    const eventContext = messages.find((message) => message.eventContext)?.eventContext;
    const eventBehaviors = eventContext
      ? await eventBehaviorsForContext(ctx, args.worldId, eventContext.eventId)
      : [];
    return {
      messages,
      eventContext,
      eventBehaviors,
    };
  },
});

async function readMessagesWithContext(
  ctx: QueryCtx,
  worldId: Id<'worlds'>,
  targetConversationId: string,
) {
  const messages = await ctx.db
    .query('messages')
    .withIndex('conversationId', (q) => q.eq('worldId', worldId).eq('conversationId', targetConversationId))
    .collect();
  const out = [];
  for (const message of messages) {
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', message.author))
      .first();
    if (!playerDescription) {
      throw new Error(`Invalid author ID: ${message.author}`);
    }
    const eventContext = await eventContextForMessage(ctx, worldId, message.messageUuid);
    out.push({ ...message, authorName: playerDescription.name, eventContext });
  }
  return out;
}

async function eventBehaviorsForContext(
  ctx: QueryCtx,
  worldId: Id<'worlds'>,
  eventId: Id<'mbtiEvents'>,
) {
  const behaviors = await ctx.db
    .query('mbtiBehaviorEvents')
    .withIndex('world_time', (q) => q.eq('worldId', worldId))
    .filter((q) => q.eq(q.field('mbtiEventId'), eventId))
    .collect();
  return behaviors
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-3)
    .map((behavior) => ({
      playerId: behavior.playerId,
      text: behavior.description,
      createdAt: behavior.createdAt,
    }));
}

async function eventContextForMessage(
  ctx: QueryCtx,
  worldId: Id<'worlds'>,
  messageUuid: string,
) {
  const evidence = await ctx.db
    .query('mbtiEventEvidence')
    .withIndex('source', (q) =>
      q.eq('worldId', worldId).eq('kind', 'message').eq('sourceId', messageUuid),
    )
    .first();
  const eventId = evidence?.mbtiEventId ?? eventIdFromMessageUuid(messageUuid);
  if (!eventId) {
    return undefined;
  }
  const event = await ctx.db.get(eventId);
  if (!event) {
    return undefined;
  }
  const record = await ctx.db
    .query('socialEvents')
    .withIndex('by_world', (q) => q.eq('worldId', worldId))
    .filter((q) => q.eq(q.field('mbtiEventId'), event._id))
    .first();
  return {
    eventId: event._id,
    title: event.title,
    text: extractEventThing(record?.description ?? event.description),
  };
}

function eventIdFromMessageUuid(messageUuid: string) {
  const match = messageUuid.match(/^mbti-event-([a-z0-9]+)-/);
  return match ? match[1] as Id<'mbtiEvents'> : undefined;
}

function extractEventThing(description: string) {
  const normalized = description.replace(/\s+/g, ' ').trim();
  const thing = pickLabeledSection(normalized, '具体事情', '参与者');
  return thing || normalized;
}

function pickLabeledSection(text: string, startLabel: string, endLabel: string) {
  const start = `${startLabel}：`;
  const startIndex = text.indexOf(start);
  if (startIndex < 0) {
    return undefined;
  }
  const contentStart = startIndex + start.length;
  const endIndex = text.indexOf(`${endLabel}：`, contentStart);
  const raw = endIndex >= 0 ? text.slice(contentStart, endIndex) : text.slice(contentStart);
  const value = raw.trim().replace(/[。；;，,]$/, '');
  return value || undefined;
}

export const writeMessage = mutation({
  args: {
    worldId: v.id('worlds'),
    conversationId,
    messageUuid: v.string(),
    playerId,
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: args.playerId,
      messageUuid: args.messageUuid,
      text: args.text,
      worldId: args.worldId,
    });
    await insertInput(ctx, args.worldId, 'finishSendingMessage', {
      conversationId: args.conversationId,
      playerId: args.playerId,
      timestamp: Date.now(),
    });
  },
});
