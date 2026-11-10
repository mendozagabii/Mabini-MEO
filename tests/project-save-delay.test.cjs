// Verify the minimum delay without making the test suite wait in real time.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/project-save-delay.ts');
const mod = new Module(filename, module);
mod.filename = filename;
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);

test('project save delay lasts at least three seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finished = false;
  const promise = mod.exports.startProjectSaveDelay().then(() => { finished = true; });
  assert.equal(mod.exports.PROJECT_SAVE_MINIMUM_MS, 3000);
  t.mock.timers.tick(2999); await Promise.resolve();
  assert.equal(finished, false);
  t.mock.timers.tick(1); await promise;
  assert.equal(finished, true);
});
