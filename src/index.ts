import { createEvent, createStore, combine, sample, Store, Unit } from "effector";

export type HistoryStrategy = {};

const initialTrigger = createEvent();
const unknownTrigger = createEvent();
const manualTrigger = createEvent();

export const createHistory = <T extends Record<string, any> | unknown[]>(params: {
  source: T extends unknown[] ? Store<T[keyof T]>[] : { [k in keyof T]: Store<T[k]> };
  clock?: Unit<any>[];
  strategies?: Map<Unit<any>, HistoryStrategy>;
  maxLength?: number;
  serialize?: "ignore";
}) => {
  const $source = combine(params.source) as Store<T>;
  const strategies = params.strategies || new Map();
  const maxLength = params.maxLength || Infinity;

  const undo = createEvent<any>();
  const redo = createEvent<any>();
  const push = createEvent<{ record: T; trigger: Unit<any> }>();
  const replace = createEvent<{ record: T; trigger: Unit<any> }>();
  const clear = createEvent<any>();

  // @ts-expect-error
  const initialState: typeof params.source = Array.isArray(params.source) ? [] : {};
  for (const idx in params.source) {
    // @ts-expect-error
    initialState[idx] = params.source[idx].defaultState;
  }

  const $history = createStore<typeof params.source[]>(
    [initialState],
    params.serialize ? { serialize: params.serialize } : {}
  );
  const $triggers = createStore<Unit<any>[]>([initialTrigger], {
    serialize: "ignore",
  });
  const $curIndex = createStore(0);
  const $curRecord = combine($history, $curIndex, (history, curIndex) => history[curIndex] || null);
  const $curTrigger = combine(
    $triggers,
    $curIndex,
    (triggers, curIndex) => triggers[curIndex] || unknownTrigger
  );
  const $length = $history.map((history) => history.length);
  const $canUndo = $curIndex.map((idx) => idx > 0);
  const $canRedo = combine($curIndex, $length, (idx, historyLength) => idx + 1 < historyLength);
  const $actualState = combine($source, $curRecord, (source, record) => record || source);

  // Push logic
  const pushed = sample({
    source: [$curIndex, $history] as const,
    clock: push,
    fn: ([curIndex, history], { record, trigger }) => {
      return {
        curIndex,
        record,
        trigger,
        shouldPop: history.length >= maxLength,
      };
    },
  });

  $history.on(pushed, (prev, { curIndex, record, shouldPop }) => {
    const next = prev.slice(0, curIndex + 1);
    // @ts-expect-error
    next.push(record);
    if (shouldPop) {
      next.pop();
    }
    return next;
  });

  $triggers.on(pushed, (prev, { curIndex, trigger, shouldPop }) => {
    const next = prev.slice(0, curIndex + 1);
    next.push(trigger);
    if (shouldPop) {
      next.pop();
    }
    return next;
  });

  $curIndex.on(pushed, (curIndex, { shouldPop }) => (shouldPop ? curIndex : curIndex + 1));

  // Replace logic
  $history.on(replace, (prev, { record }) => {
    const next = [...prev];
    // @ts-expect-error
    next[next.length - 1] = record;
    return next;
  });

  // Undo logic
  const undoPassed = sample({
    source: $curIndex,
    clock: undo,
    filter: $canUndo,
  });

  $curIndex.on(undoPassed, (idx) => Math.max(0, idx - 1));

  // Redo logic
  const redoPassed = sample({
    source: [$curIndex, $length],
    clock: redo,
    filter: $canRedo,
  });

  $curIndex.on(redoPassed, (idx) => idx + 1);

  // Clear logic
  const cleared = sample({
    clock: clear,
    source: $source,
  });
  $curIndex.on(cleared, () => 0);
  // @ts-expect-error
  $history.on(cleared, (prev, currentSource) => [currentSource]);
  $triggers.on(cleared, () => [initialTrigger]);

  const $shouldPush = createStore(true);

  // History sync logic
  const triggers = params.clock || params.source;

  for (const trigger of Object.values(triggers)) {
    const strategy = strategies.get(trigger) ?? pushStrategy;
    switch (strategy) {
      case replaceRepetitiveStrategy:
        sample({
          clock: trigger,
          source: [$curTrigger, $source] as const,
          filter: ([curTrigger]) => trigger === curTrigger,
          fn: ([_, record]) => ({ record, trigger }),
          target: replace,
        });

        sample({
          clock: trigger,
          source: [$curTrigger, $source] as const,
          filter: ([curTrigger]) => trigger !== curTrigger,
          fn: ([_, record]) => ({ record, trigger }),
          target: push,
        });
        break;
      default:
        sample({
          clock: trigger,
          source: $source,
          filter: $shouldPush,
          fn: (record) => ({ record, trigger }),
          target: push,
        });
    }
  }

  $shouldPush.on(undo, () => false).on(redo, () => false);

  const syncTriggered = sample({
    source: $curRecord,
    clock: [undo, redo],
  });

  for (const key in params.source) {
    // @ts-expect-error
    params.source[key].on(syncTriggered, (_prev, obj) => obj[key]);
  }

  $shouldPush.on(
    sample({
      source: $actualState,
      clock: [undo, redo],
    }),
    () => true
  );

  return {
    undo,
    redo,
    push: push.prepend((record: T) => ({ record, trigger: manualTrigger })),
    replace: replace.prepend((record: T) => ({
      record,
      trigger: manualTrigger,
    })),
    clear,
    $history,
    $curIndex,
    $curRecord,
    $length,
    $canUndo,
    $canRedo,
    $actualState,
  };
};

/** Always pushes new records */
export const pushStrategy: HistoryStrategy = {};
/** Replace current record if it came from the same trigger. Push new otherwise */
export const replaceRepetitiveStrategy: HistoryStrategy = {};
