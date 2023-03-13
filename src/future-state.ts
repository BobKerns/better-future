/**
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import type { UnixTime, ExternalizedPromise, FutureOptions} from "./types";
import type { Future } from './future'
import { State } from "./state";
import { TimeoutException, CancelledException, FinishedException, externalizedPromise } from "./utils";
import { TaskContext } from "./task-context";


/**
 * Internal shared state of a {@link Future:type}. This is the shared state of all
 * {@link Future:type} instances that are derived from a single task
 * @hidden
 */
export class FutureState<T> {
    // The initial Future
    #head: Future<T>;


// The task to be performed, or null if it is already started or no longer eligible.
    task?: null | ((ctx: TaskContext<T>) => Promise<void>);

    legacyTask?: boolean;

    #auxPromise?: ExternalizedPromise<TaskContext<T>>;
    get auxPromise() {
        if (this.#auxPromise) {
            return this.#auxPromise;
        }
        return this.#auxPromise = externalizedPromise();
    }

    #canCancel: boolean = false;
    get canCancel() {
        return this.#canCancel;
    }

    /**
     * The {@link TaskContext} to supply to the task.
     */
    #context?: TaskContext<T>;

    /**
     * Get or create the {@link TaskContext} for this task.
     * @returns The {@link TaskContext} for this task.
     */
    get context(): TaskContext<T> {
        if (!this.#context) {
            return this.#context = new TaskContext(this.#head, this);
        }
        return this.#context!
    }

    // The Promise that handles OnStart handlers.
    #onStartPromise?: ExternalizedPromise<UnixTime>;
    get onStartPromise() {
        if (!this.#onStartPromise) {
            this.#onStartPromise = externalizedPromise();
        }
        if (this.startTime !== undefined) {
            this.#onStartPromise.resolve(this.startTime);
        }
        return this.#onStartPromise;
    }
    get onStart() {
        return this.onStartPromise?.resolve;
    }

    // The Promise that handles OnTimeout handlers.
    #onTimeoutPromise?: ExternalizedPromise<TimeoutException<T>>;
    get onTimeoutPromise() {
        if (!this.#onTimeoutPromise) {
            this.#onTimeoutPromise = externalizedPromise();
            if (this.exception instanceof TimeoutException) {
                this.#onTimeoutPromise.resolve(this.exception);
            }
        }
        return this.#onTimeoutPromise;
    }
    get onTimeout() {
        return this.#onTimeoutPromise?.resolve;
    }

    #onCancelPromise?: ExternalizedPromise<CancelledException<T>>;
    get onCancelPromise() {
        if (!this.#onCancelPromise) {
            this.#onCancelPromise = externalizedPromise();
        }
        if (this.exception instanceof CancelledException) {
            this.#onCancelPromise.resolve(this.exception);
        }
        return this.#onCancelPromise;
    }
    get onCancel() {
        return this.#onCancelPromise?.resolve;
    }

    /**
     * The time at which the task was started.
     */
    startTime?: UnixTime;

    /**
     * Exception to be passed along.
     */
    exception?: Error;

    /** The current state of the task. */
    state: State = State.PENDING;

    /**
     * The `Promise` to resolve to resume the task
     */
    #pausePromise?: ExternalizedPromise<TaskContext<T>>;
    get pausePromise() {
        if (!this.#pausePromise) {
            this.#pausePromise = externalizedPromise();
        }
        return this.#pausePromise;
    }

    /**
     * The level of pause nesting.
     */
    #pauseLevel: number = 0;


    // Create an initialize the shared state.
    constructor(head: Future<T>, options?: FutureOptions) {
        this.#head = head;
        this.#canCancel = options?.cancel ?? false;
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
                return this.#auxPromise
                    ? Promise.race([this.#auxPromise, this.#pausePromise!])
                    : this.#pausePromise!;
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
            this.#pausePromise = externalizedPromise()
        }
    }

    /**
     * Pause the task. The task will be resumed when {@link #resume} is called.
     * The task may be paused multiple times, but each call to {@link #resume}
     * must be balanced with a call to {@link #pause}.
     */
    pause() {
        this.#pauseLevel++;
        if (this.state === State.RUNNING) {
            this.#setPause();
        }
    }

    /**
     * Resume the task. The task will be resumed when if an equal number of calls
     * to {@link #pause} and {@link #resume} have been made.
     */
    resume() {
        if (this.#pauseLevel > 0) {
            this.#pauseLevel--;
            if (this.#pauseLevel === 0 && this.state === State.PAUSED) {
                this.state = State.RUNNING;
                const p = this.pausePromise;
                this.#pausePromise = undefined;
                p.resolve(this.context);
            } else if (this.#pauseLevel < 0) {
                throw new Error("Unbalanced pause/resume");
            }
        }
    }

    /**
     * Cancel the current task.
     * @param msg Optional message to include in the exception
     * @returns
     */
    cancel(msg = "Cancelled") {
        return this.#head.cancel(msg);
    }
}
