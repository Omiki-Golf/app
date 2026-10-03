import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function compile(source, mocks = {}) {
  const exports = {};
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  new Function("require", "exports", js)(
    (name) => mocks[name] ?? require(name),
    exports,
  );
  return exports;
}
test("effective plans: active, expired, indefinite and Express fallback", async () => {
  const { effectivePlan } = compile(
    await readFile(
      new URL("../src/utils/effectivePlan.ts", import.meta.url),
      "utf8",
    ),
  );
  const now = Date.parse("2026-09-11T12:00:00Z");
  assert.equal(effectivePlan(null, now), "express");
  assert.equal(
    effectivePlan(
      { plan_type: "player", status: "active", current_period_end: "2026-09-01", team_trial_ends_at: "2026-09-20" },
      now,
    ),
    "team",
  );
  assert.equal(
    effectivePlan(
      { plan_type: "player", status: "active", current_period_end: "2026-10-01", team_trial_ends_at: "2026-09-11T12:00:00Z" },
      now,
    ),
    "player",
  );
  for (const plan_type of ["player", "team", "premium"]) {
    assert.equal(
      effectivePlan(
        { plan_type, status: "active", current_period_end: null },
        now,
      ),
      plan_type,
    );
    assert.equal(
      effectivePlan(
        { plan_type, status: "active", current_period_end: "2026-10-01" },
        now,
      ),
      plan_type,
    );
    assert.equal(
      effectivePlan(
        {
          plan_type,
          status: "active",
          current_period_end: "2026-09-11T12:00:00Z",
        },
        now,
      ),
      "express",
    );
    assert.equal(
      effectivePlan(
        { plan_type, status: "cancelled", current_period_end: null },
        now,
      ),
      "express",
    );
  }
  assert.equal(
    effectivePlan({ plan_type: "express", status: "active" }, now),
    "express",
  );
});
test("write controls disable native buttons and forms while keeping cancellation/navigation separate", async () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  let blocked = true;
  const { WriteButton, WriteForm } = compile(
    await readFile(
      new URL("../src/context/ReadOnlyContext.tsx", import.meta.url),
      "utf8",
    ),
    {
      react: { ...React, useContext: () => blocked },
      "../services/userRestriction": {},
      "./AuthContext": {},
    },
  );
  assert.match(
    renderToStaticMarkup(
      React.createElement(WriteButton, { children: "Guardar" }),
    ),
    /disabled=""/,
  );
  assert.match(
    renderToStaticMarkup(
      React.createElement(WriteForm, {
        children: React.createElement("input"),
      }),
    ),
    /<fieldset[^>]*disabled=""/,
  );
  blocked = false;
  assert.doesNotMatch(
    renderToStaticMarkup(
      React.createElement(WriteButton, { children: "Guardar" }),
    ),
    /disabled=""/,
  );
  assert.match(
    renderToStaticMarkup(
      React.createElement(WriteButton, { disabled: true, children: "Guardar" }),
    ),
    /disabled=""/,
  );
});
