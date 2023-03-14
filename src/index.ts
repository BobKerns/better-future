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

export {
    TimeoutException, CancelledException, FutureException, FinishedException,
    Throw, withThis, delay
} from "./utils";

export {State} from "./state";

export type {
    Task as Task, Continuation, PromiseLikeTask, SimpleTask,
    OnFinally, OnFulfilled, OnRejected, OnStart, FailCallback,
    UnixTime, Millis, TaskGroupOptions,  FutureOptions
} from './types'

export {TaskGroupResultType, TaskType} from './enums';

export {TaskGroup} from './task-group';

export {TaskContext} from './task-context';
