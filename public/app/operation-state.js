export function createOperationManager() {
  const active = new Map();

  function cancel(kind) {
    active.get(kind)?.controller.abort();
    active.delete(kind);
  }

  return {
    start(kind, projectId) {
      cancel(kind);
      const operation = { projectId, controller: new AbortController() };
      active.set(kind, operation);
      return operation;
    },
    isCurrent(kind, operation, projectId) {
      return Boolean(operation) && active.get(kind) === operation &&
        operation.projectId === projectId &&
        !operation.controller.signal.aborted;
    },
    finish(kind, operation) {
      if (active.get(kind) !== operation) return false;
      active.delete(kind);
      return true;
    },
    cancel,
    cancelAll() {
      for (const kind of active.keys()) cancel(kind);
    },
  };
}
