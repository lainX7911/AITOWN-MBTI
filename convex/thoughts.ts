import { v } from 'convex/values';
import { query } from './_generated/server';
import { playerId } from './aiTown/ids';

export const listForPlayer = query({
  args: {
    worldId: v.id('worlds'),
    playerId,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const thoughts = await ctx.db
      .query('innerThoughts')
      .withIndex('player', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .order('desc')
      .take(args.limit ?? 6);
    return thoughts;
  },
});
