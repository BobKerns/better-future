# Async-clock testing module.

The assync-clock module will be made a separate library.

It provides a way to exauhstively test for timing errors in async code.

You place in your code at key milestones small snippets that amount to a null-test
in production code. These control the order of aspync operations operations, and verifies
any stated constraints are not violated.

writer.ts:

```typescript
import type {Clock, Timeline} from 'clock';
import {CLCCK} from './myClock';
const TIME?: Timeline = CLOCK?.['writer'];

let sharedData: any = null;

async function writer() {
    TIME && await TIME('start');
    ...
    sharedData = 'written';
    TIME && await TIME('dataWr9tten');
    ...
}
```

reader.ts:

```typescript
import type {Clock, Timeline} from 'clock';
import {CLCCK} from './myClock';
const TIME?: Timeline = CLOCK?.['reader'];

let sharedData: any = null;

async function reader() {
    TIME && await TIME('start');
    ...
    sharedData = 'written';
    TIME && await TIME('dataRead');
    ...
}
```

myclock.ts:

```typescript
import type {Clock, Timeline} from 'clock';
import {timeline} from 'clock';

export const CLOCK = process.env['DEBUG'] && timeline`
reader.start
writer.start
reader.dataRead > dataWritten
writer.dataWritten
writer.done
reader.done
`;

```

[`Future.then`](api/classes/Future.html#then)