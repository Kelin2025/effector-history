import { allSettled, createEvent, createStore, fork, sample } from "effector";
import { it, describe, expect, beforeEach } from "vitest";

import { createHistory, replaceRepetitiveStrategy } from "./index";

const $foo = createStore("foo");
const $bar = createStore(2);

const fooChanged = createEvent<string>();
const barChanged = createEvent<number>();

sample({
  clock: fooChanged,
  target: $foo,
});

sample({
  clock: barChanged,
  target: $bar,
});

const history = createHistory({
  source: {
    foo: $foo,
    bar: $bar,
  },
});

const historyWithClock = createHistory({
  source: {
    foo: $foo,
    bar: $bar,
  },
  clock: [fooChanged],
});

const historyWithStrategies = createHistory({
  source: {
    foo: $foo,
    bar: $bar,
  },
  clock: [fooChanged, barChanged],
  strategies: new Map().set(fooChanged, replaceRepetitiveStrategy),
});

beforeEach(async (context) => {
  context.scope = fork();
});

describe("Basic", () => {
  it("Has correct initial state", ({ scope }) => {
    expect(scope.getState(history.$history)).toEqual([{ foo: "foo", bar: 2 }]);
    expect(scope.getState(history.$length)).toEqual(1);
    expect(scope.getState(history.$curIndex)).toEqual(0);
    expect(scope.getState(history.$canUndo)).toEqual(false);
    expect(scope.getState(history.$canRedo)).toEqual(false);
    expect(scope.getState(history.$actualState)).toEqual({
      foo: "foo",
      bar: 2,
    });
  });

  it("Pushes records", async ({ scope }) => {
    await allSettled(fooChanged, {
      scope,
      params: "foo2",
    });

    await allSettled(barChanged, {
      scope,
      params: 3,
    });

    expect(scope.getState(history.$history)).toEqual([
      { foo: "foo", bar: 2 },
      { foo: "foo2", bar: 2 },
      { foo: "foo2", bar: 3 },
    ]);
    expect(scope.getState(history.$length)).toEqual(3);
    expect(scope.getState(history.$curIndex)).toEqual(2);
    expect(scope.getState(history.$canUndo)).toEqual(true);
    expect(scope.getState(history.$canRedo)).toEqual(false);
    expect(scope.getState(history.$actualState)).toEqual({
      foo: "foo2",
      bar: 3,
    });
  });

  it("Undo", async ({ scope }) => {
    await allSettled(fooChanged, {
      scope,
      params: "foo2",
    });
    await allSettled(fooChanged, {
      scope,
      params: "foo3",
    });

    await allSettled(history.undo, { scope });

    expect(scope.getState(history.$history)).toEqual([
      { foo: "foo", bar: 2 },
      { foo: "foo2", bar: 2 },
      { foo: "foo3", bar: 2 },
    ]);
    expect(scope.getState(history.$length)).toEqual(3);
    expect(scope.getState(history.$curIndex)).toEqual(1);
    expect(scope.getState(history.$canUndo)).toEqual(true);
    expect(scope.getState(history.$canRedo)).toEqual(true);
    expect(scope.getState(history.$actualState)).toEqual({
      foo: "foo2",
      bar: 2,
    });
    expect(scope.getState($foo)).toEqual("foo2");
    expect(scope.getState($bar)).toEqual(2);
  });

  it("Redo", async ({ scope }) => {
    await allSettled(fooChanged, {
      scope,
      params: "foo2",
    });
    await allSettled(fooChanged, {
      scope,
      params: "foo3",
    });

    await allSettled(history.undo, { scope });
    await allSettled(history.undo, { scope });
    await allSettled(history.redo, { scope });

    expect(scope.getState(history.$history)).toEqual([
      { foo: "foo", bar: 2 },
      { foo: "foo2", bar: 2 },
      { foo: "foo3", bar: 2 },
    ]);
    expect(scope.getState(history.$length)).toEqual(3);
    expect(scope.getState(history.$curIndex)).toEqual(1);
    expect(scope.getState(history.$canUndo)).toEqual(true);
    expect(scope.getState(history.$canRedo)).toEqual(true);
    expect(scope.getState(history.$actualState)).toEqual({
      foo: "foo2",
      bar: 2,
    });
  });

  it("Clear", async ({ scope }) => {
    await allSettled(fooChanged, {
      scope,
      params: "foo2",
    });
    await allSettled(fooChanged, {
      scope,
      params: "foo3",
    });

    await allSettled(history.clear, { scope });

    expect(scope.getState(history.$history)).toEqual([{ foo: "foo3", bar: 2 }]);
    expect(scope.getState(history.$length)).toEqual(1);
    expect(scope.getState(history.$curIndex)).toEqual(0);
    expect(scope.getState(history.$canUndo)).toEqual(false);
    expect(scope.getState(history.$canRedo)).toEqual(false);
    expect(scope.getState(history.$actualState)).toEqual({
      foo: "foo3",
      bar: 2,
    });
  });
});

describe("Clock", () => {
  it("Reacts only on clock", async ({ scope }) => {
    await allSettled(fooChanged, {
      scope,
      params: "foo2",
    });
    await allSettled(barChanged, {
      scope,
      params: 3,
    });
    await allSettled(fooChanged, {
      scope,
      params: "foo3",
    });

    expect(scope.getState(historyWithClock.$history)).toEqual([
      { foo: "foo", bar: 2 },
      { foo: "foo2", bar: 2 },
      { foo: "foo3", bar: 3 },
    ]);
    expect(scope.getState(historyWithClock.$actualState)).toEqual({
      foo: "foo3",
      bar: 3,
    });
  });
});

describe("Strategies", () => {
  it("Replace repetitive", async ({ scope }) => {
    await allSettled(fooChanged, {
      scope,
      params: "foo2",
    });
    await allSettled(fooChanged, {
      scope,
      params: "foo3",
    });
    await allSettled(barChanged, {
      scope,
      params: 3,
    });
    await allSettled(barChanged, {
      scope,
      params: 4,
    });
    await allSettled(fooChanged, {
      scope,
      params: "foo4",
    });

    expect(scope.getState(historyWithStrategies.$history)).toEqual([
      { foo: "foo", bar: 2 },
      { foo: "foo3", bar: 2 },
      { foo: "foo3", bar: 3 },
      { foo: "foo3", bar: 4 },
      { foo: "foo4", bar: 4 },
    ]);
    expect(scope.getState(historyWithStrategies.$length)).toEqual(5);
    expect(scope.getState(historyWithStrategies.$actualState)).toEqual({
      foo: "foo4",
      bar: 4,
    });
  });
});
