/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type {Future} from './future';

/**
 * The state of a {@link Future} in its lifeccle.
 */
export const enum State {
    /**
     * The computation has not yet been started.
     */
    PENDING = 'PENDING',
    /**
     * The {@link Future} was started with {@link Future.delay},
     * has been started, but the delay has not yet expired.
     * The computation will not be started until the delay expires.
     */
    DELAY = 'DELAY',
    /**
     * The computation is in progress.
     * The computation may be asynchronous, and may not yet have completed.
     * The computation may be cancelled or time out before it completes,
     * resulting in a rejection.
     */
    RUNNING = 'RUNNING',
    /**
     * The computation has been paused. It may be resumed.
     * The computation may be cancelled or time out before it completes,
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
     * The computation has completed successfully and the result is available.
     * via `await, {@link Future#then}, or {@link Future#when}.
     */
    FULFILLED = 'FULFILLED',
    /**
     * The computation has completed with an error, which can be handled
     * via {@link Future#catch} or the second argument to {@link Future#then}
     * or {@link Future#when}.
     */
    REJECTED = 'REJECTED',
    /**
     * The computation has timed out and been rejected.
     * The computation may still be running, but the result will be ignored.
     *
     * @see {@link Future.timeout}
     * @see {@link Future.timeoutFromNow}
     * @see {@link Future#onTimeout}
     */
    TIMEOUT = 'TIMEOUT',
    /**
     * The computation has been cancelled and been rejected.
     * The computation may still be running, but the result will be ignored.
     *
     * @see {@link Future#cancel}
     * @see {@link Future#onCancel}
     */
    CANCELLED = 'CANCELLED'
}
