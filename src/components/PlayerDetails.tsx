import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Doc, Id } from '../../convex/_generated/dataModel';
import { SelectElement } from './Player';
import { Messages } from './Messages';
import { toastOnError } from '../toasts';
import { useSendInput } from '../hooks/sendInput';
import { Player } from '../../convex/aiTown/player';
import { GameId } from '../../convex/aiTown/ids';
import { ServerGame } from '../hooks/serverGame';
import { useEffect, useState } from 'react';
import { PlayerDescription } from '../../convex/aiTown/playerDescription';

type DetailTab = 'events' | 'profile' | 'thoughts' | 'chat';

const detailTabs: { id: DetailTab; label: string }[] = [
  { id: 'events', label: '事件记录' },
  { id: 'profile', label: '居民简介' },
  { id: 'thoughts', label: '内心独白' },
  { id: 'chat', label: '聊天记录' },
];

export default function PlayerDetails({
  worldId,
  engineId,
  game,
  playerId,
  setSelectedElement,
  scrollViewRef,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  playerId?: GameId<'players'>;
  setSelectedElement: SelectElement;
  scrollViewRef: React.RefObject<HTMLDivElement>;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>('profile');
  const [eventLimit, setEventLimit] = useState(10);
  const [conversationLimit, setConversationLimit] = useState(8);
  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId });

  const players = [...game.world.players.values()];
  const humanPlayer = players.find((p) => p.human === humanTokenIdentifier);
  const humanConversation = humanPlayer ? game.world.playerConversation(humanPlayer) : undefined;
  // Default to the active conversation partner, but keep manual role switching available.
  if (!playerId && humanPlayer && humanConversation) {
    const otherPlayerIds = [...humanConversation.participants.keys()].filter(
      (p) => p !== humanPlayer.id,
    );
    playerId = otherPlayerIds[0];
  }

  const player = playerId && game.world.players.get(playerId);
  const playerConversation = player && game.world.playerConversation(player);

  const previousConversations = useQuery(
    api.world.previousConversations,
    playerId ? { worldId, playerId, limit: conversationLimit + 1 } : 'skip',
  );
  const innerThoughts = useQuery(
    api.thoughts.listForPlayer,
    playerId ? { worldId, playerId, limit: 6 } : 'skip',
  );
  const recentEvents = useQuery(
    api.events.listRecent,
    playerId ? { worldId, playerId, limit: eventLimit + 1 } : 'skip',
  );
  const visibleEvents = recentEvents?.slice(0, eventLimit);
  const hasMoreEvents = (recentEvents?.length ?? 0) > eventLimit;
  const visibleConversations = previousConversations?.slice(0, conversationLimit);
  const hasMoreConversations = (previousConversations?.length ?? 0) > conversationLimit;

  const playerDescription = playerId && game.playerDescriptions.get(playerId);
  const selectablePlayers = players
    .map((p) => ({ player: p, description: game.playerDescriptions.get(p.id) }))
    .filter(
      (entry): entry is { player: Player; description: PlayerDescription } =>
        entry.description !== undefined,
    );

  useEffect(() => {
    scrollViewRef.current?.scrollTo({ top: 0 });
    setEventLimit(10);
    setConversationLimit(8);
  }, [playerId, activeTab, scrollViewRef]);

  const startConversation = useSendInput(engineId, 'startConversation');
  const acceptInvite = useSendInput(engineId, 'acceptInvite');
  const rejectInvite = useSendInput(engineId, 'rejectInvite');
  const leaveConversation = useSendInput(engineId, 'leaveConversation');

  if (!playerId) {
    return (
      <div className="flex h-full flex-col justify-center gap-4 p-4 text-center text-xl">
        <p>选择一个智能体，查看关系、设定、内心独白和聊天记录。</p>
        <RoleSwitcher
          playerId={playerId}
          players={selectablePlayers}
          setSelectedElement={setSelectedElement}
        />
      </div>
    );
  }
  if (!player) {
    return null;
  }
  const isHumanMe = Boolean(humanPlayer && player.id === humanPlayer.id);
  const isUserProxy = playerDescription?.name === '我';
  const isMe = isHumanMe || isUserProxy;
  const canInvite = !isMe && !playerConversation && humanPlayer && !humanConversation;
  const sameConversation =
    !isMe &&
    humanPlayer &&
    humanConversation &&
    playerConversation &&
    humanConversation.id === playerConversation.id;

  const humanStatus =
    humanPlayer && humanConversation && humanConversation.participants.get(humanPlayer.id)?.status;
  const playerStatus = playerConversation && playerConversation.participants.get(playerId)?.status;

  const haveInvite = sameConversation && humanStatus?.kind === 'invited';
  const waitingForAccept =
    sameConversation && playerConversation.participants.get(playerId)?.status.kind === 'invited';
  const waitingForNearby =
    sameConversation && playerStatus?.kind === 'walkingOver' && humanStatus?.kind === 'walkingOver';

  const inConversationWithMe =
    sameConversation &&
    playerStatus?.kind === 'participating' &&
    humanStatus?.kind === 'participating';

  const onStartConversation = async () => {
    if (!humanPlayer || !playerId) {
      return;
    }
    console.log(`Starting conversation`);
    await toastOnError(startConversation({ playerId: humanPlayer.id, invitee: playerId }));
  };
  const onAcceptInvite = async () => {
    if (!humanPlayer || !humanConversation || !playerId) {
      return;
    }
    await toastOnError(
      acceptInvite({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  const onRejectInvite = async () => {
    if (!humanPlayer || !humanConversation) {
      return;
    }
    await toastOnError(
      rejectInvite({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  const onLeaveConversation = async () => {
    if (!humanPlayer || !inConversationWithMe || !humanConversation) {
      return;
    }
    await toastOnError(
      leaveConversation({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  // const pendingSuffix = (inputName: string) =>
  //   [...inflightInputs.values()].find((i) => i.name === inputName) ? ' opacity-50' : '';

  const pendingSuffix = (s: string) => '';
  return (
    <>
      <RoleSwitcher
        playerId={playerId}
        players={selectablePlayers}
        setSelectedElement={setSelectedElement}
      />
      {canInvite && (
        <a
          className={
            'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
            pendingSuffix('startConversation')
          }
          onClick={onStartConversation}
        >
          <div className="h-full bg-clay-700 text-center">
            <span>开始对话</span>
          </div>
        </a>
      )}
      {waitingForAccept && (
        <a className="mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto opacity-50">
          <div className="h-full bg-clay-700 text-center">
            <span>等待对方接受...</span>
          </div>
        </a>
      )}
      {waitingForNearby && (
        <a className="mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto opacity-50">
          <div className="h-full bg-clay-700 text-center">
            <span>正在走近...</span>
          </div>
        </a>
      )}
      {inConversationWithMe && (
        <a
          className={
            'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
            pendingSuffix('leaveConversation')
          }
          onClick={onLeaveConversation}
        >
          <div className="h-full bg-clay-700 text-center">
            <span>离开对话</span>
          </div>
        </a>
      )}
      {haveInvite && (
        <>
          <a
            className={
              'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
              pendingSuffix('acceptInvite')
            }
            onClick={onAcceptInvite}
          >
            <div className="h-full bg-clay-700 text-center">
              <span>接受</span>
            </div>
          </a>
          <a
            className={
              'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
              pendingSuffix('rejectInvite')
            }
            onClick={onRejectInvite}
          >
            <div className="h-full bg-clay-700 text-center">
              <span>拒绝</span>
            </div>
          </a>
        </>
      )}
      {!playerConversation && player.activity && player.activity.until > Date.now() && (
        <div className="box flex-grow mt-6">
          <h2 className="bg-brown-700 text-base sm:text-lg text-center">
            {player.activity.description}
          </h2>
        </div>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        {detailTabs.map((tab) => (
          <button
            key={tab.id}
            className={`border-4 border-brown-900 px-2 py-2 text-base shadow-solid ${
              activeTab === tab.id
                ? 'bg-brown-700 text-white'
                : 'bg-clay-700 text-brown-100 hover:bg-clay-500'
            }`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="desc my-5">
          <p className="leading-snug -m-4 bg-brown-700 text-lg">
            {playerDescription?.description || (isHumanMe ? <i>这是你。</i> : null)}
            {!isMe && inConversationWithMe && (
              <>
                <br />
                <br />(<i>正在和你对话。</i>)
              </>
            )}
          </p>
        </div>
      )}

      {activeTab === 'events' && (
        <DetailPanel title="事件记录">
          {recentEvents === undefined && <EmptyPanel>读取中...</EmptyPanel>}
          {visibleEvents && visibleEvents.length === 0 && (
            <EmptyPanel>还没有和该角色相关的事件。</EmptyPanel>
          )}
          {visibleEvents?.map((event: {
            _id: string;
            createdAt: number;
            title: string;
          }) => (
            <div key={event._id} className="mb-4 bg-white p-3 text-lg leading-snug last:mb-0">
              <strong className="block text-brown-900">{event.title}</strong>
              <time className="mt-1 block text-base text-brown-700" dateTime={event.createdAt.toString()}>
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </div>
          ))}
          {hasMoreEvents && (
            <button
              className="button mt-4 w-full border-4 border-brown-900 bg-clay-700 px-3 py-2 text-lg text-brown-100 shadow-solid hover:bg-clay-500"
              onClick={() => setEventLimit((limit) => limit + 10)}
              type="button"
            >
              加载更多事件
            </button>
          )}
        </DetailPanel>
      )}

      {activeTab === 'thoughts' && (
        <DetailPanel title="内心独白">
          {isMe && <EmptyPanel>这里不展示用户代理的自动内心，避免误认为是真实用户想法。</EmptyPanel>}
          {!isMe && innerThoughts === undefined && <EmptyPanel>读取中...</EmptyPanel>}
          {!isMe && innerThoughts && innerThoughts.length === 0 && (
            <EmptyPanel>还没有可观察的内心变化。</EmptyPanel>
          )}
          {!isMe &&
            innerThoughts?.map((thought: {
              _id: string;
              source: string;
              _creationTime: number;
              text: string;
            }) => (
              <div key={thought._id} className="mb-4 bg-white p-3 text-lg leading-snug last:mb-0">
                <div className="mb-2 flex gap-3 text-base text-brown-700">
                  <span className="flex-grow">{thought.source}</span>
                  <time dateTime={thought._creationTime.toString()}>
                    {new Date(thought._creationTime).toLocaleString()}
                  </time>
                </div>
                <p>{thought.text}</p>
              </div>
            ))}
        </DetailPanel>
      )}

      {activeTab === 'chat' && (
        <div className="mt-5">
          {!isHumanMe && playerConversation && playerStatus?.kind === 'participating' && (
            <DetailPanel title="正在对话">
              <Messages
                worldId={worldId}
                engineId={engineId}
                inConversationWithMe={inConversationWithMe ?? false}
                conversation={{ kind: 'active', doc: playerConversation }}
                humanPlayer={humanPlayer}
                scrollViewRef={scrollViewRef}
              />
            </DetailPanel>
          )}
          {isHumanMe && <EmptyPanel>这是你。选择其他智能体可以查看聊天记录。</EmptyPanel>}
          {!isHumanMe && previousConversations === undefined && <EmptyPanel>读取中...</EmptyPanel>}
          {!isHumanMe && !playerConversation && visibleConversations && visibleConversations.length === 0 && (
            <EmptyPanel>还没有聊天记录。</EmptyPanel>
          )}
          {!isHumanMe &&
            playerConversation &&
            playerStatus?.kind !== 'participating' &&
            visibleConversations?.length === 0 && <EmptyPanel>对话还在靠近或等待中，暂无消息。</EmptyPanel>}
          {!isHumanMe && visibleConversations && visibleConversations.length > 0 && (
            <ConversationHistoryList
              worldId={worldId}
              engineId={engineId}
              conversations={visibleConversations}
              hasMore={hasMoreConversations}
              humanPlayer={humanPlayer}
              onLoadMore={() => setConversationLimit((limit) => limit + 8)}
              scrollViewRef={scrollViewRef}
            />
          )}
        </div>
      )}
    </>
  );
}

type ArchivedConversationWithNames = Doc<'archivedConversations'> & {
  participantDescriptions: { playerId: string; name: string }[];
};

function ConversationHistoryList({
  worldId,
  engineId,
  conversations,
  hasMore,
  humanPlayer,
  onLoadMore,
  scrollViewRef,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  conversations: ArchivedConversationWithNames[];
  hasMore: boolean;
  humanPlayer?: Player;
  onLoadMore: () => void;
  scrollViewRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="space-y-5">
      {conversations.map((conversation, index) => (
        <DetailPanel
          key={conversation._id}
          title={`历史对话 ${index + 1} · ${conversation.participantDescriptions
            .map((p) => p.name)
            .join(' / ')}`}
        >
          <div className="mb-3 text-base text-brown-700">
            {new Date(conversation.created).toLocaleString()}，{conversation.numMessages} 条消息
          </div>
          <Messages
            worldId={worldId}
            engineId={engineId}
            inConversationWithMe={false}
            conversation={{ kind: 'archived', doc: conversation }}
            humanPlayer={humanPlayer}
            scrollViewRef={scrollViewRef}
          />
        </DetailPanel>
      ))}
      {hasMore && (
        <button
          className="button w-full border-4 border-brown-900 bg-clay-700 px-3 py-2 text-lg text-brown-100 shadow-solid hover:bg-clay-500"
          onClick={onLoadMore}
          type="button"
        >
          加载更多聊天
        </button>
      )}
    </div>
  );
}

function RoleSwitcher({
  playerId,
  players,
  setSelectedElement,
}: {
  playerId?: GameId<'players'>;
  players: { player: Player; description: PlayerDescription }[];
  setSelectedElement: SelectElement;
}) {
  return (
    <label className="mt-4 block text-base text-brown-100">
      <span className="mb-1 block text-brown-200">切换角色</span>
      <select
        className="w-full border-4 border-brown-900 bg-brown-200 px-3 py-2 text-lg text-brown-900"
        value={playerId ?? ''}
        onChange={(event) => {
          const nextPlayerId = event.target.value as GameId<'players'>;
          if (nextPlayerId) {
            setSelectedElement({ kind: 'player', id: nextPlayerId });
          }
        }}
      >
        <option value="" disabled>
          选择智能体
        </option>
        {players.map(({ player, description }) => (
          <option key={player.id} value={player.id}>
            {description.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="box my-5">
      <h2 className="bg-brown-700 py-1 text-center text-xl shadow-solid">{title}</h2>
      <div className="bg-brown-200 p-3 text-black">{children}</div>
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <p className="bg-white p-3 text-lg leading-snug text-brown-700">{children}</p>;
}
