/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type {Future} from './future';
import type { TaskContext } from './task-context';

export type ComputationSimple<T> =
    ((this: TaskContext<T>) => T | PromiseLike<T>)
    | (() => T | PromiseLike<T>);

export type ComputationPromiselike<T> =
    (
        resolve: (v: T | PromiseLike<T>) => void,
        reject: (e?: any) => void
    ) => void;

/**
 * A computation to be performed in the future.
 */
export type Computation<T> = ComputationSimple<T> | ComputationPromiselike<T>;

/**
 * Perform an additional step in a {@link Future} lifecycle.
 */
export type Continuation<T, R> = (computation?: Future<T>) => R | PromiseLike<R>;
/**
 * A handler for a value produced by a computation.
 */
export type Handler<T> = (a: T | PromiseLike<T>) => void;

/**
 * A function suitablefor passing to {@link Future#then} or {@link Future#when},
 * to be notified of fulfillment.
 */
export type OnFulfilled<T, R> = ((a: T) => R | PromiseLike<R>) | null | undefined;

/**
 * A function suitable for passing to {@link Future#catch} or the second argument to
 * {@link Future#then} or {@link Future#when}, to be notified of rejections.
 */
export type OnRejected<R> = ((a: any) => R | PromiseLike<R>) | null | undefined;

/**
 * A function suitable for passing to {@link Future#finally}, to be notified of
 * resolution (fullfillment or rejection).
 */
export type OnFinally = () => void;

/**
 * A function suitable for passing to {@link Future#onStart}, to be notified when
 * the computation is started. This can be for monitoring or debugging.
 *
 * ```typescript
 * const f = new Future(long_computation).onStart(() => console.log("Started"));
 * // ...
 * f.finally(() => console.log("Done"));
 * ```
 */
export type OnStart = (time: UnixTime) => void;

/**
 * Number of milliseconds since the Unix epoch.
 */
export type UnixTime = number;

/**
 * A time interval in milliseconds.
 */
export type Millis = number;

/**
 * A callback for a {@link Future} that has timed out or been cancelled.
 */
export type FailCallback<E extends Error> = (e: E | PromiseLike<E>) => void;

/**
 * A callback for when the future has been started.
 */
export type StartCallback = (time: UnixTime) => void;

export enum TaskGroupResultType {
    FIRST = 'FIRST',
    ALL = 'ALL',
    ANY = 'ANY',
    ALL_SETTLED = 'ALL_SETTLED'
}

export interface TaskGroupOptions<RT extends TaskGroupResultType> {
    resultType: RT;

    name?: string;

    timeout?: number;
}

/**
 * The type of task being added to a {@link TaskGroup}.
 */
export enum TaskType {
    /**
     * A normal task is one that is expected to complete normally,
     * and whose value may contribute to the result of the group.
     */
    NORMAL = 'NORMAL',

    /**
     * A background task is one that is expected to complete normallly
     * with the group, but does not contribute to the result of the group.
     */
    BACKGROUND = 'BACKGROUND',

    /**
     * A daemon task is one that is expected to run indefinitely, and
     * should be cancelled when the group is finished.
     */
    DAEMON = 'DAEMON'
}
