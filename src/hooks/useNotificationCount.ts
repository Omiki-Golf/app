import { useCallback, useEffect, useRef, useState } from "react";
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
  const refresh = useCallback(async () => {
    const request = ++version.current;
    const [messages, invitations, activity] = await Promise.allSettled([
      messageService.inbox(userId),
      userId ? userService.getInvitationCount(userId) : Promise.resolve(0),
      messageService.activity(activityScope, userId),
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
        invitations.status === "fulfilled"
          ? invitations.value
          : previous.id === userId
            ? previous.invitations
            : 0,
      activity:
        activity.status === 'fulfilled'
          ? activity.value.unread
          : previous.id === userId ? previous.activity : 0,
    }));
  }, [userId, activityScope.roundId, activityScope.groupId, activityScope.accessCode]);
  useEffect(() => {
    void refresh();
    const tick = () => void refresh();
    const timer = window.setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      // Invalidate asynchronous requests; this ref is a counter, not a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      version.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [refresh, refreshKey]);
  return {
    count: state.id === userId ? state.messages + state.invitations + state.activity : 0,
    refresh,
  };
}
