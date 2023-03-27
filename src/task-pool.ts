/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import {Future} from './future';
import { FutureOptions, Task } from './types';
import { TimeoutException } from './utils';

/**
 * A pool of {@link Future}s, which can be used to limit the number of concurrent
 * tasks.
 */
export class TaskPool {
    #size: number;
    #name?: string;
    /**
     * The name of the pool. If not specified, a name will be generated.
     */
    get name() {
        return this.#name || (this.#name = `TaskPool-${TaskPool.#counter++}`);
    }
    static #counter = 0;
    /**
     * Tasks waiting to be run.
     */
    #queue: Set<Future<any>> = new Set();

    /**
     * Tasks currently running.
     */
    #running: Set<Future<any>> = new Set();

    /**
     * If set, a timeout in milliseconds for each task to complete.
     */
    #timeout?: number;
    constructor({size = 1, timeout, name}: {size: number, timeout?: number, name?: number}) {
        this.#size = size
    }

    #run() {
        while (this.#queue.size > 0 && this.#running.size < this.#size) {
            const task = this.#queue.values().next().value;
            this.#queue.delete(task);
            this.#running.add(task);
            if (this.#timeout) {
                const timer = () => setTimeout(() => task.forceTimeout(new TimeoutException(task)),
                    this.#timeout);
                task.onStart(timer);
            }
            task.resume().start().finally(() => this.#running.delete(task));
        }
    }

    #addInternal(task: Future<any>) {
        this.#queue.add(task);
        task.pause();
        this.#run();
        return task;
    }

    /**
     * Add a task to the pool.
     * @param task The task (a {@link Future})
     */
    add<T>(task: Future<T>): Future<T> ;
    /**
     * Add a task to the pool.
     * @param task The task (a {@link Task} function).
     * @param options Options for the task
     * @returns The {@link Future} for the task.
     * @see {@link Future}
     * @see {@link Task}
     * @see {@link FutureOptions}
    */
    add<T>(task: Task<T>, options?: FutureOptions): Future<T> ;
    /**
     * Add a task to the pool.
     * The task can be a {@link Future} or a {@link Task} function.
     */
    add<T>(task: Future<T>|Task<T>, options?: FutureOptions): Future<T> {
        if (task instanceof Future) {
            return this.#addInternal(task)
        }
        return this.#addInternal(new Future(task, options!));
    }
}
