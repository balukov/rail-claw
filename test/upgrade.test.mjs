import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseJsonTail,
  needsMigration,
  countAuthProfiles,
  dashboardFragment,
} from "../dist/upgrade.js";

const WARNING =
  "Installed Gateway service state and config paths could not be verified. Inspect the service environment with `openclaw gateway status --deep` before repairing plugin state.\n";

test("needsMigration: due when the marker is missing or differs, not when equal or version unknown", () => {
  assert.equal(needsMigration(null, "OpenClaw 2026.9.2 (3928bad)"), true);
  assert.equal(needsMigration("OpenClaw 2026.5.27", "OpenClaw 2026.9.2 (3928bad)"), true);
  assert.equal(needsMigration("OpenClaw 2026.9.2 (3928bad)\n", "OpenClaw 2026.9.2 (3928bad)"), false);
  assert.equal(needsMigration(null, ""), false);
});

test("countAuthProfiles: tolerates the CLI warning prefix and non-JSON output", () => {
  const one = WARNING + JSON.stringify({ agentId: "main", provider: "openai", profiles: [{ id: "openai:me@example.com" }] });
  const none = JSON.stringify({ agentId: "main", provider: null, profiles: [] });
  assert.equal(countAuthProfiles(one), 1);
  assert.equal(countAuthProfiles(none), 0);
  assert.equal(countAuthProfiles("models auth list requires a running gateway"), 0);
  assert.equal(parseJsonTail("no json here"), null);
});

test("dashboardFragment: returns the bootstrap fragment only when the token is present", () => {
  const ok = WARNING + JSON.stringify({
    ok: true,
    url: "http://127.0.0.1:18789/",
    browserUrl: "http://127.0.0.1:18789/#bootstrapToken=3D0l08uTl6G9nM4z&bootstrapProfile=owner",
    browserBootstrapExpiresAtMs: 1788674629285,
  });
  assert.equal(dashboardFragment(ok), "#bootstrapToken=3D0l08uTl6G9nM4z&bootstrapProfile=owner");
  assert.equal(dashboardFragment(JSON.stringify({ ok: true, browserUrl: "http://127.0.0.1:18789/" })), null);
  assert.equal(dashboardFragment("Gateway not reachable"), null);
});
