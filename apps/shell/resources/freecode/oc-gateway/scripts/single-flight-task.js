'use strict';

function createSingleFlightAbortableTask(worker, { timeoutMs = 0 } = {}) {
  let current = null;
  return {
    start(...args) {
      if (current) return current.promise;
      const controller = new AbortController();
      const currentTask = { controller, timer: null, promise: null };
      currentTask.promise = Promise.resolve().then(() => worker({ signal: controller.signal, args })).finally(() => {
        if (currentTask.timer) clearTimeout(currentTask.timer);
        if (current === currentTask) current = null;
      });
      if (timeoutMs > 0) {
        currentTask.timer = setTimeout(() => {
          controller.abort(new Error('background task exceeded its time limit'));
        }, timeoutMs);
      }
      current = currentTask;
      return currentTask.promise;
    },
    cancel(reason = new Error('background task cancelled')) {
      current?.controller.abort(reason);
    },
    get active() {
      return current !== null;
    }
  };
}

module.exports = { createSingleFlightAbortableTask };
