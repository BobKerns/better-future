/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */


import type {Future} from './future';
import type {UnixTime, ExternalizedPromise, Millis} from './types';
import {State} from "./state";

/**
 * A FutureException is an exception that is thrown when a {@link Future:type} is cancelled or times out.
 *
 * @typeParam T The type of the result of the {@link Future:type}.
 */
export class FutureException<T> extends Error {
    /**
     * The future that was cancelled or timed out.
     */
    future?: Future<T>;

    /**
     * The time the {@link Future:type} was started.
     */
    startTime: UnixTime;

    /**
     * The time the {@link Future:type} was cancelled or timed out.
     */
    endTime: UnixTime;
    constructor(future: Future<T>, msg: string, start?: UnixTime, end?: UnixTime) {
        super(msg);
        this.future = future;
        this.startTime = start ?? future.startTime!;
        this.endTime = end ?? Date.now();
    }
}

/**
 * A {@link FinishedException} is an exception that is thrown when a {@link Future} is finished
 * and a cancellation-aware task should have any remaining activity aborted.
 *
 * @typeParam T The type of the result of the {@link Future:type}.
 */
export class FinishedException<T> extends FutureException<T> {
    constructor(future: Future<T>,  start?: UnixTime, end: UnixTime = Date.now()) {
        super(future, "The task is complete", start, end);
    }
}

/**
 * A {@link TimeoutException} is an exception that is thrown when a {@link Future} times out.
 *
 * @typeParam T The type of the result of the {@link Future:type}.
 */
export class TimeoutException<T> extends FutureException<T> {
    constructor(future: Future<T>, msg = "Timeout", start?: UnixTime, end: UnixTime = Date.now()) {
        super(future, msg ?? 'Timeout', start, end);
    }
}

/**
 * A {@link CancelledException} is an exception that is thrown when a {@link Future} is cancelled.
 *
 * @typeParam T The type of the result of the {@link Future:type}.
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

/**
 * Adapt a function that expects an object in the first position,
 * to one that expects the object as `this`.
 *
 * If it is not an arrow function, or already bound to an object,
 * `this` will still be supplied.
 *
 * @param f a function with at least one argument
 * @returns
 */
export function withThis<T,R>(f: (thisArg: T, ...args: any) => R) {
    return function(this: T, ...args: any[]) {
        return f.call(this, this, ...args);
    }
}

export const externalizedPromise = <T>(): ExternalizedPromise<T> => {
    let x_resolve: (value: any) => void;
    let x_reject: (reason: any) => void;
    const x_promise = new Promise((resolve, reject) => {
        x_resolve = resolve;
        x_reject = reject;
        }) as ExternalizedPromise<T>;
    x_promise.resolve = x_resolve!;
    x_promise.reject = x_reject!;
    return x_promise;
}

export const delay = (time: Millis) =>
    new Promise((resolve) => setTimeout(resolve, time));

export const isTerminalState = (state: State) =>
    state === State.FULFILLED
    || state === State.TIMEOUT
    || state === State.CANCELLED
    || state === State.REJECTED
