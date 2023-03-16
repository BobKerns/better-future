/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type {Future} from './future';
import type { TaskContext } from './task-context';
import { TaskGroupResultType } from './enums';
import type { TaskPool } from './task-pool';
import type { TaskGroup } from './task-group';
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
 * A task that accepts the {@link TaskContext:type} as an argument.  This signature can be used if the
 * _options_ argument to {@link Future:type} is supplied.
 * @internal
 */
export type DirectTask<T> =
    ((ctx: TaskContext<T>) => T);

/**
 * A task that takes callbacks for success and failure.  This signature can be used if the
 * _options_ argument to {@link Future:type} is not supplied.
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
 *    bound to a {@link TaskContext:type})
 *  - {@link DirectTask}s are used when the {@link TaskContext:type} is needed.
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

/**
 * The type a task will return.
 *
 * @typeParam R The type of the value returned to the task
 *              from the subtasks, prior to aggregation.
 * @typeParam RR The type of the value returned to the task
 *               by any reduceer, or `never`.
 * @typeParam RT The {@link TaskGroupResultType:type} of the task group,
 *               specfying ow the results are aggregated.
 */
export type TaskGroupResult<RT, R, RR = never> =
    RT extends TaskGroupResultType.REDUCE
    ? RR
    : RT extends TaskGroupResultType.FIRST | TaskGroupResultType.ANY
    ? R
    : RT extends TaskGroupResultType.ALL
    ? R[]
    : RT extends TaskGroupResultType.ALL_SETTLED
    ? PromiseSettledResult<R>[]
    : never;

type NonReduceOptions = Exclude<TaskGroupResultType, TaskGroupResultType.REDUCE>;

interface BaseTypeGroupOptions<RT extends TaskGroupResultType> extends FutureOptions {
    resultType: RT;
    /**
     * Name for the task group.
     */
    name?: string;

    /**
     * If supplied, the task group and all of its member tasks will be added to this pool.
     */
    pool?: TaskPool;
}


type ReduceTaskGroupOptions<T, R> = {
    resultType: TaskGroupResultType.REDUCE;
    reducer: ReducerSpec<T, R>;
};

/**
 * Options for a {@link TaskGroup}. A {@link TaskGroupResultType.REDUCE} task group
 * has additional options.
 */
export type TaskGroupOptions<RT extends TaskGroupResultType, F, T = F, R = T> =
    RT extends TaskGroupResultType.REDUCE
    ? BaseTypeGroupOptions<RT> & ReduceTaskGroupOptions<T, R>
    : RT extends NonReduceOptions
    ? BaseTypeGroupOptions<RT>
    : never;

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
export type ReducerGroup<F, T = F, R = T> = TaskGroup<TaskGroupResultType.REDUCE, F, T, R>;

/**
 *
 * ```typescript
 * function *arithmetic_mean(group: ReduceGroup<number>) {
 *   let sum = 0;
 *   let count = 0;
 *   while (true) {
 *    try {
 *       const [v, idx] = yield;
 *       if (idx === -1) {
 *          return sum / count;
 *      } catch (e: unknown) {
 *        // We ignore timed-out tasks.
 *          if (e instanceof TimeoutException === State.TIMEOUT) continue;
 *        if (state !== State.FULFILLED) throw v;
 *      }
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
export type ReducerFn<T, R, ARGS extends any[]> = (ctx: TaskContext<R>, ...args: ARGS) => Reducer<T, R>;

/**
 * The {@link TaskGroupOptions#reducer} parameter can be a {@link ReducerFn} or an array
 * of the form `[ReducerFn, ...args]`.
 */
export type ReducerSpec<T, R, ARGS extends any[] = []> = ReducerFn<T, R, []> | [ReducerFn<T, R, ARGS>, ...ARGS]
