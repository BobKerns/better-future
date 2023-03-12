/**
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type { SimpleTask, StartCallback, FailCallback, UnixTime } from "./types";
import type { Future } from './future'
import { State } from "./state";
import { TimeoutException, CancelledException, FinishedException } from "./utils";
import { TaskContext } from "./task-context";


/**
 * Internal shared state of a {@link Future}. This is the shared state of all
 * {@link Future} instances that are derived from a single task
 * @hidden
 */
export class FutureState<T> {
    // The initial Future
    #head: Future<T>;
    #context?: TaskContext<T>;

    get context(): TaskContext<T> {
        if (!this.#context) {
            this.#context = new TaskContext(this.#head, this);
        }
        return this.#context!
    }

    // The task to be performed, or null if it is already started or no longer eligible.
    task?: SimpleTask<T> | null;
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
    // Called when the task is started.
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
    // Called when the task times out.
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
    // Called when the task is cancelled.
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

    /**
     * Handler to resolve the {@link #pausePromise}
     */
    #resume?: (v: TaskContext<T>) => void;

    /**
     * The `Promise` to resolve to resume the task
     */
    #pausePromise?: Promise<TaskContext<T>>;

    /**
     * The level of pause nesting.
     */
    #pauseLevel: number = 0;


    // Create an initialize the shared state.
    constructor(head: Future<T>) {
        this.#head = head;
    }

    /**
     * A flag indicating to timeout-aware computations that they should proceed, pause,
     * or terminate.
     *
     * A `Promise` that resolves to this {@link Future} instance if the `Future` is
     * runnable, an unresolved `Promise` if it is {@link #PAUSED}, or a rejected
     * promise if it should terminate.
     */
    get runable(): Promise<TaskContext<T>> {
        switch (this.state) {
            case State.PENDING:
                throw new Error(
                    ".runable is to be used as part of a running Future task."
                );
            case State.RUNNING:
                return Promise.resolve(this.context);
            case State.PAUSED:
                return this.#pausePromise!;
            case State.TIMEOUT:
            case State.CANCELLED:
                return Promise.reject(this.exception);
            default:
                return Promise.reject(new FinishedException(this.#head, this.startTime));
        }
    }

    #setPause() {
        this.state = State.PAUSED;
        if (this.#pauseLevel === 1) {
            this.#pausePromise = new Promise<TaskContext<T>>((resolve) => {
                this.#resume = resolve;
            });
        }
    }
    pause() {
        this.#pauseLevel++;
        if (this.state === State.RUNNING) {
            this.#setPause();
        }
    }

    resume() {
        if (this.#pauseLevel > 0) {
            this.#pauseLevel--;
            if (this.#pauseLevel === 0 && this.state === State.PAUSED) {
                this.state = State.RUNNING;
                this.#resume?.(this.context);
            }
        }
    }

    call(f: SimpleTask<T>) {
        return f.call(this.context);
    }
}
