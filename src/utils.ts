
/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */


import type {Future} from './future';
import type {UnixTime} from './types';

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
    constructor(future: Future<T>, msg: string, start?: UnixTime, end?: UnixTime) {
        super(msg);
        this.future = future;
        this.startTime = start ?? future.startTime!;
        this.endTime = end ?? Date.now();
    }
}

/**
 * A {@link FinishedException} is an exception that is thrown when a {@link Future} is finished
 * and a cancellation-aware computation should have any remaining activity aborted.
 */
export class FinishedException<T> extends FutureException<T> {
    constructor(future: Future<T>,  start?: UnixTime, end: UnixTime = Date.now()) {
        super(future, "The computation is complete", start, end);
    }
}

/**
 * A {@link TimeoutException} is an exception that is thrown when a {@link Future} times out.
 */
export class TimeoutException<T> extends FutureException<T> {
    constructor(future: Future<T>, msg = "Timeout", start?: UnixTime, end: UnixTime = Date.now()) {
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
