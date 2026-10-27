import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { messageService } from "../services/messageService";
import { userService } from "../services/userService";
export function useNotificationCount(
  userId: string | null,
  refreshKey: string,
  activityScope: import('../services/messageService').ActivityScope,
) {
  const [state, setState] = useState({
    id: userId,
    messages: 0,
    invitations: 0,
    activity: 0,
  });
  const version = useRef(0);
  const stableActivityScope = useMemo(() => ({
    roundId: activityScope.roundId,
    groupId: activityScope.groupId,
    accessCode: activityScope.accessCode,
  }), [activityScope.roundId, activityScope.groupId, activityScope.accessCode]);
  const invalidatePendingRefresh = useCallback(() => {
    version.current++;
  }, []);
  const refresh = useCallback(async () => {
    const request = ++version.current;
    const [messages, invitations, quickRounds, activity] = await Promise.allSettled([
      messageService.inbox(userId),
      userId ? userService.getInvitationCount(userId) : Promise.resolve(0),
      userId ? userService.getQuickRoundInvitationCount() : Promise.resolve(0),
      messageService.activity(stableActivityScope, userId),
    ]);
    if (request !== version.current) return;
    setState((previous) => ({
      id: userId,
      messages:
        messages.status === "fulfilled"
          ? messages.value.unread
          : previous.id === userId
            ? previous.messages
            : 0,
      invitations:
        invitations.status === "fulfilled" && quickRounds.status === "fulfilled"
          ? invitations.value + quickRounds.value
          : previous.id === userId
            ? previous.invitations
            : 0,
      activity:
        activity.status === 'fulfilled'
          ? activity.value.unread
          : previous.id === userId ? previous.activity : 0,
    }));
  }, [userId, stableActivityScope]);
  useEffect(() => {
    void refresh();
    const tick = () => void refresh();
    const timer = window.setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      invalidatePendingRefresh();
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [refresh, refreshKey, invalidatePendingRefresh]);
  return {
    count: state.id === userId ? state.messages + state.invitations + state.activity : 0,
    refresh,
  };
}
