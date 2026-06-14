import { v } from 'convex/values';
import { agentId, conversationId, parseGameId, playerId } from './ids';
import { Player, activity } from './player';
import { Conversation, conversationInputs } from './conversation';
import { blocked, canReachExactDestination, movePlayer } from './movement';
import { inputHandler } from './inputHandler';
import { point } from '../util/types';
import { Descriptions } from '../../data/characters';
import { AgentDescription } from './agentDescription';
import { Agent } from './agent';
import { townDestinations, townFacilitySpawnCandidates, townRoadPoints } from '../../data/townLayout';
import type { Point } from '../util/types';

export const agentInputs = {
  finishRememberConversation: inputHandler({
    args: {
      operationId: v.string(),
      agentId,
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} isn't remembering ${args.operationId}`);
      } else {
        delete agent.inProgressOperation;
        delete agent.toRemember;
      }
      return null;
    },
  }),
  finishDoSomething: inputHandler({
    args: {
      operationId: v.string(),
      agentId,
      destination: v.optional(point),
      invitee: v.optional(playerId),
      activity: v.optional(activity),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} didn't have ${args.operationId} in progress`);
        return null;
      }
      delete agent.inProgressOperation;
      const player = game.world.players.get(agent.playerId)!;
      if (args.invitee) {
        const inviteeId = parseGameId('players', args.invitee);
        const invitee = game.world.players.get(inviteeId);
        if (!invitee) {
          throw new Error(`Couldn't find player: ${inviteeId}`);
        }
        Conversation.start(game, now, player, invitee);
        agent.lastInviteAttempt = now;
      }
      if (args.destination) {
        movePlayer(game, now, player, args.destination);
      }
      if (args.activity) {
        player.activity = args.activity;
      }
      return null;
    },
  }),
  agentFinishSendingMessage: inputHandler({
    args: {
      agentId,
      conversationId,
      timestamp: v.number(),
      operationId: v.string(),
      leaveConversation: v.boolean(),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      const player = game.world.players.get(agent.playerId);
      if (!player) {
        throw new Error(`Couldn't find player: ${agent.playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Couldn't find conversation: ${conversationId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} wasn't sending a message ${args.operationId}`);
        return null;
      }
      delete agent.inProgressOperation;
      conversationInputs.finishSendingMessage.handler(game, now, {
        playerId: agent.playerId,
        conversationId: args.conversationId,
        timestamp: args.timestamp,
      });
      if (args.leaveConversation) {
        conversation.leave(game, now, player);
      }
      return null;
    },
  }),
  createAgent: inputHandler({
    args: {
      descriptionIndex: v.number(),
    },
    handler: (game, now, args) => {
      const description = Descriptions[args.descriptionIndex];
      const playerId = Player.join(
        game,
        now,
        description.name,
        description.character,
        description.identity,
      );
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId: playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId: agentId,
          identity: description.identity,
          plan: description.plan,
        }),
      );
      return { agentId };
    },
  }),
  createMbtiAgent: inputHandler({
    args: {
      name: v.string(),
      character: v.string(),
      identity: v.string(),
      profile: v.optional(v.string()),
      plan: v.string(),
    },
    handler: (game, now, args) => {
      const playerId = Player.join(
        game,
        now,
        args.name,
        args.character,
        args.profile ?? args.identity,
      );
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId,
          identity: args.identity,
          plan: args.plan,
        }),
      );
      return { agentId };
    },
  }),
  createMbtiScene: inputHandler({
    args: {
      self: v.object({
        name: v.string(),
        character: v.string(),
        identity: v.string(),
        profile: v.optional(v.string()),
        plan: v.string(),
      }),
      sceneLocationKey: v.optional(v.string()),
      roles: v.array(
        v.object({
          name: v.string(),
          character: v.string(),
          identity: v.string(),
          profile: v.optional(v.string()),
          plan: v.string(),
        }),
      ),
      backgroundResidents: v.optional(
        v.array(
          v.object({
            name: v.string(),
            character: v.string(),
            identity: v.string(),
            profile: v.optional(v.string()),
          }),
        ),
      ),
    },
    handler: (game, now, args) => {
      const self = createMbtiAgentInGame(game, now, args.self);
      placeAtSceneAnchor(game, now, self.playerId, args.sceneLocationKey);
      const roleResults = args.roles.map((role) => createMbtiAgentInGame(game, now, role));
      const backgroundResults = (args.backgroundResidents ?? []).map((resident, index) =>
        createMbtiBackgroundPlayerInGame(game, now, resident, index),
      );
      for (const [index, role] of roleResults.entries()) {
        placeNear(game, now, self.playerId, role.playerId, index);
      }
      for (const [index, resident] of backgroundResults.entries()) {
        placeNear(game, now, self.playerId, resident.playerId, roleResults.length + index);
        const player = game.world.players.get(resident.playerId);
        const destination = backgroundDestination(game, resident.playerId, index);
        if (player && destination) {
          movePlayer(game, now, player, destination);
        }
      }
      const primaryRole = roleResults[0];
      let conversationId = null;
      if (primaryRole) {
        const selfPlayer = game.world.players.get(self.playerId)!;
        const rolePlayer = game.world.players.get(primaryRole.playerId)!;
        const result = Conversation.start(game, now, selfPlayer, rolePlayer);
        if (result.conversationId) {
          conversationId = result.conversationId;
          const conversation = game.world.conversations.get(result.conversationId)!;
          conversation.acceptInvite(game, rolePlayer);
        }
      }
      return {
        self,
        roles: roleResults,
        backgroundResidents: backgroundResults,
        conversationId,
      };
    },
  }),
  wanderMbtiBackgroundResidents: inputHandler({
    args: {},
    handler: (game, now) => {
      const agentPlayerIds = new Set([...game.world.agents.values()].map((agent) => agent.playerId));
      let moved = 0;
      for (const player of game.world.players.values()) {
        if (agentPlayerIds.has(player.id) || player.pathfinding) {
          continue;
        }
        const destination = backgroundDestination(game, player.id, moved);
        if (destination) {
          movePlayer(game, now, player, destination);
          moved++;
        }
      }
      return { moved };
    },
  }),
  applyMbtiSceneActivity: inputHandler({
    args: {
      participantNames: v.array(v.string()),
      activity,
    },
    handler: (game, now, args) => {
      let applied = 0;
      for (const [playerId, description] of game.playerDescriptions.entries()) {
        if (!args.participantNames.includes(description.name)) {
          continue;
        }
        const player = game.world.players.get(playerId);
        if (!player) {
          continue;
        }
        player.activity = {
          ...args.activity,
          until: Math.max(args.activity.until, now + 20 * 1000),
        };
        applied++;
      }
      return { applied };
    },
  }),
  moveMbtiEventParticipants: inputHandler({
    args: {
      participantNames: v.array(v.string()),
      locationKey: v.optional(v.string()),
      stagingPoint: v.optional(point),
      activity,
    },
    handler: (game, now, args) => {
      const destinations = mbtiEventDestinationCandidates(args.locationKey, args.stagingPoint);
      if (destinations.length === 0) {
        return { moved: 0, reason: 'missing-destination' };
      }
      let moved = 0;
      for (const [playerId, description] of game.playerDescriptions.entries()) {
        if (!args.participantNames.includes(description.name)) {
          continue;
        }
        const player = game.world.players.get(playerId);
        if (!player) {
          continue;
        }
        const conversation = game.world.playerConversation(player);
        if (conversation) {
          conversation.leave(game, now, player);
        }
        const offset = eventDestinationOffset(moved);
        const baseDestination = destinations[moved % destinations.length] ?? destinations[0];
        const candidate = {
          x: baseDestination.x + offset.x,
          y: baseDestination.y + offset.y,
        };
        const target = firstReachableDestination(game, now, player, uniquePoints([candidate, ...destinations]));
        if (target) {
          movePlayer(game, now, player, target);
          moved++;
        }
        player.activity = {
          ...args.activity,
          until: Math.max(args.activity.until, now + 35 * 1000),
        };
      }
      return { moved };
    },
  }),
  ensureMbtiFocusConversation: inputHandler({
    args: {
      participantNames: v.array(v.string()),
    },
    handler: (game, now, args) => {
      const [selfName, focusName] = args.participantNames;
      if (!selfName || !focusName) {
        return { started: false, reason: 'missing-participant' };
      }
      const selfDescription = [...game.playerDescriptions.values()].find(
        (description) => description.name === selfName,
      );
      const focusDescription = [...game.playerDescriptions.values()].find(
        (description) => description.name === focusName,
      );
      if (!selfDescription || !focusDescription) {
        return { started: false, reason: 'participant-not-found' };
      }
      const self = game.world.players.get(selfDescription.playerId);
      const focus = game.world.players.get(focusDescription.playerId);
      if (!self || !focus) {
        return { started: false, reason: 'player-not-found' };
      }
      const existingTogether = [...game.world.conversations.values()].find(
        (conversation) =>
          conversation.participants.has(self.id) && conversation.participants.has(focus.id),
      );
      if (existingTogether) {
        return { started: false, reason: 'already-together' };
      }
      const blockingConversation = [...game.world.conversations.values()].find(
        (conversation) =>
          (conversation.participants.has(self.id) || conversation.participants.has(focus.id)) &&
          isRecentConversation(conversation, now),
      );
      if (blockingConversation) {
        return { started: false, reason: 'participant-busy' };
      }
      for (const conversation of game.world.conversations.values()) {
        if (conversation.participants.has(self.id)) {
          conversation.leave(game, now, self);
        }
        if (conversation.participants.has(focus.id)) {
          conversation.leave(game, now, focus);
        }
      }
      placeNear(game, now, self.id, focus.id, 0);
      const result = Conversation.start(game, now, self, focus);
      if (result.conversationId) {
        const conversation = game.world.conversations.get(result.conversationId)!;
        conversation.acceptInvite(game, focus);
        self.activity = {
          description: `去找${focusName}`,
          emoji: '💬',
          until: now + 45 * 1000,
        };
        focus.activity = {
          description: `和${selfName}见面`,
          emoji: '💬',
          until: now + 45 * 1000,
        };
        return { started: true, conversationId: result.conversationId };
      }
      return { started: false, reason: result.error ?? 'start-failed' };
    },
  }),
};

export function mbtiEventDestinationCandidates(locationKey?: string, stagingPoint?: Point) {
  const locationDestination = townDestinations.find((item) => item.key === locationKey)?.point;
  const squareDestination = townDestinations.find((item) => item.key === 'square')?.point;
  return [
    ...(stagingPoint ? [stagingPoint] : []),
    ...townFacilitySpawnCandidates(locationKey),
    ...(locationDestination ? [locationDestination] : []),
    ...(squareDestination ? [squareDestination] : []),
  ];
}

function createMbtiAgentInGame(
  game: Parameters<typeof Player.join>[0],
  now: number,
  args: { name: string; character: string; identity: string; profile?: string; plan: string },
) {
  const playerId = Player.join(game, now, args.name, args.character, args.profile ?? args.identity);
  const agentId = game.allocId('agents');
  game.world.agents.set(
    agentId,
    new Agent({
      id: agentId,
      playerId,
      inProgressOperation: undefined,
      lastConversation: undefined,
      lastInviteAttempt: undefined,
      toRemember: undefined,
    }),
  );
  game.agentDescriptions.set(
    agentId,
    new AgentDescription({
      agentId,
      identity: args.identity,
      plan: args.plan,
    }),
  );
  return { agentId, playerId };
}

function createMbtiBackgroundPlayerInGame(
  game: Parameters<typeof Player.join>[0],
  now: number,
  args: { name: string; character: string; identity: string; profile?: string },
  index: number,
) {
  const playerId = Player.join(game, now, args.name, args.character, args.profile ?? args.identity);
  const player = game.world.players.get(playerId);
  const destination = backgroundDestination(game, playerId, index);
  if (player && destination) {
    player.position = destination;
  }
  return { playerId };
}

function placeAtSceneAnchor(
  game: Parameters<typeof Player.join>[0],
  now: number,
  playerId: ReturnType<typeof Player.join>,
  locationKey?: string,
) {
  const player = game.world.players.get(playerId);
  if (!player) {
    return;
  }
  const layoutCandidates = townFacilitySpawnCandidates(locationKey);
  const layoutDestination = layoutCandidates.find((candidate) => !blocked(game, now, candidate, player.id));
  if (layoutDestination) {
    player.position = layoutDestination;
    delete player.pathfinding;
    return;
  }
  const anchorsByLocation: Record<string, Array<{ x: number; y: number }>> = {
    cafe: [
      { x: 8, y: 17 },
      { x: 8, y: 19 },
      { x: 10, y: 17 },
    ],
    square: [
      { x: 17, y: 24 },
      { x: 19, y: 24 },
      { x: 17, y: 26 },
    ],
    clinic: [
      { x: 39, y: 27 },
      { x: 36, y: 27 },
      { x: 36, y: 25 },
    ],
    school: [
      { x: 38, y: 18 },
      { x: 39, y: 18 },
      { x: 36, y: 18 },
    ],
    riverside: [
      { x: 20, y: 24 },
      { x: 36, y: 22 },
      { x: 36, y: 27 },
    ],
    hallway: [
      { x: 5, y: 24 },
      { x: 14, y: 24 },
      { x: 15, y: 31 },
    ],
    workshop: [
      { x: 8, y: 29 },
      { x: 8, y: 27 },
      { x: 12, y: 29 },
    ],
    office: [
      { x: 36, y: 13 },
      { x: 36, y: 16 },
      { x: 39, y: 13 },
    ],
  };
  const fallback = anchorsByLocation.square;
  const anchors = locationKey ? (anchorsByLocation[locationKey] ?? fallback) : fallback;
  const destination = anchors.find((candidate) => !blocked(game, now, candidate, player.id));
  if (destination) {
    player.position = destination;
    delete player.pathfinding;
  }
}

function placeNear(
  game: Parameters<typeof Player.join>[0],
  now: number,
  anchorPlayerId: ReturnType<typeof Player.join>,
  targetPlayerId: ReturnType<typeof Player.join>,
  preferredIndex = 0,
) {
  const anchor = game.world.players.get(anchorPlayerId);
  const target = game.world.players.get(targetPlayerId);
  if (!anchor || !target) {
    return;
  }
  const base = {
    x: Math.floor(anchor.position.x),
    y: Math.floor(anchor.position.y),
  };
  const candidates = [
    { x: base.x + 1, y: base.y },
    { x: base.x - 1, y: base.y },
    { x: base.x, y: base.y + 1 },
    { x: base.x, y: base.y - 1 },
    { x: base.x + 1, y: base.y + 1 },
    { x: base.x - 1, y: base.y + 1 },
    { x: base.x + 1, y: base.y - 1 },
    { x: base.x - 1, y: base.y - 1 },
    { x: base.x + 2, y: base.y },
    { x: base.x - 2, y: base.y },
    { x: base.x, y: base.y + 2 },
    { x: base.x, y: base.y - 2 },
    { x: base.x + 2, y: base.y + 1 },
    { x: base.x - 2, y: base.y + 1 },
    { x: base.x + 2, y: base.y - 1 },
    { x: base.x - 2, y: base.y - 1 },
  ];
  const orderedCandidates = [
    ...candidates.slice(preferredIndex),
    ...candidates.slice(0, preferredIndex),
  ];
  const destination = orderedCandidates.find((candidate) => !blocked(game, now, candidate, target.id));
  if (destination) {
    target.position = destination;
    target.facing = { dx: -anchor.facing.dx, dy: -anchor.facing.dy };
    delete target.pathfinding;
  }
}

function eventDestinationOffset(index: number) {
  const offsets = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  return offsets[index % offsets.length];
}

function backgroundDestination(
  game: Parameters<typeof Player.join>[0],
  playerId: ReturnType<typeof Player.join>,
  index: number,
) {
  const player = game.world.players.get(playerId);
  if (!player) {
    return undefined;
  }
  const candidates = townRoadPoints();
  const orderedCandidates = [
    ...candidates.slice(index % candidates.length),
    ...candidates.slice(0, index % candidates.length),
  ];
  return firstReachableDestination(game, Date.now(), player, orderedCandidates);
}

function firstReachableDestination(
  game: Parameters<typeof Player.join>[0],
  now: number,
  player: Player,
  candidates: Point[],
) {
  return candidates.find((candidate) => canReachExactDestination(game, now, player, candidate));
}

function uniquePoints(points: Point[]) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

const MBTI_FOCUS_CONVERSATION_GRACE_MS = 60 * 1000;

function isRecentConversation(conversation: Conversation, now: number) {
  const lastActiveAt = conversation.lastMessage?.timestamp ?? conversation.created;
  return conversation.numMessages > 0 && now - lastActiveAt < MBTI_FOCUS_CONVERSATION_GRACE_MS;
}
