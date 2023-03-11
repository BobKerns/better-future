/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type {
    ComputationSimple, Computation, Continuation,
    FailCallback, Handler, Millis,
    OnFinally, OnFulfilled, OnRejected,
    OnStart, StartCallback,
    UnixTime
    } from './types';

import {State} from './state';

const isSimpleComputation = <T>(c: Computation<T>): c is ComputationSimple<T> =>
    c.length === 0;


const simple = <T>(f: Computation<T>): ComputationSimple<T> =>
    isSimpleComputation(f)
        ? f
        : () => new Promise((accept, reject) =>
            f(accept, reject));


/**
 * Internal shared state of a {@link Future}. This is the shared state of all
 * {@link Future} instances that are derived from a single computation.
 * @hidden
 */
class FutureState<T> {
    // The computation to be performed, or null if it is already started or no longer eligible.
    computation?: ComputationSimple<T> | null;
    // The Promise that handles OnStart handlers.
    #onStartPromise?: Promise<UnixTime>;
    #onStart?: StartCallback | null;
    #ensureStartPromise() {
        if (!this.#onStartPromise) {
            this.#onStartPromise = new Promise<UnixTime>(resolve => {
                this.#onStart = resolve;
            });
            if (this.startTime) {
                this.#onStart?.(this.startTime);
            }
        }
        return this.#onStartPromise;
    }
    get onStartPromise() {
        return this.#ensureStartPromise();
    }

    // the fulfilled handler for the OnStart promise.
    // Called when the computation is started.
    get onStart(): StartCallback | undefined {
        // null implies this handler is now irrelevant.
        if (this.#onStart === null) {
            return undefined;
        }
        this.#ensureStartPromise();
        return this.#onStart;
    }

    set onStart(onStart: StartCallback | null | undefined) {
        this.#onStart = onStart;
    }

    // The Promise that handles OnTimeout handlers.
    #onTimeoutPromise?: Promise<TimeoutException<T>>;
    #onTimeout?: FailCallback<TimeoutException<T>> | null;
    #ensureTimeoutPromise() {
        if (!this.#onTimeoutPromise) {
            this.#onTimeoutPromise = new Promise<TimeoutException<T>>(
                (resolve, reject) => (this.#onTimeout = resolve)
            );
            if (this.startTime) {
                this.#onStart?.(this.startTime);
            }
        }
        return this.#onTimeoutPromise;
    }

    get onTimeoutPromise() {
        return this.#ensureTimeoutPromise();
    }

    // the fulfilled handler for the OnTimeout promise
    // Called when the computation times out.
    get onTimeout(): FailCallback<TimeoutException<T>> | undefined {
        // null implies this handler is now irrelevant.
        if (this.#onTimeout === null) {
            return undefined;
        }
        this.#ensureTimeoutPromise();
        return this.#onTimeout;
    }

    set onTimeout(onTimeout: FailCallback<TimeoutException<T>> | null | undefined) {
        this.#onTimeout = onTimeout;
    }

    // The Promise that handles OnCancel handlers.
    #onCancelPromise?: Promise<CancelledException<T>>;
    #onCancel?: FailCallback<CancelledException<T>> | null;
    #ensureCancelPromise() {
        if (!this.#onCancelPromise) {
            this.#onCancelPromise = new Promise<CancelledException<T>>(
                (resolve, reject) => (this.#onCancel = resolve)
            );
        }
        return this.#onCancelPromise;
    }

    get onCancelPromise() {
        return this.#ensureCancelPromise();
    }

    // The fulfilled handler for the OnCancel promise
    // Called when the computation is cancelled.
    get onCancel(): FailCallback<CancelledException<T>> | undefined {
        // null implies this handler is now irrelevant.
        if (this.#onCancel === null) {
            return undefined;
        }
        this.#ensureCancelPromise();
        return this.#onCancel;
    }

    set onCancel(onCancel: FailCallback<CancelledException<T>> | undefined | null) {
        this.#onCancel = onCancel;
    }

    //
    startTime?: UnixTime;
    // Enables cancellation and timeout.
    reject?: FailCallback<Error>;
    //
    exception?: Error;
    // The current state of the Future
    state: State = State.PENDING;

    // Create an initialize the shared state.
    constructor() {
    }
}

/**
 * A {@link Future} is a computation that will be performed in the future.
 * It is a promise that can be cancelled or timed out, but does not begin
 * running until until there is a {@link #then} handler for it, or it is
 * explicitly started with {@link #start}.
 *
 * A {@link Future} can be in one of these states:
 *
 * * {@link #PENDING}: The initial state. The computation has not yet been started.
 * * {@link #RUNNING}: The computation has been started, but has neither returned nor
 *   thrown an exception. This corresponds to the _Pending_ state in a
 *   [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
 * * {@link #FULFILLED} The computation has returned a value.
 * * {@link #REJECTED}: The computation has thrown an exception or returned a rejected
 *   [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
 * * {@link #CANCELLED}: After being cancelled, the {@link Future} will be in this
 *   state until all {@link #onCancel} handlers have been called, after which it
 *   transitions to {@link #REJECTED}. {@link #state} will remain at {@link #CANCELLED}
 *   to denote why it was rejected.
 * * {@link #TIMEOUT}: If a {@link Future} times out (see {@link #timeout}, it will be in
 *    this state until all {@link #onTimeout} handlers have been run.
 *
 * At their simplest, a {@link Future}, once created, can be used exactly like a `Promise`,
 * with the execution of the computation deferred until the first {@link #then} handler is
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
 * Timeouts are layered on top of the basic {@link Future} states above. The exact diagram
 * depends on whether {@link #timeout} or {@link #timeoutAfter} is used.
*/
export class Future<T> {
    /**
     * Shared state
     * @hidden
     */
    #s: FutureState<T>;

    /**
     * The promise that will be resolved when the computation is complete.
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
     * Takes a computation to be performed in the future. The _comutation_ is
     * either:
     * * a function of 0 arguments that will receive  the
     *   {@link Future} instance itself as its implicit `this` parameter. The computation may return a value, which is
     *   then received by the caller of the {@link Future} instance via the {@link #then}
     *   or {@link #catch} methods. The computation may also return a `Promise`,
     *   whose value will be used in the same way.
     * * a function of 2 arguments, the first of which is a {@link ResolveCallback} and the second of which is a
     *   {@link FailCallback}. The computation may call the {@link ResolveCallback} to
     *   resolve the {@link Future} with a value, or the {@link FailCallback} to reject it
     *   with an exception. The computation may also return a `Promise`, whose value will
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
     * @param computation
     */
    constructor(computation: Computation<T>)  {
        if (computation instanceof Future) {
            const o = computation;
            this.#s = o.#s;
            this.#promise = o.#promise;
        } else {
            this.#s = new FutureState();
            this.#promise = new Promise<T>((resolve, reject) => {
                // Our internal computation wraps the supplied one to handle
                //
                this.#s.computation = (): T | PromiseLike<T> => {
                    this.#s.computation = null;
                    this.#s.state = State.RUNNING;
                    this.#s.startTime = Date.now();
                    this.#s.onStart?.(this.#s.startTime);
                    try {
                        if (isSimpleComputation(computation)) {
                            const v = computation.call(this );
                            resolve(v);
                            return v;
                        } else {
                            computation(resolve, reject);
                            return undefined as T;
                        }
                    } catch (e: unknown) {
                        // Not if this is already resolved.
                        if (this.#s.state === State.RUNNING) {
                            this.#s.exception = e as Error;
                            this.#s.state = State.REJECTED;
                        }
                        reject(e);
                        return undefined as T;
                    }
                };
            })
            .then(
                (v: T|undefined) => this.#resolved(State.FULFILLED, undefined as any as Handler<T|undefined>, v, null),
                (e) =>
                    Throw(e instanceof TimeoutException<T>
                            ? this.#resolved(State.TIMEOUT, this.#s.onTimeout, e, e)
                            : e instanceof CancelledException<T>
                                ? this.#resolved(State.CANCELLED, this.#s.onCancel!, e, e)
                                : this.#resolved(State.REJECTED, null , e, e))
            );
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
        this.#s.state = state;
        this.#s.computation = this.#s.onCancel = undefined;
        this.#s.onTimeout = this.#s.onStart = undefined;
        if (e) this.#s.exception = e;
        handler?.(v);
        return v;
    }

    /**
     * Starts the computation, then returns a new {@link Future}
     * that will be resolved when the computation
     * is complete, and which will resolve with the result of _onFulfilled_ being
     * the computation's value. If the computation throws an exception, the new
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
        this.#s.computation?.call(this);
        const next = new Future<R|E>(this as any as Computation<R|E>);
        next.#promise = this.#promise.then(onFulfilled, onRejected);
        return next;
    }

    /**
     * Handles rejected {@link Future} instances. This does not start the computation,
     * since in most cases, we are interested in the fulfillment of the {@link Future},
     * not its rejection.
     *
     * Often, {@link #catch} handlers are set up separately from the {@link #then}
     * handlers that consume the result.
     *
     * If you need the computation started, use {@link #start}, use {@link #catch}
     * together with {@link #then}, or use the two-argument form of the {@link #then}method.
     *
     * See {@link #then} for more details.
     *
     * @param onRejected the handler to be called if the computation throws an exception.
     * @returns a new {@link Future} instance.
     */
    catch(onRejected: OnRejected<T>): Future<T> {
        const next = new Future<T>(this as any as Computation<T>);
        next.#promise = next.#promise.catch(onRejected);
        return next;
    }

    /**
     * Call the handler when the computation completes, regardless of success.
     *
     * @param onFinally Handler to be called when the computation is complete.
     * @returns a new {@link Future} instance.
     */
    finally(onFinally: OnFinally) {
        const next = new Future<T>(this as any as Computation<T>);
        next.#promise = next.#promise.finally(onFinally);
        return next;
    }

    /**
     * Identical to {@link #then}, but does not start the computation.
     *
     * @param onFulfilled
     * @param onRejected
     * @returns
     */
    when<R>(onFulfilled: OnFulfilled<T, R>, onRejected: OnRejected<R>) {
        const next = new Future<R>(this as any as Computation<R>);
        next.#promise = this.#promise.then(onFulfilled, onRejected);
        return next;
    }

    /**
     * Register a handler to be called when the computation starts.
     * @param handler
     * @returns this {@link Future} instance.
     */
    onStart(handler: OnStart) {
        this.#s.onStartPromise.then(handler);
        return this;
    }

    /**
     * Start the computation, if not already started.
     *
     * @returns this {@link Future} instance.
     */
    start() {
        this.#s.computation?.call(this);
        return this;
    }

    /**
     * Cancel a pending or started {@link Future} computation, by setting the {@link #state}
     * to {@link #CANCELLED}, and calling the {@link #onCancel} handlers, if any.
     * The {@link Future} is rejected with a {@link CancelledException} exception.
     *
     * Cancellation-aware computations should check the {@link #isCancelled} proprety,
     * or use the {@link #check} method, to terminate early.
     *
     * If the state is not {@link #PENDING} or {@link #RUNNING}, this method
     * does nothing.
     *
     * ![State Diagram for cancel()](../images/cancel.svg)
     *
     * @param msg A custom message to be included in the {@link CancelledException} exception.
     * @returns this {@link Future} instance.
     */
    cancel(msg : string | CancelledException<T> = "Cancelled") {
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

    /**
     * A flag indicating to cancellation-aware computations that they should
     * terminate early.
     */
    get isCancelled() {
        return !(this.#s.state === State.PENDING || this.#s.state === State.RUNNING);
    }

    /**
     * An alternative for cancellation-aware computations to using {@link #isCancelled}.
     *
     * The supplied _continuation_ is called only if the {@link Future} is in the
     * {@link #RUNNING} state. Otherwise, an exception is thrown, so the calling
     * computation can be terminated.
     */
    check<R>(continuation: Continuation<T,R>) {
        switch (this.#s.state) {
            case "PENDING":
                throw new Error(
                    "Check is to be used as part of a running Future computation."
                );
            case "RUNNING":
                return continuation(this);
            case "TIMEOUT":
            case "CANCELLED":
                throw this.#s.exception;
            default:
                throw new Error("Computation has already completed.");
        }
    }

    /**
     * Create a {@link Future} that will not start until the specified delay
     * after the computation is requested.
     *
     * To immediately start the delay countdown:
     *
     * ```javascript
     * Future.delay(myComputation).start()
     * ```
     *
     * Delay injects a delay into the {@link #RUNNING} state, so the computation
     * will not start until the delay has elapsed.
     *
     * ![State diagram for Future.delay](../images/delay.svg)
     *
     * @param delay the delay in milliseconds.
     * @returns the delaed {@link Future}.
     */
    static delay(delay: Millis): <T>(a: Computation<T>) => Future<T> {
        return <T>(computation: Computation<T>) => {
            const p = new Promise((resolve, reject) => setTimeout(resolve, delay));
            const f: ComputationSimple<T> = simple(computation);
            const future: Future<T> = new Future<T>(() => p.then(() => f.call(future)));
            return future;
        };
    }

    /**
     * Create a {@link Future} that will time out _timeout_ milliseconds after
     * the computation is started.
     *
     * ![State diagram for Future.timeoutFromNow](../../images/timeoutFromNow.svg)
     *
     * @param timeout the timeout in milliseconds.
     * @param msg An optional message to be used in the {@link TimeoutException} exception.
     * @returns the timed {@link Future}
     */
    static timeoutFromNow(timeout: Millis, msg = "Timeout") {
        const msg_dflt = msg;
        return <T>(computation: Computation<T>, msg: string = msg_dflt) => {
            // Start the timer now
            const start = Date.now();
            const future: Future<T> = new Future<T>(async (): Promise<T> => {
                const c = Promise.resolve<T>(simple(computation).call(future)).then(
                    (v) => ((future.#s.onTimeout = null), v)
                );
                const p = new Promise<TimeoutException<T>>((resolve, reject) =>
                    setTimeout(() => reject(new TimeoutException(future, msg, Date.now())), timeout)
                ).catch(e => (future.#s.onTimeout?.(e), Throw(e)));
                return await Promise.race([c, p]) as T;
            });
            return future;
        };
    }

    /**
     * Create a {@link Future} that will time out _timeout_ milliseconds after creation,
     * regardless of when or if the result is requested.
     *
     * ![State diagram for Future.timeout](../../images/timeout.svg)
     *
     * @param timeout the timeout in milliseconds.
     * @param msg  An optional message to be used in the {@link TimeoutException} exception.
     * @returns  the timed {@link Future}.
     */
    static timeout(timeout: Millis, msg: string = "Timeout") {
        const msg_dflt = msg;
        return <T>(computation: Computation<T>, msg: string = msg_dflt) => {
            const tmsg = msg ?? msg_dflt;
            const future: Future<T> = new Future<T>(async (): Promise<T> => {
                // Start the timer when the Future executes.
                const start = Date.now();
                const p = new Promise<TimeoutException<T>>((resolve, reject) =>
                    setTimeout(() => resolve(new TimeoutException<T>(future, tmsg, start)), timeout)
                ).then((e) => (future.#s.onTimeout?.(e), Throw(e)));
                const f = simple(computation);
                const c: Promise<T> = Promise.resolve(f.call(future)).then(
                    (v) => ((future.#s.onTimeout = null), v)
                );
                return await Promise.race([p, c]) as T;
            });
            return future;
        };
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
        return new Future<T>(() => Future.never<T>()).cancel(c ?? 'Cancelled');
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

/**
 * A FutureException is an exception that is thrown when a {@link Future} is cancelled or times out.
 */
export class FutureException<T> extends Error {
    /**
     * The future that was cancelled or timed out.
     */
    future?: Future<T>;

    /**
     * The time the {@link Future} was started.
     */
    startTime: UnixTime;

    /**
     * The time the {@link Future} was cancelled or timed out.
     */
    endTime: UnixTime;
    constructor(future:  Future<T>, msg: string, start?: UnixTime, end?: UnixTime) {
        super(msg);
        this.future = future;
        this.startTime = start ?? future.startTime!;
        this.endTime = end ?? Date.now();
    }
}

/**
 * A {@link TimeoutException} is an exception that is thrown when a {@link Future} times out.
 */
export class TimeoutException<T> extends FutureException<T> {
    constructor(future: Future<T>, msg = "Timeout", start?: UnixTime , end: UnixTime = Date.now()) {
        super(future, msg ?? 'Timeout', start, end);
    }
}

/**
 * A {@link CancelledException} is an exception that is thrown when a {@link Future} is cancelled.
 */
export class CancelledException<T> extends FutureException<T> {
    constructor(future: Future<T>, msg = "Cancelled", start?: UnixTime, end: UnixTime = Date.now()) {
        super(future, msg ?? 'Cancelled', start, end);
    }
}

/**
 * Functonal form of `throw`. May be passed to {@link Future#catch} as a no-op.
 * @param e Exception to be thrown
 */
export const Throw = (e: any = new Error()) => {
    throw e;
};
