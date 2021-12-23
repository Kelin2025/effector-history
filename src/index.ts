import {
  Store,
  createEvent,
  createStore,
  combine,
  sample,
  guard,
  Clock,
} from 'effector';

export const createHistory = <T extends Record<string, Store<any>>>(params: {
  source: T;
  clock?: Clock<unknown>;
  maxLength: number;
}) => {
  const undo = createEvent();
  const redo = createEvent();
  const push = createEvent<T>();
  const clear = createEvent();

  const $history = createStore<T[]>([]);
  const $curIndex = createStore(-1);

  const $length = $history.map(history => history.length);
  const $canUndo = $curIndex.map(idx => idx > 0);
  const $canRedo = combine(
    $curIndex,
    $length,
    (idx, historyLength) => idx + 1 < historyLength
  );
  const $curRecord = combine(
    $history,
    $curIndex,
    (history, curIndex) => history[curIndex] || null
  );
  const $actualState = combine(params.source);

  // Push logic
  const pushed = sample({
    source: [$curIndex, $history],
    clock: push,
    fn: ([curIndex, history], record) => {
      return {
        curIndex,
        record,
        shouldPop: history.length >= params.maxLength,
      };
    },
  });

  $history.on(pushed, (prev, { curIndex, record, shouldPop }) => {
    const next = prev.slice(0, curIndex + 1);
    next.push(record);
    if (shouldPop) {
      next.pop();
    }
    return next;
  });

  $curIndex.on(pushed, (curIndex, { shouldPop }) =>
    shouldPop ? curIndex : curIndex + 1
  );

  // Undo logic
  const undoPassed = guard({
    source: $curIndex,
    clock: undo,
    filter: $canUndo,
  });

  $curIndex.on(undoPassed, idx => Math.max(0, idx - 1));

  // Redo logic
  const redoPassed = guard({
    source: [$curIndex, $length],
    clock: redo,
    filter: $canRedo,
  });

  $curIndex.on(redoPassed, idx => idx + 1);

  // Clear logic
  $curIndex.on(clear, () => 0);

  // @ts-expect-error
  $history.on(sample($actualState, clear), (history, actualState) => [
    actualState,
  ]);

  const $shouldPush = createStore(true);

  // History sync logic
  guard({
    source: $actualState,
    ...(params.clock ? { clock: params.clock } : {}),
    filter: $shouldPush,
    // @ts-expect-error
    target: push,
  });

  $shouldPush.on(undo, () => false).on(redo, () => false);

  const syncTriggered = sample({
    source: $curRecord,
    clock: [undo, redo],
  });

  for (const key in params.source) {
    params.source[key].on(syncTriggered, (_prev, obj) => obj[key]);
  }

  $shouldPush.on(
    sample({
      source: $actualState,
      clock: [undo, redo],
    }),
    () => true
  );

  // Initial clear
  // Needed to push first state into history
  clear();

  return {
    undo,
    redo,
    push,
    clear,
    $history,
    $curIndex,
    $curRecord,
    $length,
    $canUndo,
    $canRedo,
  };
};
