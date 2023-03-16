/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type { TaskGroup } from "./task-group";

/**
 * How the results of a {@link TaskGroup:type} are combined and
 * how and when the group itself is resolved.
 */
export enum TaskGroupResultType {
    /**
     *  The first task to complete is returned, and the others are cancelled.
     */
    FIRST = 'FIRST',
    /**
     * The first rejecion, othetwise an array of all results (in order of adding
     * to the group)). The first rejection cancells all others.
     */
    ALL = 'ALL',
    /**
     * The first task to fulfill is returned. Rejects if all tasks reject.
     * After the task fulfills, the rest are cancelled.
     */
    ANY = 'ANY',
    /**
     * An array of all results (in order of adding to the group).
     */
    ALL_SETTLED = 'ALL_SETTLED',
    /**
     * The result of applying a reducer function to the results of all tasks
     * as they complete. This can result in significantly less memor usage,
     * as there is no need to retain all results simultaneously.
     */
    REDUCE = 'REDUCE'
}

/**
 * The type of task being added to a {@link TaskGroup}.
 */
export enum TaskType {
    /**
     * A normal task is one that is expected to complete normally,
     * and whose value may contribute to the result of the group.
     */
    NORMAL = 'NORMAL',

    /**
     * A background task is one that is expected to complete normallly
     * with the group, but does not contribute to the result of the group.
     */
    BACKGROUND = 'BACKGROUND',

    /**
     * A daemon task is one that is expected to run indefinitely, and
     * should be cancelled when the group is finished.
     */
    DAEMON = 'DAEMON'
}
