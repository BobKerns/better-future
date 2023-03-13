/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type {Future} from './future';
import type { TaskGroup } from './group';
import type { TaskContext } from './task-context';

/**
 * Signature for a sipmle task, which is a function of no arguments that returs a value or a promise.
 * The context is passed as `this`, to avoid ambiguity with {@link PromiseLikeTask}s.
 */
export type SimpleTask<T> =
    ((this: TaskContext<T>) => T | PromiseLike<T>)
    | (() => T | PromiseLike<T>);

/**
 * A task that accepts the {@link TaskContext} as an argument.  This signature can be used if the
 * _options_ argument to {@link Future} is supplied.
 */
export type DirectTask<T> =
    ((ctx: TaskContext<T>) => T);

/**
 * A task that takes callbacks for success and failure.  This signature can be used if the
 * _options_ argument to {@link Future} is not supplied.
 * It is primarily for compatibility with the `Promise` constructor.
 */
export type PromiseLikeTask<T> =
    (
        resolve: (v: T | PromiseLike<T>) => void,
        reject: (e?: any) => void
    ) => void;

/**
 * A task to be performed in the future, compatible with `Promise`.
 */
export type CompatibleTask<T> = SimpleTask<T> | PromiseLikeTask<T>;

/**
 * A task to be performed in the future.
 *  - {@link SimpleTask}s are the most common, and take no arguments (but may be
 *    bound to a {@link CancelContext})
 *  - {@link DirectTask}s are used when the {@link TaskContext} is needed.
 *. - {@link PromiseLikeTask}s are used for compatibility with the `Promise` constructor.
 */

export type Task<T> = CompatibleTask<T> | DirectTask<T>;

/**
 * Perform an additional step in a {@link Future:type} lifecycle.
 */
export type Continuation<T, R> = (task?: Future<T>) => R | PromiseLike<R>;
/**
 * A handler for a value produced by a task.
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
 * the task is started. This can be for monitoring or debugging.
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

/**
 * Options to the {@link Future} constructor.
 */
export interface FutureOptions {
    /**
     * Enable cancelation of the task.
     */
    cancel?: boolean;
    /**
     * Inject a delay (in milliseconds) after starting.
     */
    delay?: number;
    
    /**
     * Time out the computation after this many milliseconds from when the
     * task is started.
     */
    timeoutFromStart?: number;

    /**
     * Time out the computation after this many milliseconds from when the
     * task is created.
     */
    timeoutFromNow?: number;

    /**
     * Message to include in the {@link TimeoutException}.
     */
    timeout_msg?: string;
}

/**
 * A `Promise` that can be resolved or rejected from outside.
 */
export type ExternalizedPromise<T> = Promise<T> & {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
};
