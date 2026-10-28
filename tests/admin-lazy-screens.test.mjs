import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToString } from 'react-dom/server';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/components/admin/ApplicationGateway.tsx', import.meta.url), 'utf8');

test('all deferred screens retain named exports, loading fallbacks and props', async () => {
  for (const [source, name] of [[app, 'Statistics'], [app, 'QuickPlayStatistics'], [app, 'CareerStatistics'], [gateway, 'AdminPortal']]) {
    const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declaration = ast.statements.find(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => d.name.getText(ast) === name));
    assert.ok(declaration, name);
    let calls = 0;
    let resolve;
    let received;
    const context = vm.createContext({
      lazy: React.lazy,
      loadModule() { calls++; return new Promise(done => { resolve = done; }); },
    });
    const code = declaration.getText(ast).replace(/import\(/g, 'loadModule(') + `\nglobalThis.Screen = ${name};`;
    vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    assert.equal(calls, 0, 'declaring a screen must not download it');
    const back = () => {};
    const tree = React.createElement(React.Suspense, { fallback: React.createElement('p', { role: 'status' }, 'Cargando') }, React.createElement(context.Screen, { onBack: back, roundId: 'test-round' }));
    assert.match(renderToString(tree), /Cargando/);
    assert.equal(calls, 1);
    resolve({ [name]: props => { received = props; return React.createElement('p', null, name); } });
    await new Promise(done => setImmediate(done));
    assert.match(renderToString(tree), new RegExp(name));
    assert.equal(received.onBack, back);
    assert.equal(received.roundId, 'test-round');
    renderToString(tree);
    assert.equal(calls, 1, 'loaded modules are reused');
    // Each lazy component in its real screen tree must sit inside Suspense.
    let wrapped = false;
    function visit(node, inside = false) {
      const next = inside || (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'Suspense');
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === name) wrapped ||= next;
      ts.forEachChild(node, child => visit(child, next));
    }
    visit(ast);
    assert.equal(wrapped, true, name);
    assert.equal(ast.statements.some(s => ts.isImportDeclaration(s) && s.moduleSpecifier.text.endsWith('/' + name)), false);
  }
});

test('gateway downloads administration only after verifying an active administrator', () => {
  for (const kind of ['anonymous', 'player', 'disabled', 'invited', 'active', 'checking']) {
    let slot = 0;
    let loads = 0;
    const account = ['disabled', 'invited', 'active'].includes(kind) ? { user_id: 'user', status: kind } : null;
    const access = kind === 'checking' ? null : { id: 'user', account };
    const context = vm.createContext({
      React, Suspense: React.Suspense, lazy: React.lazy,
      loadModule() { loads++; return new Promise(() => {}); },
      useAuth: () => ({ user: kind === 'anonymous' ? null : { id: 'user' }, loading: false, logout() {} }),
      useState: initial => [slot++ === 0 ? access : initial, () => {}],
      useRef: value => ({ current: value }), useEffect() {}, useCallback: fn => fn,
      window: { location: { href: 'https://example.test/' } }, URL,
      ReadOnlyProvider: ({ children }) => children,
      App: () => React.createElement('p', null, 'Player app'),
      OmikiLoadingScreen: () => React.createElement('div', { role: 'status' }, 'Cargando…'),
      Auth: () => null, AdminPasswordSetup: () => null, NavigationButton: () => null,
    });
    const code = gateway.replace(/^import .*;\r?\n/gm, '').replace('export function ApplicationGateway', 'function ApplicationGateway').replace(/import\(/g, 'loadModule(') + '\nglobalThis.Gateway = ApplicationGateway;';
    vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context);
    const html = renderToString(context.Gateway());
    assert.equal(loads, kind === 'active' ? 1 : 0, kind);
    if (kind === 'active') assert.match(html, /Cargando administración/);
    if (kind === 'disabled') assert.match(html, /desactivada/);
    if (kind === 'checking') assert.match(html, /role="status"/);
  }
});
