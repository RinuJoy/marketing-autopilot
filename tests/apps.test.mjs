// Runs every app's adapter against its checked-out repository (skipped when the checkout isn't there).
import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { listApps, loadApp } from "../core/app.mjs";
import { run as check } from "../engines/check.mjs";

for (const name of await listApps()) {
  const app = await loadApp(name);
  const here = await access(app.src).then(() => true, () => false);
  test(`${name} setup is healthy`, { skip: !here && `no checkout at ${app.src}` }, async () => {
    const r = await check(app);
    assert.deepEqual(r.problems, []);
    assert.ok((await app.items()).length > 10);
  });
}
