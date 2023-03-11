/*
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

/**
 * Load the full system with a single import.
 * @packageDocumentation
 * @preferred
 * @module Index
 */

export {Future} from "./future";

export {TimeoutException, CancelledException, FutureException, FinishedException, Throw} from "./utils";

export {State} from "./state";

export type {
    Computation, Continuation, ComputationPromiselike, ComputationSimple,
    OnFinally, OnFulfilled, OnRejected, OnStart, FailCallback,
    UnixTime, Millis, TaskGroupOptions, TaskGroupResultType, TaskType
} from './types'

export {TaskGroup} from './group';
