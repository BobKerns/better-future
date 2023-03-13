/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type {
    SimpleTask, Task,
    FailCallback, Handler,
    OnFinally, OnFulfilled, OnRejected,
    OnStart, FutureOptions, DirectTask, PromiseLikeTask
    } from './types';
import {State} from './state';
import {FutureState} from './future-state';
import { CancelledException,  TimeoutException, delay, isTerminalState } from './utils';
import { TaskContext } from './task-context';

const isSimpleComputation = <T>(c: Task<T>): c is SimpleTask<T> =>
    c.length === 0;

/**
 * A {@link Future} is a taskill be performed in the future.
 * It is a promise that can be cancelled or timed out, but does not begin
 * running until until there is a {@link #then} handler for it, or it is
 * explicitly started with {@link #start}.
 *
 * A {@link Future} can be in one of these states:
 *
 * * {@link #PENDING}: The initial state. The task has not yet been started.
 * * {@link #RUNNING}: The task has been started, but has neither returned nor
 *   thrown an exception. This corresponds to the _Pending_ state in a
 *   [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
 * * {@link #FULFILLED} The task has returned a value.
 * * {@link #REJECTED}: The task has thrown an exception or returned a rejected
 *   [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
 * * {@link #CANCELLED}: After being cancelled, the {@link Future} will be in this
 *   state until all {@link #onCancel} handlers have been called, after which it
 *   transitions to {@link #REJECTED}. {@link #state} will remain at {@link #CANCELLED}
 *   to denote why it was rejected.
 * * {@link #TIMEOUT}: If a {@link Future} times out (see {@link #timeout}, it will be in
 *    this state until all {@link #onTimeout} handlers have been run.
 *
 * At their simplest, a {@link Future}, once created, can be used exactly like a `Promise`,
 * with the execution of the task deferred until the first {@link #then} handler is
 * added. For example:
 *
 * ```typescript
 *
 * interface UserActivity {
 *  user: string;
 *  activity: any;
 *  ok: boolean;
 * };
 *
 * const fetch_user = user => new Future(async () => {
 *     const result = await fetch(`https://example.com/activity/${user}`);
 *     return result.json() as UserActivity;
 * });
 *
 * const users = ['alice', 'bob', 'carol'];
 * const activities = users.map(user => ({user, activity: fetch_user(user)}));
 *
 * const get_user = async user => {
 *   // The fetch is started here, with the `await`.
 *    const data = await activities.find(a => a.user === user).activity;
 *    if (! data.ok) {
 *      throw new Error(data.reason);
 *    }
 *   return data.result;
 * };
 * ```
 *
 * The following diagram shows the basic states of a {@link Future} (excluding timeouts), which
 * are covered in more detail later.
 *
 * ![Diagram of basic states](../images/basic-states.svg)
 *
 * This is the full unkfied set of states; a given use will use only a subset of these.
*/
export class Future<T> {
    /**
     * Shared state
     * @hidden
     */
    #s: FutureState<T>;

    /**
     * The promise that will be resolved when the task is complete.
     * @hidden
     */
    #promise: Promise<any>;

    // Indicates the type of promise to be used to construct more Futures.
    static get [Symbol.species]() {
        return Future;
    }

    /**
     * Get the current lifecycle sttate of the {@link Future}.
     */
    get state() {
        return this.#s.state;
    }

    /**
     * Get the time at which the {@link Future} was started _(not created)_.
     */
    get startTime() {
        return this.#s.startTime;
    }

    /**
     * Takes a task to be performed in the future. The _comutation_ is
     * either:
     * * a function of 0 arguments that will receive  the
     *   {@link Future} instance itself as its implicit `this` parameter. The task may return a value, which is
     *   then received by the caller of the {@link Future} instance via the {@link #then}
     *   or {@link #catch} methods. The task may also return a `Promise`,
     *   whose value will be used in the same way.
     * * a function of 2 arguments, the first of which is a {@link ResolveCallback} and the second of which is a
     *   {@link FailCallback}. The task may call the {@link ResolveCallback} to
     *   resolve the {@link Future} with a value, or the {@link FailCallback} to reject it
     *   with an exception. The task may also return a `Promise`, whose value will
     *   be used in the same way.
     *
     *
     * The second option is compatible with `Promise`'s constructor, and can be used
     * in the same way. For example:
     *
     * ```typescript
     * function example(arg: any) {
     *   return new Future((resolve, reject) => {
     *     if (typeof arg === 'string') {
     *       resolve(arg);
     *    } else {
     *      reject(new Error('Not a string'));
     *    }
     *  });
     * }
     * ```
     *
     * vs
     *
     * ```typescript
     * function example(arg: any) {
     *   return new Future(() => {
     *     if (typeof arg === 'string') {
     *       return arg;
     *     } else {
     *       throw new Error('Not a string');
     *     }
     *   });
     * }
     * ```
     *
     * @param task
     */
    constructor(task: Task<T>);
    constructor(task: Task<T>|DirectTask<T>, options: FutureOptions);
    constructor(task: Task<T> | DirectTask<T>, options?: FutureOptions)  {
        // Not in the signature—an internal-only usage.
        if (task instanceof Future) {
            const o = task;
            this.#s = o.#s;
            this.#promise = o.#promise;
        } else {
            if (typeof task !== 'function') {
                throw new TypeError('Task must be a function');
            }
            this.#s = new FutureState(this, options);
            if (task.length > 0 && !options) {
                this.#s.legacyTask = true;
            }
            const createTime = Date.now();
            const timeout = (time: number | undefined) =>
                    time === undefined || time <= 0
                        ? undefined
                    :  setTimeout(() => {
                        const ex = new TimeoutException(this, options?.timeout_msg ?? "TIMEOUT");
                        this.#resolved(State.TIMEOUT, this.#s.onTimeout, ex, ex);
                    },
                    time);
            timeout(options?.timeoutFromNow)
            this.#promise = new Promise<T>((resolve, reject) => {
                this.#s.task = async (ctx: TaskContext<T>): Promise<void> => {
                    this.#s.task = null; // Only run once.
                    if (options?.delay) {
                        this.#s.state = State.DELAY;
                        await delay(options.delay);
                    }
                    this.#s.state = State.RUNNING;
                    this.#s.startTime = Date.now();
                    this.#s.onStart?.(this.#s.startTime);
                    timeout(options?.timeoutFromStart);
                    try {
                        if (this.#s.legacyTask) {
                            let t = task as PromiseLikeTask<T>;
                            t(resolve, reject);
                        } else {
                            let t = task as DirectTask<T>;
                            resolve(await t.call(this.#s.context, this.#s.context));
                            this.#s.state = State.FULFILLED;
                        }
                    } catch (e: unknown) {
                        // Not if this is already resolved.
                        if (!isTerminalState(this.#s.state)) {
                            this.#s.exception = e as Error;
                            this.#s.state = State.REJECTED;
                        }
                        reject(e);
                    }
                };
            });
            // Hook in timeouts and cancellation.
           if (options?.cancel || options?.timeoutFromNow || options?.timeoutFromStart) {
                this.#promise = Promise.race([this.#promise, this.#s.auxPromise]);
           }
        }
    }

    /**
     * Arrive at a final state.
     *
     * @param state The new state
     * @param handler The handler to invoke
     * @param v The value to provide
     * @param e The exception to record
     * @returns the value.
     *
     * @hidden
     */
    #resolved<T>(state: State, handler: Handler<T> | null | undefined, v: T, e: Error | null) {
        if (!isTerminalState(this.#s.state)) {
            this.#s.state = state;
            if (e) this.#s.exception = e;
        }
        this.#s.task = null;
        this.#s.auxPromise.reject(e);
        handler?.(v);
        return v;
    }

    /**
     * Starts the task, then returns a new {@link Future}
     * that will be resolved when the task
     * is complete, and which will resolve with the result of _onFulfilled_ being
     * the task's value. If the task throws an exception, the new
     * {@link Future} will get the result of the _onRejected_ handler, if any.
     * Otherwise, the new {@link Future} will be rejected with the same exception.
     *
     * If either handler throws an exception, the new {@link Future} will be
     * rejected with that exception.
     *
     * @param onFulfilled
     * @param onRejected
     * @returns the new {@link Future} instance.
     */
    then<R,E>(onFulfilled: OnFulfilled<T,R>, onRejected: OnRejected<E>): Future<R|E> {
        this.#s.task?.call(this.#s.context, this.#s.context);
        const next = new Future<R|E>(this as any as Task<R|E>);
        next.#promise = this.#promise.then(onFulfilled, onRejected);
        return next;
    }

    /**
     * Handles rejected {@link Future} instances. This does not start the task,
     * since in most cases, we are interested in the fulfillment of the {@link Future},
     * not its rejection.
     *
     * Often, {@link #catch} handlers are set up separately from the {@link #then}
     * handlers that consume the result.
     *
     * If you need the task started, use {@link #start}, use {@link #catch}
     * together with {@link #then}, or use the two-argument form of the {@link #then}method.
     *
     * See {@link #then} for more details.
     *
     * @param onRejected the handler to be called if the task throws an exception.
     * @returns a new {@link Future} instance.
     */
    catch(onRejected: OnRejected<T>): Future<T> {
        const next = new Future<T>(this as any as Task<T>);
        next.#promise = next.#promise.catch(onRejected);
        return next;
    }

    /**
     * Call the handler when the task completes, regardless of success.
     *
     * @param onFinally Handler to be called when the task is complete.
     * @returns a new {@link Future} instance.
     */
    finally(onFinally: OnFinally) {
        const next = new Future<T>(this as any as Task<T>);
        next.#promise = next.#promise.finally(onFinally);
        return next;
    }

    /**
     * Identical to {@link #then}, but does not start the task.
     *
     * @param onFulfilled
     * @param onRejected
     * @returns
     */
    when<R>(onFulfilled: OnFulfilled<T, R>, onRejected: OnRejected<R>) {
        const next = new Future<R>(this as any as Task<R>);
        next.#promise = this.#promise.then(onFulfilled, onRejected);
        return next;
    }

    /**
     * Register a handler to be called when the task starts.
     * @param handler
     * @returns this {@link Future} instance.
     */
    onStart(handler: OnStart) {
        this.#s.onStartPromise.then(handler);
        return this;
    }

    /**
     * Start the task, if not already started.
     *
     * @returns this {@link Future} instance.
     */
    start() {
        this.#s.task?.call(this.#s.context, this.#s.context);
        return this;
    }

    /**
     * Cancel a pending or started {@link Future} task, by setting the {@link #state}
     * to {@link #CANCELLED}, and calling the {@link #onCancel} handlers, if any.
     * The {@link Future} is rejected with a {@link CancelledException} exception.
     *
     * Cancellation-aware computations receive a {@link CancelContext} object via
     * `this` when they are invoked. They should await on {@link CancelContext#runable}
     * to determine if they should continue running. If the {@link Future} is cancelled,
     * the {@link CancelContext#runable} will be rejected with
     * a {@link CancelledException} exception.
     *
     * Waiting on a {@link CancelContext#runable} also enables the
     * {@link Future#pause}/{@link Future#resume} functionality.
     *
     * Cancellation must be enabled at the time of creation of the {@link Future}
     * via the {@link FutureOptions#cancel} parameter.
     *
     * If the state is post-{@link #RUNNING} (e.g. {@link #REJECTED} or {@link #FULFILLED})
     * this function does nothing.
     *
     * If the {@link Future} is cancelled, the {@link #onCancel} handlers are called.
     *
     * ![State Diagram for cancel()](../images/cancel.svg)
     *
     * @param msg A custom message to be included in the {@link CancelledException} exception.
     * @returns this {@link Future} instance.
     */
    cancel(msg : string | CancelledException<T> = "Cancelled") {
        if (! this.#s.canCancel) {
            throw new Error("Cancellation was not enabled for this Future.");
        }
        let cancel = typeof msg === 'string' ? new CancelledException(this, msg ?? 'Cancelled', this.#s.startTime) : msg;
        this.#resolved(
            State.CANCELLED,
            this.#s.onCancel,
            cancel,
            cancel
        );
        return this;
    }

    /**
     * Register a _handler_ to call when the {@link Future} is cancelled.
     *
     * @param handler
     * @returns this {@link Future} instance.
     */
    onCancel(handler: FailCallback<CancelledException<T>>) {
        this.#s.onCancelPromise?.catch(handler);
        return this;
    }

    /**
     * Force a timeout exception. Not intended for public use, but
     * does what you'd expect: sets the state to {@link #TIMEOUT}, and
     * calls the {@link #onTimeout} handlers, if any.
     *
     * @param e a {@link TimeoutException} instance.
     */
    forceTimeout(e: TimeoutException<T>) {
        this.#resolved(
            State.TIMEOUT,
            this.#s.onTimeout,
            e,
            e
        );
        return this;
    }

    /**
     * Register a _handler_ to call when the {@link Future} times out.
     *
     * Futures constructed with {@link #timeout} or {@link #timeoutAfter}
     * will be rejected with a {@link TimeoutException} exception. This handler
     * is called only on actual timeout.
     *
     * @param handler
     */
    onTimeout(handler: FailCallback<TimeoutException<T>>) {
        this.#s.onTimeoutPromise.catch(handler);
        return this;
    }

    pause() {
        this.#s.pause();

    }

    resume() {
        this.#s.resume();
    }

    /**
     * Construct a pre-resolved {@link Future}.
     *
     * This is useful in testing or when a resolved promise is needed that
     * also is expected to be a {@link Future}.
     *
     * ![State diagram for Future.resolve](../../images/resolve.svg)
     *
     * @param v A value or a Promise-like container for a value.
     * @returns a {@link Future} pre-resolved to that value.
     */
    static resolve<T>(v: T) : Future<T> {
        return new Future<T>(() => Promise.resolve(v)).start();
    }

    /**
     * Construct a pre-rejected {@link Future}.
     *
     * This is useful in testing or when a resolved promise is needed that
     * also is expected to be a {@link Future}.
     *
     * ![State diagram for Future.reject](../../images/reject.svg)
     *
     * @param e An exception or a Promise-like container for an exception.
     * @returns a {@link Future} pre-rejected with that exception.
     */
    static reject<T>(e: any) : Future<T> {
        return new Future<T>(() => Promise.reject(e)).start();
    }

    /**
     * Create a pre-cancelled {@link Future}.
     *
     * This is useful in testing or when a resolved promise is needed that
     * also is expected to be a {@link Future}.
     *
     * ![State diagram for Future.cancelled](../../images/cancelled.svg)
     *
     * @param c A {@link CancelledException} exception to be used, or a msg to be used to create one.
     * @returns
     */
    static cancelled<T>(c: CancelledException<T> | string = 'Cancelled'): Future<T> {
        return new Future<T>(() => Future.never<T>(), {cancel: true}).cancel(c ?? 'Cancelled');
    }

    /**
     * Create a {@link Future} that will never complete. This is useful for tests, or
     * as a placeholder that can be subsequently cancelled.
     *
     * It can also be used with {@link #timeout} or {@link #timeoutFromNow}
     * to create a fixed timeout.
     *
     * ![State diagram for Future.never](../../images/never.svg)
     *
     * @returns a {@link Future} that will never complete.
     */
    static never<R>(): Future<R> {
        return new Future<R>(() => new Promise(() => { }));
    }

    /**
     * Create a {@link Future} that will complete when any one of the specified
     * `Thenables` has completed.  The first one to complete will be the result.
     *
     * The race begins when {@link #then} or {@link #start} is called.
     * Unlike `Promise.race`(), {@link Future} computations are not started when this
     * is called, but rather, when the result is requested.
     */
    static race<T>(thenables: Iterable<PromiseLike<T>>): Future<T> {
        return new Future<T>(() => Promise.race(thenables));
    }

    /**
     * Create a {@link Future} that will complete when all of the specified
     * `Thenables` have completed.  The result will be an array of the results
     * of the `Thenables` if fulfilled, or the first rejection reason.
     *
     * Unlike `Promise`.`all`(), {@link Future} computations are not started when this
     * is called, but rather, when te result is requested.
     */
    static all<T>(thenables: Iterable<PromiseLike<T>>): Future<T[]> {
        return new Future<T[]>(() => Promise.all(thenables));
    }

    /**
     * Create a {@link Future} that will complete when all of the specified
     * `Thenables` have completed.  The result will be an array of result
     * specifiers with the results of the `Thenables`.
     *
     * The return value is an array of outcome objects with the following properties:
     * - `status`: "fulfilled" or "rejected"
     * - `value`: the value if fulfilled, or the rejection reason if rejected
     * - `reason`: the rejection reason if rejected, or undefined if fulfilled
     *
     * Unlike `Promise`.`allSettled`(), {@link Future} computations are not started when this
     * is called, but rather, when teh result is requested.
     */
    static allSettled<T>(thenables: Iterable<PromiseLike<T>>): Future<PromiseSettledResult<T>[]> {
        return new Future<PromiseSettledResult<T>[]>(() => Promise.allSettled(thenables));
    }

    /**
     * Create a {@link Future} that will complete when any one of the specified `Thenables`
     * settle(s).  The result will be the result of the first `Thenable` to settle.
     *
     * Equivalent to `Promise.any`() exceptthe computations are not started when this
     * is called, but rather, when the result is requested.
     */
    static any<T>(thenables: Iterable<PromiseLike<T>>): Future<T> {
        return new Future<T>(() => Promise.any(thenables));
    }
}
