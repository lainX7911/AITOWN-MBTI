import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { playerId } from './aiTown/ids';

const EVENT_COOLDOWN = 60_000;
const HIDDEN_SYSTEM_EVENT_TITLES = new Set(['主线关系会面', '居民介入主线', '对话节奏补充']);

export const listRecent = query({
  args: {
    worldId: v.id('worlds'),
    playerId: v.optional(playerId),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 8, 1), 100);
    const playerDescription = args.playerId
      ? await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
        .filter((q) => q.eq(q.field('playerId'), args.playerId))
        .first()
      : null;
    const events = await ctx.db
      .query('socialEvents')
      .withIndex('by_world_time', (q) => q.eq('worldId', args.worldId))
      .order('desc')
      .take(Math.min(Math.max(limit * 8, 80), 500));
    const visibleEvents = events.filter((event) => !HIDDEN_SYSTEM_EVENT_TITLES.has(event.title));
    const eventRoleMatches = await Promise.all(
      visibleEvents.map(async (event) => {
        if (!args.playerId) {
          return true;
        }
        if (event.participantIds.includes(args.playerId)) {
          return true;
        }
        if (!event.mbtiEventId || !playerDescription?.name) {
          return false;
        }
        const mbtiEvent = await ctx.db.get(event.mbtiEventId);
        return Boolean(mbtiEvent?.involvedRoles.includes(playerDescription.name));
      }),
    );
    return visibleEvents
      .filter((_, index) => eventRoleMatches[index])
      .slice(0, limit);
  },
});

export const insertIfAllowed = internalMutation({
  args: {
    worldId: v.id('worlds'),
    title: v.string(),
    description: v.string(),
    roomName: v.string(),
    participantIds: v.array(playerId),
    intensity: v.number(),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query('socialEvents')
      .withIndex('by_world_time', (q) => q.eq('worldId', args.worldId))
      .order('desc')
      .first();
    const now = Date.now();
    if (latest && now - latest.createdAt < EVENT_COOLDOWN) {
      return null;
    }
    return await ctx.db.insert('socialEvents', {
      ...args,
      createdAt: now,
    });
  },
});
