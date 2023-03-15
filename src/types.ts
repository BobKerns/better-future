/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type {Future} from './future';
import type { TaskContext } from './task-context';
import { TaskGroupResultType } from './enums';
import type { TaskPool } from './task-pool';
import { TaskGroup } from './task-group';
import { State } from './state';

/**
 * Signature for a sipmle task, which is a function of no arguments that returs a value or a promise.
 * The context is passed as `this`, to avoid ambiguity with {@link PromiseLikeTask}s.
 * @internal
 */
export type SimpleTask<T> =
    ((this: TaskContext<T>) => T | PromiseLike<T>)
    | (() => T | PromiseLike<T>);

/**
 * A task that accepts the {@link TaskContext} as an argument.  This signature can be used if the
 * _options_ argument to {@link Future} is supplied.
 * @internal
 */
export type DirectTask<T> =
    ((ctx: TaskContext<T>) => T);

/**
 * A task that takes callbacks for success and failure.  This signature can be used if the
 * _options_ argument to {@link Future} is not supplied.
 * It is primarily for compatibility with the `Promise` constructor.
 * @internal
 */
export type PromiseLikeTask<T> =
    (
        resolve: (v: T | PromiseLike<T>) => void,
        reject: (e?: any) => void
    ) => void;

/**
 * A task to be performed in the future, compatible with `Promise`.
 * @internal
 */
export type CompatibleTask<T> = SimpleTask<T> | PromiseLikeTask<T>;

/**
 * A task to be performed in the future.
 *  - {@link SimpleTask}s are the most common, and take no arguments (but may be
 *    bound to a {@link TaskContext})
 *  - {@link DirectTask}s are used when the {@link TaskContext} is needed.
 *. - {@link PromiseLikeTask}s are used for compatibility with the `Promise` constructor.
 */
export type Task<T> = CompatibleTask<T> | DirectTask<T>;

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
export type StartCallback = (tme: UnixTime) => void;

type NonReduceOptions = Exclude<TaskGroupResultType, TaskGroupResultType.REDUCE>;

interface BaseTypeGroupOptions<RT extends TaskGroupResultType> {
    resultType: RT;
    /**
     * Name for the task group.
     */
    name?: string;

    /**
     * If supplied,the task group will time out if it does not complete within this
     * duration (in milliseconds).
     */
    timeout?: number;

    /**
     * If supplied, the task group and all of its member tasks will be added to this pool.
     */
    pool?: TaskPool;
}


type ReduceTaskGroupOptions<R, T> = {
    resultType: TaskGroupResultType.REDUCE;
    reducer: ReducerSpec<R,T>;
};

/**
 * Options for a {@link TaskGroup}. A {@link TaskGroupResultType.REDUCE} task group
 * has additional options.
 */
export type TaskGroupOptions<R, T, RT extends TaskGroupResultType> =
    RT extends TaskGroupResultType.REDUCE
    ? BaseTypeGroupOptions<RT> & ReduceTaskGroupOptions<R, T>
    : RT extends NonReduceOptions
    ? BaseTypeGroupOptions<RT>
    : never;

const foo: TaskGroupOptions<number, number, TaskGroupResultType> = {
    resultType: TaskGroupResultType.REDUCE,
    reducer: null as unknown as ReducerSpec<number, number>,
    name: 'cat'
};

console.log(foo);
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

/**
 * A terminal state other than {State#FULFILLED}.
 */
export type RejectedState = State.REJECTED | State.CANCELLED | State.TIMEOUT;
/**
 * Any terminal state. This includes {@link State.CANCELLED} and {@link State.TIMEOUT},
 * as these are recorded as their final state, despite transitioning to {@link State.REJECTED}.
 */
export type TerminalState = State.FULFILLED | RejectedState;

/**
 * A {@link TaskGroup} that holds tasks pefroming a map operationk and which
 * will apply a {@link Reducer} function to aggregate the results.
 * @typeparam T The type of the value returned by the tasks.
 */
export type ReducerGroup<T, R> = TaskGroup<TaskGroupResultType.REDUCE, T, R>;

/**
 *
 * ```typescript
 * function *arithmetic_mean(group: ReduceGroup<number>) {
 *   let sum = 0;
 *   let count = 0;
 *   while (true) {
 *      const [v, idx, state] = yield;
 *      if (idx === -1) {
 *         return sum / count;
 *     }
 *      // We ignore timed-out tasks.
 *      if (state === State.TIMEOUT) continue;
 *      if (state !== State.FULFILLED) throw v;
 *      sum += v;
 *      count += 1;
 *   }
 * }
 *
 */
export type  Reducer<T, R> = Generator<undefined, R, [T, number]>;

/**
 * A function that produces a {@link Reducer} for a {@link ReducerGroup}.
 */
export type ReducerFn<A, T, R> = (group: ReducerGroup<T, R>, ...args: A[]) => Reducer<T, R>;

/**
 * The {@link TaskGroupOptions#reducer} parameter can be a {@link ReducerFn} or an array
 * of the form `[ReducerFn, ...args]`.
 */
export type ReducerSpec<T, R, A extends any[] = any[]> = ReducerFn<[], T, R> | [ReducerFn<A, T, R>, ...A]
