/**
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import {MinHeap} from './heap';

/**
 * A {@link TimeSource} is a proxy for `Date.now()`, and `setTineout()`,
 * allow9ng repeatable control of timing-dependent code, such as timeouts.
 */
export type TimeSource = {
    readonly now: (() => TimeMs);
    readonly setTimeout: ((fn: () => void, ms: TimeMs) => TimeoutId);
    readonly clearTimeout: ((id: TimeoutId) => void);
};

const USE_NODE_API = typeof (setTimeout(() => 5, 5)) !== 'number';

/**
 * Duplicates `NodeJS.Timeout`, to be agnostic.
 */
export interface Timeout {
    ref(): this;
    unref(): this;
    hasRef(): boolean;
    refresh(): this;
    hasRef(): boolean;
    refresh(): this;
}

export type TimeoutIdNum = number;
export type TimeoutId = TimeoutIdNum & Timeout;
export type TimeMs = ReturnType<typeof Date.now>;

class TimeoutImpl implements Timeout {
    readonly id: TimeoutIdNum;
    readonly #ms: TimeMs;
    readonly #clock: TimeKeeper;
    #ref: boolean = true;
    constructor(id: TimeoutIdNum, ms: TimeMs, clock: TimeKeeper) {
        this.id = id;
        this.#ms = ms;
        this.#clock = clock;
    }
    ref() {
        this.#ref = true;
        return this;
    }
    unref() {
        this.#ref = false;
        return this;
    }
    hasRef() {
        return this.#ref;
    }
    refresh() {
        this.#clock.clearTimeout(this.id);
        return this;
    }
}

/**
 * An {@link Itinerary} is a scheduled seqeuence of gated {@link Checkpoint}s.
 *
 * If there are multiple possible paths, our quantum trucker will take them all,
 * but will be held at the {@link Gate} for other {@link Checkpoint}s until he
 * arrives at the previous one one. Thus order is imposed on parallelism,
 * and the computational gods no longer play dice with the universe.
 *
 * Some {@link Itinerary}s may be infinite, and will never resolve. Others
 * may be impossible, and our quantum trucker may never arrive at a scheduled
 * {@link Checkpoint}, stuck at a prior gate scheduled later.
 *
 * In either case, the {@link Itinerary} will never resolve.
 */
export type Itinerary<TL extends string> = ((gate: string | number, ...args: any[]) => Promise<void>)
    & TimeSource;

export type Clock<TL extends string = string> = ((task: TL) => Itinerary<TL>)
    & TimeSource;

type FnRef = `\$${number}`;

type FnTable = Record<FnRef, Function>;

type TLTable<TR extends string> = Record<TR, Itinerary<TR>>;

export enum GateState {
    Waiting = 'waiting',
    Blocking = 'blocking',
    Open = 'open',
    Visited = 'visited',
    Rejected = 'rejected'
};

export class Gate {
    readonly #task: string;
    readonly #gate: string;
    get name() {
        return `${this.#task}::${this.#gate}`;
    }
    readonly #gatehouse: Checkpoint;
    readonly #promise: MkPromise<void>;
    #state: GateState = GateState.Waiting;

    constructor(task: string, name: string, gatehouse: Checkpoint, promise: MkPromise<void>) {
        this.#task = task;
        this.#gate = name;
        this.#gatehouse = gatehouse;
        this.#promise = mk_promise();
    }
    async then(
        onFulfilled?: () => void,
        onRejected?: (error: any) => void)
        : Promise<void> {
        try {
            this.#state = GateState.Blocking;
            await this.#promise;
            this.#state = GateState.Open;
            await this.#gatehouse.onArrival();
            const v = await Promise.resolve(onFulfilled!());
            this.#state = GateState.Visited;
            return v;
        } catch (e) {
            this.#state = GateState.Rejected;
            try {
                return Promise.reject(onRejected!(e));
            } catch (e2) {
                return Promise.reject(e2);
            }
        }
    }
    toString() {
        return `${this.name}[]${this.#state}`;
    }
}

export class Checkpoint implements Partial<Resolvable<void>> {
    readonly #task: string;
    readonly #name: string;

    get name() {
        return this.#name;
    }
    readonly #gate: Gate;

    /**
     * The {@link Gate} for this {@link Checkpoint}, on which code under test will wait.
     */
    get gate() {
        return this.#gate;
    }

    readonly #check?: () => void;
    readonly #next?: Checkpoint;

    readonly resolve?: (v: void | PromiseLike<void>) => void;
    readonly reject?: (e: Error) => void;

    constructor(task: string, gate: string, next?: Checkpoint, check?: () => void) {
        this.#task = task;
        this.#gate = new Gate(task, gate, this, mk_promise());
        this.#next = next;
        this.#check = check;
        this.#name = `${task}.${gate}`;
    }

    async onArrival() {
        await this.#check?.();
        this.#next?.resolve?.();
    }
}
const END = Symbol('END');

type MkPromise<T> = Promise<T> & Resolvable<T>;

interface Resolvable<T> {
    resolve: (v: T | PromiseLike<T>) => void;
    reject: (e: Error) => void;
}

const mk_promise = <A extends any[], R>(fn?: (...args: A) => R, ...args: A): MkPromise<R> => {
    let resolve: (v : R | PromiseLike<R>) => void;
    let reject: (e: Error) => void;
    const p = new Promise<R>((res, rej) => {
        resolve = res;
        reject = rej;
        if (fn) {
            resolve = () => {
                try {
                    res(fn(...args));
                } catch (e) {
                    reject(e as Error);
                }
            };
        }
    });
    const r = p as MkPromise<R>;
    r.resolve = resolve!;
    r.reject = reject!;
    return r;
};

class TimeKeeper implements TimeSource {
    #now: TimeMs = 0;
    #id:TimeoutIdNum = 0;
    #timeouts: Record<number, () => void> = {};
    #times = new MinHeap<number, [number, number]>((i) => i[0]);
    now() {
        return this.#now;
    }

    setTimeout<A extends any[]>(fn: (...args: A) => void, ms: number, ...args: A): TimeoutId {
        const idx = this.#id++;
        const t =this.#now + ms;
        const fn2 = this.#timeouts[idx] = () => {
            delete this.#timeouts[idx];
            queueMicrotask(() =>  fn(...args));
        };
        if (USE_NODE_API) {
            return new TimeoutImpl(idx, ms, this) as unknown as TimeoutId;
        }
        this.#times.add([ms, idx]);
        return idx as TimeoutId;
    }

    /**
     * Delete a timeout.
     * @param id The id returned by {@link setTimeout}
     */
    clearTimeout(id: TimeoutIdNum|Timeout) {
        const idx = USE_NODE_API ? (id as TimeoutImpl).id : id as number;
        delete this.#timeouts[idx];
    }

    tick(ms: number = 1) {
        this.#now += ms;
        let item = this.#times.peek();
        while (item && this.#now >= item[0]) {
            const fn = this.#timeouts[item[1]];
            if (fn) {
                fn();
            }
        }
        const fns = Object.values(this.#timeouts);
        this.#timeouts = {};
        fns.forEach(fn => fn());
    }
}

export const timeline = <TL extends string = string>(s: TemplateStringsArray, ...values: any[]): Clock<TL> => {
    const clock = new TimeKeeper();
    const now: typeof clock.now = clock.now.bind(clock);
    const vsetTimeout: typeof clock.setTimeout = clock.setTimeout.bind(clock);
    const vclearTimeout: typeof clock.clearTimeout = clock.clearTimeout.bind(clock);
    const lookup: FnTable = {};
    function *fn_mapper(): Generator<string, Record<FnRef, Function>, Function> {
        let ctr: number = 0;
        const map = new Map();
        let ref: FnRef|undefined;
        while (true) {
            let v = yield ref!;
            if ((v as any) === END) {
                return lookup;
            }
            if (! map.has(v)) {
                map.set(v, ref = `\$${ctr++}`);
                lookup[ref] = v;
            } else {
                ref = map.get(v);
            }
        }
    }
    const fns = fn_mapper();
    const substituted = s.flatMap((s, i) => [
        s,
        ...(i < values.length
            ? [fns.next(values[i]).value]
            : [])
    ])
    .join('');
    const split = substituted
        .split(/\n/g)
        .map(s => s.replace(/.*(\/\/.*)$/, '').trim());
    const timelines:TLTable<TL> = split.reduce(
        (acc, s) => {
            const [_, task, gate] = /^(.*)\.([^. ]+)(?:\s+($\d+))(?:\s|$)/.exec(s) ?? [];
            const fn = () => Promise.resolve();
            fn.now = now;
            fn.setTimeout = vsetTimeout;
            fn.clearTimeout = vclearTimeout;
            acc[task] = fn;
            return acc;
        },
        Object.create(null));
    const f = (task: TL) => timelines[task];
    f.now = now;
    f.setTimeout = vsetTimeout;
    f.clearTimeout = vclearTimeout;
    return f;
};
