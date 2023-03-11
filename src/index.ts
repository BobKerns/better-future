/*
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

/**
 * Load the full system with a single import.
 * @packageDocumentation
 * @preferred
 * @module Index
 */

export {Future, TimeoutException, CancelledException, FutureException, Throw} from "./future";

export {State} from "./state";

export type {
    Computation, Continuation, OnFinally, OnFulfilled, OnRejected, OnStart, FailCallback,
    UnixTime, Millis, TaskGroupOptions, TaskGroupResultType
} from './types'

export {TaskGroup} from './group';
