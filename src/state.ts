/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type {Future} from './future';

/**
 * The state of a {@link Future} in its lifeccle.
 */
export enum State {
    /**
     * The task has not yet been started.
     */
    PENDING = 'PENDING',
    /**
     * The {@link Future} was started with {@link FutureOptions#delay},
     * has been started, but the delay has not yet expired.
     * The task will not be started until the delay expires.
     */
    DELAY = 'DELAY',
    /**
     * The task is in progress.
     * The task may be asynchronous, and may not yet have completed.
     * The task may be cancelled or time out before it completes,
     * resulting in a rejection.
     */
    RUNNING = 'RUNNING',
    /**
     * The task has been paused. It may be resumed.
     * The task may be cancelled or time out before it completes,
     * resulting in a rejection.
     *
     * Only _cancellation-aware_ computations can be effectively paused or
     * cancelled.
     * @see {@link Future#pause}
     * @see {@link Future#resume}
     * @see {@link Future#cancel}
     */
    PAUSED = 'PAUSED',
    /**
     * The task has completed successfully and the result is available.
     * via `await, {@link Future#then}, or {@link Future#when}.
     */
    FULFILLED = 'FULFILLED',
    /**
     * The task has completed with an error, which can be handled
     * via {@link Future#catch} or the second argument to {@link Future#then}
     * or {@link Future#when}.
     */
    REJECTED = 'REJECTED',
    /**
     * The task has timed out and been rejected.
     * The task may still be running, but the result will be ignored.
     *
     * @see {@link FutureOptions#timeoutFromStart}
     * @see {@link FutureOptions#timeoutFromNow}
     * @see {@link Future#onTimeout}
     */
    TIMEOUT = 'TIMEOUT',
    /**
     * The task has been cancelled and been rejected.
     * The task may still be running, but the result will be ignored.
     *
     * @see {@link Future#cancel}
     * @see {@link Future#onCancel}
     */
    CANCELLED = 'CANCELLED'
}
