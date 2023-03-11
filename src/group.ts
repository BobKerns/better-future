/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import { Future } from './future';
import { TaskGroupResultType, TaskGroupOptions } from './types';

const todo = () => { throw new Error('TODO'); };

type TaskGroupResult<RT extends TaskGroupResultType, T> =
    RT extends TaskGroupResultType.FIRST ? T
    : RT extends TaskGroupResultType.ALL ? T[]
    : RT extends TaskGroupResultType.ANY ? T
    : RT extends TaskGroupResultType.ALL_SETTLED ? PromiseSettledResult<T>[]
    : never;

/**
 *
 * A {@link TaskGroup} is a collection of {@link Future}s that can be run in parallel.
 * and managed as a group.
 */
export class TaskGroup<RT extends TaskGroupResultType, T> extends Future<TaskGroupResult<RT, T>> {
    #result_type: RT;

    #name: string;

    #fullfilled?: (v: TaskGroupResult<RT, T> | PromiseLike<TaskGroupResult<RT, T>>) => void;
    #rejected?: (e?: any) => void;

    #timeout?: number;

    static #counter: number = 0;

    constructor({ resultType, name, timeout }: TaskGroupOptions<RT>) {
        super(
            (fulfilled: (v: TaskGroupResult<RT, T> | PromiseLike<TaskGroupResult<RT, T>>) => void,
                rejected: (e?: any) => void) => {
                this.#fullfilled = fulfilled;
                this.#rejected = rejected;
            });
        this.#result_type = resultType ?? TaskGroupResultType.ALL_SETTLED;
        this.#name = name ?? `TaskGroup-${TaskGroup.#counter++}`;
    }

    start() {
        super.start();
        // Start the timer, if any.
        if (this.#timeout !== undefined) {
            setTimeout(() => {
                this.#rejected!(new Error(`TaskGroup ${this.#name} timed out after ${this.#timeout} ms`));
            }, this.#timeout);
        }
        return this;
    }

}
