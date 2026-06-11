import clsx from 'clsx';
import { Doc, Id } from '../../convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MessageInput } from './MessageInput';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';
import { useEffect, useRef } from 'react';

function renderMessageText(text: string) {
  return text.split(/([（(][^（）()]+[）)])/g).map((part, index) => {
    const isSceneDescription =
      (part.startsWith('（') && part.endsWith('）')) ||
      (part.startsWith('(') && part.endsWith(')'));

    return (
      <span
        key={`${part}-${index}`}
        className={isSceneDescription ? 'text-brown-700/75' : 'text-black'}
      >
        {part}
      </span>
    );
  });
}

export function Messages({
  worldId,
  engineId,
  conversation,
  inConversationWithMe,
  humanPlayer,
  scrollViewRef,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  conversation:
    | { kind: 'active'; doc: Conversation }
    | { kind: 'archived'; doc: Doc<'archivedConversations'> };
  inConversationWithMe: boolean;
  humanPlayer?: Player;
  scrollViewRef: React.RefObject<HTMLDivElement>;
}) {
  const humanPlayerId = humanPlayer?.id;
  const descriptions = useQuery(api.world.gameDescriptions, { worldId });
  const messageResult = useQuery(api.messages.listMessagesWithContext, {
    worldId,
    conversationId: conversation.doc.id,
  });
  let currentlyTyping = conversation.kind === 'active' ? conversation.doc.isTyping : undefined;
  if (messageResult !== undefined && currentlyTyping) {
    if (messageResult.messages.find((m: { messageUuid: string }) => m.messageUuid === currentlyTyping!.messageUuid)) {
      currentlyTyping = undefined;
    }
  }
  const currentlyTypingName =
    currentlyTyping &&
    descriptions?.playerDescriptions.find((p: { playerId: string }) => p.playerId === currentlyTyping?.playerId)?.name;

  const scrollView = scrollViewRef.current;
  const isScrolledToBottom = useRef(false);
  useEffect(() => {
    if (!scrollView) return undefined;

    const onScroll = () => {
      isScrolledToBottom.current = !!(
        scrollView && scrollView.scrollHeight - scrollView.scrollTop - 50 <= scrollView.clientHeight
      );
    };
    scrollView.addEventListener('scroll', onScroll);
    return () => scrollView.removeEventListener('scroll', onScroll);
  }, [scrollView]);
  useEffect(() => {
    if (isScrolledToBottom.current) {
      scrollViewRef.current?.scrollTo({
        top: scrollViewRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messageResult, currentlyTyping]);

  if (messageResult === undefined) {
    return null;
  }
  if (messageResult.messages.length === 0 && !inConversationWithMe) {
    return null;
  }
  const conversationEventContext = messageResult.eventContext;
  const messageNodes: { time: number; node: React.ReactNode }[] = messageResult.messages.map((m: {
    _id: string;
    _creationTime: number;
    author: string;
    authorName: string;
    eventContext?: {
      eventId: string;
      title: string;
      text: string;
    };
    text: string;
  }) => {
    const node = (
      <div key={`message-block-${m._id}`}>
        <div key={`text-${m._id}`} className="mb-7 leading-snug">
          <div className="mb-2 flex gap-4 text-black">
            <span className="uppercase flex-grow">{m.authorName}</span>
            <time dateTime={m._creationTime.toString()}>
              {new Date(m._creationTime).toLocaleString()}
            </time>
          </div>
          <div className={clsx('bubble', m.author === humanPlayerId && 'bubble-mine')}>
            <p className="bg-white -mx-3 -my-1 leading-snug">{renderMessageText(m.text)}</p>
          </div>
        </div>
      </div>
    );
    return { node, time: m._creationTime };
  });
  const lastMessageTs = messageResult.messages
    .map((m: { _creationTime: number }) => m._creationTime)
    .reduce((a: number, b: number) => Math.max(a, b), 0);

  const membershipNodes: typeof messageNodes = [];
  if (conversation.kind === 'active') {
    for (const [playerId, m] of conversation.doc.participants) {
      const playerName = descriptions?.playerDescriptions.find((p: { playerId: string }) => p.playerId === playerId)
        ?.name;
      let started;
      if (m.status.kind === 'participating') {
        started = m.status.started;
      }
      if (started) {
        membershipNodes.push({
          node: (
            <div key={`joined-${playerId}`} className="mb-7 leading-snug">
              <p className="text-center text-brown-700/80">{playerName} 加入了对话。</p>
            </div>
          ),
          time: started,
        });
      }
    }
  } else {
    for (const playerId of conversation.doc.participants) {
      const playerName = descriptions?.playerDescriptions.find((p: { playerId: string }) => p.playerId === playerId)
        ?.name;
      const started = conversation.doc.created;
      membershipNodes.push({
        node: (
          <div key={`joined-${playerId}`} className="mb-7 leading-snug">
            <p className="text-center text-brown-700/80">{playerName} 加入了对话。</p>
          </div>
        ),
        time: started,
      });
    }
  }
  const nodes = [...messageNodes, ...membershipNodes];
  nodes.sort((a, b) => a.time - b.time);
  return (
    <div className="chats text-lg">
      <div className="bg-brown-200 p-3 text-black">
        {conversationEventContext && (
          <div className="mb-7 leading-snug">
            <div className="chat-event-context">
              <strong>{conversationEventContext.title}</strong>
              <p>{conversationEventContext.text}</p>
            </div>
          </div>
        )}
        {nodes.length > 0 && nodes.map((n) => n.node)}
        {currentlyTyping && currentlyTyping.playerId !== humanPlayerId && (
          <div key="typing" className="mb-7 leading-snug">
            <div className="mb-2 flex gap-4 text-black">
              <span className="uppercase flex-grow">{currentlyTypingName}</span>
              <time dateTime={currentlyTyping.since.toString()}>
                {new Date(currentlyTyping.since).toLocaleString()}
              </time>
            </div>
            <div className={clsx('bubble')}>
              <p className="bg-white -mx-3 -my-1 leading-snug">
                <i className="text-brown-700/75">正在输入...</i>
              </p>
            </div>
          </div>
        )}
        {humanPlayer && inConversationWithMe && conversation.kind === 'active' && (
          <MessageInput
            worldId={worldId}
            engineId={engineId}
            conversation={conversation.doc}
            humanPlayer={humanPlayer}
          />
        )}
        {messageResult.eventBehaviors.length > 0 && (
          <div className="mb-7 leading-snug">
            <div className="chat-event-context chat-event-followup">
              <span>事件后的用户行为</span>
              {messageResult.eventBehaviors.map((behavior: { createdAt: number; text: string }) => (
                <p key={`${behavior.createdAt}-${behavior.text}`}>
                  {behavior.text}
                  <time className="ml-2 text-xs text-brown-700/60" dateTime={behavior.createdAt.toString()}>
                    {new Date(behavior.createdAt).toLocaleTimeString()}
                  </time>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
