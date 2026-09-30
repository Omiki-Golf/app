import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/services/messageService.ts", import.meta.url),
  "utf8",
);
function service(mock, storage = new Map(), browser = {}) {
  const exports = {};
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "exports", "navigator", js)(
    (name) =>
      name.includes("supabaseClient")
        ? { supabase: mock }
        : {
            safeStorage: {
              getItem: (k) => storage.get(k),
              setItem: (k, v) => storage.set(k, v),
            },
          },
    exports,
    browser,
  );
  return exports.messageService;
}

test("Web Locks shares mailbox provisioning, retries failures and rejects an identity change", async () => {
  const storage = new Map();
  let identity = null, registrations = 0, locks = 0, inboxCalls = 0;
  let release;
  let gate = new Promise(resolve => { release = resolve; });
  const api = service({
    auth: { getSession: async () => ({ data: { session: identity ? { user: { id: identity } } : null } }) },
    functions: { invoke: async (_, { body }) => {
      if (body.action === 'register') {
        registrations++;
        await gate;
        return registrations === 1 ? { error: new Error('network') } : { data: { id: 'box' } };
      }
      inboxCalls++;
      return { data: { messages: [], total: 0, unread: 0 } };
    } },
  }, storage, { locks: { request: async (name, callback) => {
    assert.equal(name, 'golf-express-message-box');
    locks++;
    return callback();
  } } });
  const failures = [assert.rejects(api.inbox(null), /buzón/), assert.rejects(api.inbox(null), /buzón/)];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(registrations, 1);
  release();
  await Promise.all(failures);
  const original = JSON.parse([...storage.values()][0]).secret;
  gate = new Promise(resolve => { release = resolve; });
  const changed = assert.rejects(api.inbox(null), /sesión ha cambiado/);
  await new Promise(resolve => setImmediate(resolve));
  identity = 'player';
  release();
  await changed;
  assert.equal(inboxCalls, 0);
  identity = null;
  const result = await api.inbox(null);
  assert.equal(result.boxId, 'box');
  assert.equal(registrations, 2);
  assert.equal(locks, 3);
  assert.equal(JSON.parse([...storage.values()][0]).secret, original);
});

test("group composer keeps group selection and sender scope separate from resolved recipients", async () => {
  const calls = [];
  const api = service({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: {} };
    },
  });
  const draft = {
    id: "message",
    title: "Aviso",
    body: "Texto",
    revision: 2,
    recipient_selection: [
      { kind: "group_admins", id: "group", label: "Admins" },
    ],
    recipients: [{ kind: "user", id: "member", label: "Member" }],
  };
  await api.save(draft, "group");
  assert.deepEqual(calls[0], {
    name: "save_message_v2",
    args: {
      p_id: "message",
      p_title: "Aviso",
      p_body: "Texto",
      p_revision: 2,
      p_group: "group",
      p_selection: [{ kind: "group_admins", id: "group" }],
    },
  });
  await api.save(draft);
  assert.equal(calls[1].args.p_group, null);
  await api.groups("AMIGOS", true);
  await api.groupRecipients("group", "nick");
  await api.groupList("group", 1);
  await api.groupDetail("message");
  assert.deepEqual(calls.slice(2), [
    {
      name: "message_groups",
      args: { p_search: "AMIGOS", p_managed_only: true },
    },
    {
      name: "group_message_recipients",
      args: { p_group: "group", p_search: "nick" },
    },
    { name: "list_group_messages", args: { p_group: "group", p_page: 1 } },
    { name: "get_group_message", args: { p_id: "message" } },
  ]);
});
test("message requests use only the expected tab identity, never fall back to Express on account errors", async () => {
  let identity = "player",
    fail = false;
  const calls = [];
  const api = service({
    auth: {
      getSession: async () => ({
        data: { session: identity ? { user: { id: identity } } : null },
      }),
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: { messages: [], total: 0, unread: 0 },
        error: fail ? new Error("network") : null,
      };
    },
    functions: {
      invoke: async () => {
        throw new Error("must not access Express");
      },
    },
  });
  await api.inbox("player");
  await api.open("player", "delivery");
  assert.deepEqual(calls, [
    { name: "my_message_inbox", args: { p_page: 0 } },
    { name: "my_message_open", args: { p_delivery: "delivery" } },
  ]);
  identity = "another";
  await assert.rejects(api.inbox("player"), /sesión ha cambiado/);
  await assert.rejects(api.inbox(null), /sesión ha cambiado/);
  identity = "player";
  fail = true;
  await assert.rejects(api.inbox("player"), /network/);
  assert.equal(calls.length, 3);
});
test("Express provisioning persists its independent secret before retry and never migrates a box on login", async () => {
  const storage = new Map(),
    calls = [];
  let fail = true,
    identity = null;
  const mock = {
    auth: {
      getSession: async () => ({
        data: { session: identity ? { user: { id: identity } } : null },
      }),
    },
    rpc: async () => ({ data: { total: 0, unread: 0, messages: [] } }),
    functions: {
      invoke: async (name, { body }) => {
        calls.push({ name, body });
        assert.equal(name, "express-messages");
        assert.match(body.secret, /^[0-9a-f]{64}$/);
        if (body.action === "register") {
          if (fail) {
            fail = false;
            return { error: new Error("lost response") };
          }
          return { data: { id: "11111111-1111-4111-8111-111111111111" } };
        }
        return { data: { total: 0, unread: 0, messages: [] } };
      },
    },
  };
  let api = service(mock, storage);
  await assert.rejects(api.inbox(null), /buzón/);
  const original = JSON.parse([...storage.values()][0]);
  assert.match(original.secret, /^[0-9a-f]{64}$/);
  assert.equal(original.id, undefined);
  api = service(mock, storage);
  const inbox = await api.inbox(null);
  assert.equal(calls[0].body.secret, calls[1].body.secret);
  assert.equal(inbox.boxId, "11111111-1111-4111-8111-111111111111");
  const before = calls.length;
  identity = "player";
  await api.inbox("player");
  assert.equal(calls.length, before);
  identity = null;
  await service(mock, storage).inbox(null);
  assert.equal(calls.at(-1).body.id, inbox.boxId);
  assert.equal(calls.filter((c) => c.body.action === "register").length, 2);
  storage.clear();
  await service(mock, storage).inbox(null);
  assert.notEqual(calls.at(-1).body.secret, original.secret);
});

test("Express endpoint hashes credentials and enforces limits before calling mailbox RPCs", async () => {
  const source = await readFile(
    new URL("../supabase/functions/express-messages/index.ts", import.meta.url),
    "utf8",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  let handler,
    limited = false;
  const limits = [],
    calls = [];
  class HttpError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  const shared = {
    HttpError,
    serve: (h) => {
      handler = h;
    },
    body: async (req) => req,
    uuidValue: (v) => {
      if (!/^[0-9a-f-]{36}$/.test(v)) throw new HttpError(400, "uuid");
      return v;
    },
    rateLimit: async (_, key, limit, seconds) => {
      limits.push({ key, limit, seconds });
      if (limited) throw new HttpError(429, "limit");
    },
  };
  new Function("require", "exports", js)(() => shared, {});
  const api = {
    service: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: "box" };
      },
    },
  };
  const secret = "a".repeat(64);
  assert.deepEqual(await handler({ action: "register", secret }, api), {
    id: "box",
  });
  assert.equal(limits.length, 4);
  assert.equal(calls[0].name, "register_message_box");
  assert.match(calls[0].args.p_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(calls[0].args.p_hash, secret);
  assert.equal(JSON.stringify(limits).includes(secret), false);
  assert.equal(JSON.stringify(calls).includes(secret), false);
  await assert.rejects(
    handler({ action: "inbox", secret: "bad" }, api),
    (e) => e.status === 401,
  );
  limited = true;
  await assert.rejects(
    handler({ action: "register", secret }, api),
    (e) => e.status === 429,
  );
  assert.equal(calls.length, 1);
});
