import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// Server-render the real DEV toolbar with its server actions stubbed. Nothing
// here calls an action or touches a database.
const root = process.cwd();
const nativeRequireFromRoot = createRequire(path.join(root, "package.json"));
const React = nativeRequireFromRoot("react");
const { renderToStaticMarkup } = nativeRequireFromRoot("react-dom/server");

function loadToolbar({ expanded = false } = {}) {
  const actionCalls = [];
  const action = (name) => async () => { actionCalls.push(name); };
  const mocks = {
    "next/navigation": { usePathname: () => "/", useSearchParams: () => new URLSearchParams() },
    "next/link": { __esModule: true, default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) },
    "@/server/business-date/actions": { setDevBusinessDateAction: action("setDevBusinessDate"), clearDevBusinessDateAction: action("clearDevBusinessDate") },
    "@/server/gas/actions": { completeGasReadingsAction: action("completeGasReadings"), addGasSupplierBillAction: action("addGasSupplierBill") },
    "@/server/water/actions": { addCommonWaterBillAction: action("addCommonWaterBill"), completeWaterReadingsAction: action("completeWaterReadings") },
    "@/server/dev-test-session/actions": {
      startDevTestSessionAction: action("startDevTestSession"),
      resetDevTestSessionAction: action("resetDevTestSession"),
      resetDevMonthlyObligationApprovalAction: action("resetDevMonthlyObligationApproval"),
      runMonthlyObligationPulseAction: action("runMonthlyObligationPulse"),
    },
    "@/server/charges/actions": { addUnitChargeAction: action("addUnitCharge") },
    // The toolbar owns exactly one piece of local state: whether it is expanded.
    react: expanded ? { ...React, useState: () => [true, () => {}] } : React,
  };
  const filename = path.join(root, "components/dev-tools.tsx");
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const nativeRequire = createRequire(filename);
  const require = (specifier) => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.startsWith("@/")) throw new Error(`Unmocked module: ${specifier}`);
    return nativeRequire(specifier);
  };
  runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, loaded, loaded.exports);
  return { DevToolsToolbar: loaded.exports.DevToolsToolbar, actionCalls };
}

function render({ nodeEnv = "development", expanded = false } = {}) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  try {
    const { DevToolsToolbar, actionCalls } = loadToolbar({ expanded });
    return { html: renderToStaticMarkup(React.createElement(DevToolsToolbar, { dashboardFacts: null })), actionCalls };
  } finally {
    process.env.NODE_ENV = previous;
  }
}

test("DEV tools render collapsed, docked top-right, without taking layout space", () => {
  const { html, actionCalls } = render();
  assert.match(html, /^<div class="pointer-events-none fixed right-3 top-3 z-\[10000\] flex flex-col items-end">/);
  assert.match(html, /<button type="button" aria-expanded="false" aria-controls="tb810-dev-panel"[^>]*>Dev<\/button>/);
  assert.match(html, /<div id="tb810-dev-panel" hidden=""/);
  assert.deepEqual(actionCalls, [], "rendering must not invoke DEV actions");
});

test("the collapsed panel keeps every existing tab and control mounted", () => {
  const { html } = render();
  for (const tab of ["Time", "Data", "Style"]) assert.match(html, new RegExp(`>${tab}</button>`));
  assert.match(html, /aria-label="Collapse DEV tools"/);
  assert.match(html, /name="business_date"/);
});

test("the expanded panel opens below the DEV control, right-aligned and internally scrollable", () => {
  const { html, actionCalls } = render({ expanded: true });
  assert.match(html, /aria-expanded="true"/);
  assert.doesNotMatch(html, /id="tb810-dev-panel" hidden/);
  const panel = html.match(/<div id="tb810-dev-panel" class="([^"]+)"/);
  assert.ok(panel, "panel rendered");
  for (const className of ["mt-2", "max-h-[calc(100dvh-4.5rem)]", "max-w-[calc(100vw-24px)]", "overflow-y-auto", "pointer-events-auto"]) {
    assert.ok(panel[1].split(" ").includes(className), `panel has ${className}`);
  }
  assert.deepEqual(actionCalls, []);
});

test("DEV tools stay development-only", () => {
  assert.equal(render({ nodeEnv: "production" }).html, "");
});
