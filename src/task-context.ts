/*
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import { Future } from "./future";
import { FutureState } from "./future-state";

/**
 * Context argument for cancellation-aware computations.
 */
export class TaskContext<T> {
    #future: Future<T>;
    #s: FutureState<T>;
    constructor(future: Future<T>, s: FutureState<T>) {
        this.#future = future;
        this.#s = s;
    }

    get runable() {
        return this.#s.runable;
    }

    /**
     * Pause the task.
     * 
     * A task might pause itself in response to a user request,
     * or as part of a retry loop after setting a timer..
    */
    pause() {
        this.#s.pause();
    }


    /**
     * Resume the task.
     * 
     * A task might resume itself in response to a user request,
     * or as part of a retry loop after setting a timer.
     */
    resume() {
        this.#s.resume();
    }
}