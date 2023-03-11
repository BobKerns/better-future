/**
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type { ComputationSimple, StartCallback, FailCallback, UnixTime } from "./types";
import { State } from "./state";
import { TimeoutException, CancelledException } from "./utils";


/**
 * Internal shared state of a {@link Future}. This is the shared state of all
 * {@link Future} instances that are derived from a single computation.
 * @hidden
 */
export class FutureState<T> {
    // The computation to be performed, or null if it is already started or no longer eligible.
    computation?: ComputationSimple<T> | null;
    // The Promise that handles OnStart handlers.
    #onStartPromise?: Promise<UnixTime>;
    #onStart?: StartCallback | null;
    #ensureStartPromise() {
        if (!this.#onStartPromise) {
            this.#onStartPromise = new Promise<UnixTime>(resolve => {
                this.#onStart = resolve;
            });
            if (this.startTime) {
                this.#onStart?.(this.startTime);
            }
        }
        return this.#onStartPromise;
    }
    get onStartPromise() {
        return this.#ensureStartPromise();
    }

    // the fulfilled handler for the OnStart promise.
    // Called when the computation is started.
    get onStart(): StartCallback | undefined {
        // null implies this handler is now irrelevant.
        if (this.#onStart === null) {
            return undefined;
        }
        this.#ensureStartPromise();
        return this.#onStart;
    }

    set onStart(onStart: StartCallback | null | undefined) {
        this.#onStart = onStart;
    }

    // The Promise that handles OnTimeout handlers.
    #onTimeoutPromise?: Promise<TimeoutException<T>>;
    #onTimeout?: FailCallback<TimeoutException<T>> | null;
    #ensureTimeoutPromise() {
        if (!this.#onTimeoutPromise) {
            this.#onTimeoutPromise = new Promise<TimeoutException<T>>(
                (resolve, reject) => (this.#onTimeout = resolve)
            );
            if (this.startTime) {
                this.#onStart?.(this.startTime);
            }
        }
        return this.#onTimeoutPromise;
    }

    get onTimeoutPromise() {
        return this.#ensureTimeoutPromise();
    }

    // the fulfilled handler for the OnTimeout promise
    // Called when the computation times out.
    get onTimeout(): FailCallback<TimeoutException<T>> | undefined {
        // null implies this handler is now irrelevant.
        if (this.#onTimeout === null) {
            return undefined;
        }
        this.#ensureTimeoutPromise();
        return this.#onTimeout;
    }

    set onTimeout(onTimeout: FailCallback<TimeoutException<T>> | null | undefined) {
        this.#onTimeout = onTimeout;
    }

    // The Promise that handles OnCancel handlers.
    #onCancelPromise?: Promise<CancelledException<T>>;
    #onCancel?: FailCallback<CancelledException<T>> | null;
    #ensureCancelPromise() {
        if (!this.#onCancelPromise) {
            this.#onCancelPromise = new Promise<CancelledException<T>>(
                (resolve, reject) => (this.#onCancel = resolve)
            );
        }
        return this.#onCancelPromise;
    }

    get onCancelPromise() {
        return this.#ensureCancelPromise();
    }

    // The fulfilled handler for the OnCancel promise
    // Called when the computation is cancelled.
    get onCancel(): FailCallback<CancelledException<T>> | undefined {
        // null implies this handler is now irrelevant.
        if (this.#onCancel === null) {
            return undefined;
        }
        this.#ensureCancelPromise();
        return this.#onCancel;
    }

    set onCancel(onCancel: FailCallback<CancelledException<T>> | undefined | null) {
        this.#onCancel = onCancel;
    }

    //
    startTime?: UnixTime;
    // Enables cancellation and timeout.
    reject?: FailCallback<Error>;
    //
    exception?: Error;
    // The current state of the Future
    state: State = State.PENDING;

    // Create an initialize the shared state.
    constructor() {
    }
}
