/*
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

/**
 * Load the full system with a single import.
 * @packageDocumentation
 * @preferred
 * @module Index
 */

export {Future, TimeoutException, CancelledException, FutureException, Throw, State} from "./future";

export type {
    Computation, Continuation, OnFinally, OnFulfilled, OnRejected, OnStart, FailCallback,
    UnixTime, Millis
} from './future'
