import { supabase } from "./supabaseClient";
import { safeStorage } from "../utils/safeStorage";
export interface Recipient {
  kind: "user" | "express";
  id: string;
  label: string;
}
export interface MessageGroup {
  id: string;
  name: string;
  group_code: string;
  member_count: number;
  admin_count: number;
}
export interface MessageTarget {
  kind: "user" | "express" | "group" | "group_admins";
  id: string;
  label: string;
}
export interface MessageDraft {
  recipient_selection?: MessageTarget[];
  sender_kind?: "app" | "group";
  source_group_id?: string | null;
  sender_label?: string;
  id: string;
  title: string;
  body: string;
  status: "draft" | "sent";
  revision: number;
  recipients: Recipient[];
  author_alias: string;
  sent_by_alias?: string | null;
  created_at: string;
  sent_at: string | null;
  deliveries?: {
    id: string;
    recipient_label: string;
    recipient_id: string;
    kind: string;
    read_at: string | null;
  }[];
}
export interface MessageSummary {
  sender_kind?: "app" | "group";
  source_group_id?: string | null;
  sender_label?: string;
  id: string;
  title: string;
  status: "draft" | "sent";
  author_alias: string;
  sent_by_alias?: string | null;
  created_at: string;
  sent_at: string | null;
  recipient_count: number;
  read_count: number;
}
export interface InboxItem {
  sender_label?: string;
  id: string;
  title: string;
  sent_at: string;
  read_at: string | null;
  body?: string;
}
export interface Inbox {
  messages: InboxItem[];
  total: number;
  unread: number;
}
export interface ActivityEvent {
  id: string;
  round_id: string;
  group_id: string | null;
  event_type: 'hole_in_one' | 'no_paso_rojas' | 'spanish_hands';
  player_name: string;
  hole_number: number;
  created_at: string;
}
export interface ActivityInbox { events: ActivityEvent[]; unread: number; server_time: string; }
export interface ActivityScope { roundId?: string | null; groupId?: string | null; accessCode?: string | null; }
async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
const boxKey = "golf.express.message-box.v1";
const activityCursorPrefix = 'omiki.activity.cursor.';
interface Box {
  secret: string;
  id?: string;
}
let opening: Promise<Box> | null = null;
async function express<T>(input: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("express-messages", {
    body: input,
  });
  if (error)
    throw new Error("No se pudo acceder al buzón. Inténtalo de nuevo.");
  return data as T;
}
async function prepareBox(): Promise<Box> {
  let box: Box | undefined;
  try {
    const saved = JSON.parse(safeStorage.getItem(boxKey) || "null");
    if (saved && /^[0-9a-f]{64}$/.test(saved.secret)) box = saved;
  } catch {
    /* Invalid local data is not a valid credential. */
  }
  if (!box) {
    box = {
      secret: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    };
    safeStorage.setItem(boxKey, JSON.stringify(box));
  }
  if (!box.id) {
    const result = await express<{ id: string }>({
      action: "register",
      secret: box.secret,
    });
    box.id = result.id;
    safeStorage.setItem(boxKey, JSON.stringify(box));
  }
  return box;
}
async function getBox(): Promise<Box> {
  if (!opening) {
    // Await inside an async function to flatten the Web Locks callback result.
    // Older DOM typings describe it as Promise<Promise<Box>>.
    opening = (async () =>
      "locks" in navigator
        ? await navigator.locks.request("golf-express-message-box", prepareBox)
        : prepareBox()
    )().finally(() => {
      opening = null;
    });
  }
  return opening;
}
// Check the caller's expected identity rather than falling back from a failed
// registered request to an Express mailbox belonging to this browser.
async function assertIdentity(userId: string | null) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || (session?.user.id ?? null) !== userId)
    throw new Error("La sesión ha cambiado. Actualiza la pantalla.");
}
export const messageService = {
  async activity(scope: ActivityScope, userId: string | null, markRead = false): Promise<ActivityInbox> {
    if (!scope.roundId && !scope.groupId) return { events: [], unread: 0, server_time: new Date().toISOString() };
    await assertIdentity(userId);
    const scopeKey = `${scope.groupId ? 'group' : 'round'}.${scope.groupId || scope.roundId}`;
    const localCursor = userId ? null : safeStorage.getItem(activityCursorPrefix + scopeKey);
    const result = await rpc<ActivityInbox>('round_activity_inbox', {
      p_round: scope.roundId || null,
      p_group: scope.groupId || null,
      p_access_code: scope.accessCode || null,
      p_since: localCursor,
      p_mark_read: markRead,
    });
    if (markRead && !userId) safeStorage.setItem(activityCursorPrefix + scopeKey, result.server_time);
    return markRead ? { ...result, unread: 0 } : result;
  },
  groups: (search = "", managedOnly = false) =>
    rpc<MessageGroup[]>("message_groups", {
      p_search: search,
      p_managed_only: managedOnly,
    }),
  recipients: (search: string) =>
    rpc<Recipient[]>("admin_message_recipients", { p_search: search }),
  list: (page = 0) =>
    rpc<{ messages: MessageSummary[]; total: number }>("admin_list_messages", {
      p_page: page,
    }),
  detail: (id: string) => rpc<MessageDraft>("admin_get_message", { p_id: id }),
  save: (draft: MessageDraft, groupId: string | null = null) =>
    rpc<MessageDraft>("save_message_v2", {
      p_id: draft.id,
      p_title: draft.title,
      p_body: draft.body,
      p_selection: (draft.recipient_selection ?? draft.recipients).map(
        ({ kind, id }) => ({ kind, id }),
      ),
      p_revision: draft.revision,
      p_group: groupId,
    }),
  send: (id: string, revision: number) =>
    rpc<MessageDraft>("send_message_v2", { p_id: id, p_revision: revision }),
  groupList: (groupId: string, page = 0) =>
    rpc<{ messages: MessageSummary[]; total: number }>("list_group_messages", {
      p_group: groupId,
      p_page: page,
    }),
  groupDetail: (id: string) =>
    rpc<MessageDraft>("get_group_message", { p_id: id }),
  groupRecipients: (groupId: string, search: string) =>
    rpc<Recipient[]>("group_message_recipients", {
      p_group: groupId,
      p_search: search,
    }),
  async inbox(
    userId: string | null,
    page = 0,
  ): Promise<Inbox & { boxId?: string }> {
    await assertIdentity(userId);
    if (userId) return rpc<Inbox>("my_message_inbox", { p_page: page });
    const box = await getBox();
    await assertIdentity(null);
    return {
      ...(await express<Inbox>({ action: "inbox", ...box, page })),
      boxId: box.id,
    };
  },
  async open(userId: string | null, id: string): Promise<InboxItem> {
    await assertIdentity(userId);
    if (userId) return rpc<InboxItem>("my_message_open", { p_delivery: id });
    const box = await getBox();
    await assertIdentity(null);
    return express<InboxItem>({ action: "open", ...box, delivery: id });
  },
};
