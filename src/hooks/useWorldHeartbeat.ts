import { useMutation, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { WORLD_HEARTBEAT_INTERVAL } from '../../convex/constants';

export function useWorldHeartbeat(worldIdOverride?: Id<'worlds'>) {
  const shouldUseDefaultWorld = !worldIdOverride;
  const worldStatus = useQuery(api.world.defaultWorldStatus, shouldUseDefaultWorld ? {} : 'skip');
  const worldId = worldIdOverride ?? worldStatus?.worldId;

  // Send a periodic heartbeat to our world to keep it alive.
  const heartbeat = useMutation(api.world.heartbeatWorld);
  useEffect(() => {
    const sendHeartBeat = () => {
      if (!worldId) {
        return;
      }
      // Don't send a heartbeat if we've observed one sufficiently close
      // to the present.
      if (shouldUseDefaultWorld && worldStatus && Date.now() - WORLD_HEARTBEAT_INTERVAL / 2 < worldStatus.lastViewed) {
        return;
      }
      void heartbeat({ worldId });
    };
    sendHeartBeat();
    const id = setInterval(sendHeartBeat, WORLD_HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
    // Rerun if the `worldId` changes but not `worldStatus`, since don't want to
    // resend the heartbeat whenever its last viewed timestamp changes.
  }, [worldId, shouldUseDefaultWorld, worldStatus?.lastViewed, heartbeat]);
}
