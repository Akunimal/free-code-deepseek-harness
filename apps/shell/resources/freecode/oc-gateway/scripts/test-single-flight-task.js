'use strict';

const assert = require('node:assert/strict');
const { createSingleFlightAbortableTask } = require('./single-flight-task');

async function main() {
  let started = 0;
  let aborted = false;
  let release;
  const task = createSingleFlightAbortableTask(({ signal }) => {
    started++;
    signal.addEventListener('abort', () => { aborted = true; }, { once: true });
    return new Promise(resolve => { release = resolve; });
  }, { timeoutMs: 500 });

  const first = task.start();
  const second = task.start();
  assert.equal(first, second);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started, 1);
  task.cancel(new Error('test cancellation'));
  assert.equal(aborted, true);
  assert.equal(task.start(), first, 'an aborted worker remains single-flight until it settles');
  release('done');
  assert.equal(await first, 'done');
  assert.equal(task.active, false);

  const timeoutTask = createSingleFlightAbortableTask(({ signal }) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve('aborted'), { once: true });
  }), { timeoutMs: 20 });
  assert.equal(await timeoutTask.start(), 'aborted');
  assert.equal(timeoutTask.active, false);
  console.log('PASS harvest-style work is single-flight, cancellable, and time-bounded');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
