/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

/**
 *
 */
type Computation<T> = (computation?: Future<T>) => T|PromiseLike<T>;

type Continuation<T, R> = (computation?: Future<T>) => R | PromiseLike<R>;

type Handler<T> = (a: T | PromiseLike<T>) => void;

type OnFulfilled<T,R> = ((a: T) => R | PromiseLike<R>) | null | undefined;

type OnRejected<R> = ((a: any) => R | PromiseLike<R>) | null | undefined;

type OnFinally = () => void;

type UnixTime = number;

type Millis = number;

type FailCallback<T extends Error> = Handler<T>;

type StartCallback = Handler<UnixTime>;

const enum State {
    PENDING = 'PENDING',
    STARTED = 'STARTED',
    FULFILLED = 'FULFILLED',
    REJECTED = 'REJECTED',
    TIMEOUT = 'TIMEOUT',
    CANCELLED = 'CANCELLED'
}

class FutureState<T> {
    // The computation to be performed, or null if it is already started or no longer eligible.
    computation?: Computation<T> | null;
    onStartPromise: Promise<UnixTime>;
    onTimeoutPromise: Promise<Timeout<T>>;
    onCancelPromise: Promise<Cancelled<T>>;
    onStart?: StartCallback | null;
    onTimeout?: FailCallback<Timeout<T>> | null;
    onCancel?: FailCallback<Cancelled<T>> | null;
    startTime?: UnixTime;
    // Enables cancellation and timeout.
    reject?: FailCallback<Error>;
    exception?: Error;
    state: State = State.PENDING;

    constructor() {
        this.onStartPromise = new Promise<UnixTime>(
            (resolve, reject) => (this.onStart = resolve)
        );
        this.onTimeoutPromise = new Promise(
            (resolve, reject) => (this.onTimeout = resolve)
        );
        this.onCancelPromise = new Promise(
            (resolve, reject) => (this.onCancel = resolve)
        );
    }
}

export class Future<T> {
    #s: FutureState<T>; // shared state.
    #promise: Promise<T>;
    static get [Symbol.species]() {
        return Future;
    }
    get state() {
        return this.#s.state;
    }
    constructor(computation: Computation<T>)  {
        if (computation instanceof Future) {
            const o = computation;
            this.#s = o.#s;
            this.#promise = o.#promise;
        } else {
            this.#s = new FutureState();
            this.#promise = new Promise<T>((resolve, reject) => {
                this.#s.computation = (): T | PromiseLike<T> => {
                    this.#s.computation = null;
                    this.#s.state = State.STARTED;
                    this.#s.startTime = Date.now();
                    this.#s.onStart?.(this.#s.startTime);
                    try {
                        const v = computation(this);
                        resolve(v);
                        return v;
                    } catch (e: unknown) {
                        // Not if this is already resolved.
                        if (this.#s.state === State.STARTED) {
                            this.#s.exception = e as Error;
                        }
                        reject(e);
                        throw e;
                    }
                };
            }).then(
                (v: T) => this.#resolved(State.FULFILLED, undefined as any as Handler<T>, v, null),
                (e) =>
                    Throw(e instanceof Timeout
                            ? this.#resolved(State.TIMEOUT, this.#s.onTimeout, e, e)
                            : e instanceof Cancelled
                                ? this.#resolved(State.CANCELLED, this.#s.onCancel!, e, e)
                                : this.#resolved(State.REJECTED, null , e, e))
            );
        }
    }
    // Arrive at a final state.
    #resolved<T>(state: State, handler: Handler<T> | null | undefined, v: T, e: Error | null) {
        this.#s.state = state;
        this.#s.computation = this.#s.onCancel = null;
        this.#s.onTimeout = this.#s.onStart = null;
        if (e) this.#s.exception = e;
        handler?.(v);
        return v;
    }
    then<R>(onFulfilled: OnFulfilled<T,R>, onRejected: OnRejected<R>): Future<R> {
        this.#s.computation?.();
        const next = new Future<R>(this as any as Computation<R>);
        next.#promise = this.#promise.then(onFulfilled, onRejected);
        return next;
    }
    catch(onRejected: OnRejected<T>): Future<T> {
        const next = new Future<T>(this as any as Computation<T>);
        next.#promise = next.#promise.catch(onRejected);
        return next;
    }
    finally(onFinally: OnFinally) {
        const next = new Future(this as any as Computation<T>);
        next.#promise = next.#promise.finally(onFinally);
        return next;
    }
    when<R>(onFulfilled: OnFulfilled<T, R>, onRejected: OnRejected<R>) {
        const next = new Future<R>(this as any as Computation<R>);
        next.#promise = this.#promise.then(onFulfilled, onRejected);
        return next;
    }
    onStart(handler: Handler<UnixTime>) {
        this.#s.onStartPromise.then(handler);
        return this;
    }
    start() {
        this.#s.computation?.();
        return this;
    }
    cancel(msg = "Cancelled") {
        let cancel = new Cancelled(msg, this, this.#s.startTime);
        this.#resolved(
            State.CANCELLED,
            this.#s.onCancel,
            cancel,
            cancel
        );
        return this;
    }
    onCancel(handler: FailCallback<Cancelled<T>>) {
        this.#s.onCancelPromise.catch(handler);
        return this;
    }
    onTimeout(handler: FailCallback<Timeout<T>>) {
        this.#s.onTimeoutPromise.catch(handler);
        return this;
    }
    isCancelled() {
        return !(this.#s.state === State.PENDING || this.#s.state === State.STARTED);
    }
    check<R>(continuation: Continuation<T,R>) {
        switch (this.#s.state) {
            case "PENDING":
                throw new Error(
                    "Check is to be used as part of a running Future computation."
                );
            case "STARTED":
                return continuation(this);
            case "TIMEOUT":
            case "CANCELLED":
                throw this.#s.exception;
            default:
                throw new Error("Computation has already completed.");
        }
    }

    static delay<T>(delay: Millis): (a: Computation<T>) => Future<T> {
        return (computation: Computation<T>) => {
            const p = new Promise((resolve, reject) => setTimeout(resolve, delay));
            return new Future<T>(() => p.then<T>(() => computation()));
        };
    }
    static timeoutFromNow<T>(timeout: Millis, msg = "Timeout") {
        const msg_dflt = msg;
        return (computation: Computation<T>, msg: string = msg_dflt) => {
            // Start the timer now
            const start = Date.now();
            const future: Future<T> = new Future<T>(async (): Promise<T> => {
                const c = Promise.resolve(computation()).then(
                    (v) => ((future.#s.onTimeout = null), v)
                );
                const p = new Promise<Timeout<T>>((resolve, reject) =>
                    setTimeout(() => resolve(new Timeout(msg, future, Date.now())), timeout)
                ).then(e => (future.#s.onTimeout?.(e), Throw(e)));
                return await Promise.race([p, c]);
            });
            return future;
        };
    }
    static timeout<T>(timeout: Millis, msg: string = "Timeout") {
        const msg_dflt = msg;
        return (computation: Computation<T>, msg: string = msg_dflt) => {
            const tmsg = msg ?? msg_dflt;
            const future: Future<T> = new Future<T>(async (): Promise<T> => {
                // Start the timer when the Future executes.
                const start = Date.now();
                const p = new Promise<Timeout<T>>((resolve, reject) =>
                    setTimeout(() => resolve(new Timeout<T>(tmsg, future, start)), timeout)
                ).then((e) => (future.#s.onTimeout?.(e), Throw(e)));
                const c: Promise<T> = Promise.resolve(computation()).then(
                    (v) => ((future.#s.onTimeout = null), v)
                );
                return await Promise.race([p, c]);
            });
            return future;
        };
    }
}

export class FutureException<T> extends Error {
    future;
    start;
    end;
    constructor(msg: string, future?:  Future<T>, start?: UnixTime, end?: UnixTime) {
        super(msg);
        this.future = future;
        this.start = start;
        this.end = end;
    }
}

export class Timeout<T> extends FutureException<T> {
    constructor(msg = "Timeout", future: Future<T>, start?: UnixTime , end: UnixTime = Date.now()) {
        super(msg, future, start, end);
    }
}

export class Cancelled<T> extends FutureException<T> {
    constructor(msg = "Timeout", future: Future<T>, start?: UnixTime, end: UnixTime = Date.now()) {
        super(msg, future, start, end);
    }
}

const Throw = (e: any = new Error()) => {
    throw e;
};
