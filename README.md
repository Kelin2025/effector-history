# Effector History

Utility library that implements undo/redo feature for you

## Installation

```bash
pnpm add effector-history
```

## Usage

```ts
import { createHistory } from "effector-history";

const right = createEvent();
const up = createEvent();

const $x = createStore(0);
const $y = createStore(0);

$x.on(right, (x) => x + 1);

$y.on(up, (y) => y + 1);

const history = createHistory({
  source: {
    x: $x,
    y: $y,
  },
  maxLength: 20,
});

combine([$x, $y]).watch(console.log);

up(); // [0, 1]
up(); // [0, 2]
right(); // [1, 2]
up(); // [1, 3]

history.undo(); // [1, 2]
history.undo(); // [0, 2]
history.redo(); // [1, 2]
```

## Customization

### `clock` property

Sometimes you need to add records only on a specific event.  
For example, you have draggable blocks, and you want to push to history only whenever drag is ended.  
For such cases you can use `clock` property:

```ts
createHistory({
  source: {
    x: $x,
    y: $y,
  },
  // Only these events will trigger history
  clock: [dragEnded],
  maxLength: 20,
});
```

Keep in mind that store updates **won't** push to history in this case, so it can cause data incosistency

### `serialize` property

If you don't want to serialize history (e.g. you store custom instances and use SSR), you can add `serialize` property:

```ts
createHistory({
  source: {
    socketInstance: $socketInstance,
  },
  serialize: "ignore",
});
```

### Strategies

Imagine that you have a custom editor with its own history logic. And you want to treat typing in text field as a single history record.

You can setup custom strategy for a certain `clock`

```ts
import { createHistory, replaceRepetitiveStrategy } from "effector-history";

const history = createHistory({
  source: {
    text: $text,
    attachments: $attachments,
  },
  clock: [textChanged, attachmentAdded, attachmentRemoved],
  strategies: new Map().set(textChanged, replaceRepetitiveStrategy),
});

attachmentAdded(file);
textChanged("f");
textChanged("fo");
textChanged("foo");

history.$history.getState();
/* 
  [
    { text: '', file: null },
    { text: '', file: file },
    { text: 'foo', file: file } // <- Batched in one
  ]
*/
```

Built-in strategies:

- `pushStrategy` (default) - always pushes to history, no matter what
- `replaceRepetitiveStrategy` - if the current record came from the same trigger, the current record will be replaced. Otherwise, the new one will be pushed
- `skipDuplicatesStrategy` - if the trigger & payload are the same, don't do anything. Push new record, otherwise

If you want to make a custom strategy, you can use `customStrategy` helper

```ts
const buttonTextChanged = createEvent<{ idx: number; text: string }>();

// List of parameters
// trigger - Unit that caused history trigger
// payload - Payload of `trigger`
// curTrigger - Unit that caused currently active history record
// curPayload - Payload of `curTrigger`
// curRecord - Currently active history record
const buttonTextChangedStrategy = customStrategy<{ idx: number; text: string }>({
  check: ({ trigger, curTrigger, payload, curPayload }) => {
    // If trigger is different, push a new record
    if (trigger !== curTrigger) {
      return "push";
    }
    // If changing different button, push a new record
    if (payload.idx !== curPayload.idx) {
      return "push";
    }
    // Otherwise replace the current one
    return "replace";
  },
});

const history = createHistory({
  source: {
    buttons: $buttons,
  },
  clock: [buttonTextChanged],
  strategies: new Map().set(butonTextChanged, buttonTextChangedStrategy),
});
```

## API Reference

```ts
history.$history; // All history records
history.$canUndo; // `true` if can undo, `false` otherwise
history.$canRedo; // `true` if can redo, `false` otherwise
history.$curIndex; // Index of currently active history index
history.$curRecord; // Current history record
history.$length; // Amount of records in history (min. 1)

history.undo(); // Undo
history.redo(); // Redo
history.clear(); // Clear history
history.push(data); // Manually push something to history
history.replace(data); // Manually replace something in history
```

## TODO

- [ ] Support `createHistory` without `source`
