/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import {Future} from './future';
import { State } from './state';
import { TaskGroupResultType, TaskGroupOptions, TaskType } from './types';
import { CancelledException, TimeoutException } from './utils';

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
 * and managed as a group. Cancelling the group will cancel all of the tasks in the group
 * that have not yet completed. A timeout can be specified for the group, in which case
 * the group will after the timeout expires, and all the tasks in the group will be
 * timed out as well.
 *
 * The result type of the group is specified when the group is created, and can be one
 * of `FIRST`, `ALL`, `ANY`, or `ALL_SETTLED`. The result type determines the type of
 * the value returned by the group, and how the values from the managed tasks are
 * combined.
 *
 * * `FIRST` - The first task to complete will be the result of the group. The value
 *   returned will be the value of the first task to complete.
 *  If the first task to complete is rejected, the group will be rejected.
 *
 * * `ALL` - The result of the group will be an array of all the values returned by
 *  the tasks in the group. If any task is rejected, the group will be rejected.
 *
 * * `ANY` - The result of the group will be the value of the first task to complete.
 *   If the all of the tasks are rejected rejected, the group will be rejected.
 *
 * * `ALL_SETTLED` - The result of the group will be an array of settlement objects,
 *   in the same order as the tasks were added to the gruop. Each settlement object
 *   descrubes the result of each task in the group. The group will never be rejected.
 *   If a task is rejected, the corresponding settlement object will have a `status`
 *   of `rejected`, and a `reason` property containing the rejection reason. If a task
 *   is fulfilled, the corresponding settlement object will have a `status` of `fulfilled`,
 *   and a `value` property containing the fulfillment value.
 **/
export class TaskGroup<RT extends TaskGroupResultType, T> extends Future<TaskGroupResult<RT, T>> {
    #result_type: RT;

    #name: string;

    #fullfilled?: (v: TaskGroupResult<RT, T> | PromiseLike<TaskGroupResult<RT, T>>) => void;
    #rejected?: (e?: any) => void;

    #timeout?: number;

    #normal_tasks = new Set<Future<TaskGroupResult<RT, T>>>();

    #background_tasks = new Set<Future<any>>();

    #daemon_tasks = new Set<Future<any>>();

    static #counter: number = 0;


    static #groups = new Array<WeakRef<TaskGroup<any, any>>>();

    /**
     * The list of all {@link TaskGroup}s that have been created but not garbate ollected.
     */
    get groups() {
        return TaskGroup.#groups.map(r => r.deref()).filter(v => v !== undefined);
    }

    /**
    * Construct a new TaskGroup with the specified options.
    *
    * * `resultType` - The type of result to return. One of `FIRST`, `ALL`, `ANY`, or `ALL_SETTLED`.
    * * `name` - The name of the group. Defaults to a generated unique name.
    * * `timeout` - The number of milliseconds to wait before timing out the group. `undefined`
    *    means no timeout.
    *
    * @param options a {@link TaskGroupOptions} object.
    */
    constructor({ resultType, name, timeout }: TaskGroupOptions<RT>) {
        super(
            (fulfilled: (v: TaskGroupResult<RT, T> | PromiseLike<TaskGroupResult<RT, T>>) => void,
                rejected: (e?: any) => void) => {
                this.#fullfilled = fulfilled;
                this.#rejected = rejected;
                const forall = (f: (v: Future<any>) => void) => {
                    this.#normal_tasks.forEach(f);
                    this.#background_tasks.forEach(f);
                    this.#daemon_tasks.forEach(f);
                }
                this.onCancel(e => forall(t => t.cancel(e as CancelledException<unknown>)));
                this.onTimeout(e => forall(t => t.forceTimeout(e as TimeoutException<unknown>)));
                switch (this.#result_type) {
                    case TaskGroupResultType.FIRST:
                        this.onStart(() =>
                            Promise.race(this.#normal_tasks).then(fulfilled, rejected));
                        break;
                    case TaskGroupResultType.ALL:
                        this.onStart(() =>
                            Promise.all(this.#normal_tasks).then(fulfilled as (v: any) => void, rejected));
                        break;
                    case TaskGroupResultType.ANY:
                        this.onStart(() =>
                            Promise.any(this.#normal_tasks).then(fulfilled, rejected));
                        break;
                    case TaskGroupResultType.ALL_SETTLED:
                        this.onStart(() =>
                            Promise.allSettled(this.#normal_tasks).then(fulfilled as (v: any) => void, rejected));
                        break;
                    default:
                        throw new Error(`Unknown result type ${this.#result_type}`);
                }
            });
        this.#result_type = resultType ?? TaskGroupResultType.ALL_SETTLED;
        this.#name = name ?? `TaskGroup-${TaskGroup.#counter++}`;
        this.#timeout = timeout;
        let canceller = () =>
            this.#daemon_tasks.forEach(t => t.cancel());
        this.when(canceller, canceller)
        TaskGroup.#groups.push(new WeakRef(this));
    }

    add<X>(task: PromiseLike<X>, type: TaskType.BACKGROUND|TaskType.DAEMON): this;
    add(task: PromiseLike<TaskGroupResult<RT, T>>, type?: TaskType.NORMAL): this;
    add(task: PromiseLike<any>, type: TaskType = TaskType.NORMAL): this {
        const f = Future.resolve(task);
        switch (type) {
            case TaskType.BACKGROUND:
                this.#background_tasks.add(f);
                break;
            case TaskType.DAEMON:
                this.#daemon_tasks.add(f);
                break;
            case TaskType.NORMAL:
                this.#normal_tasks.add(f as unknown as Future<TaskGroupResult<RT, T>>);
        }
        switch (this.state) {
            case State.PENDING:
            case State.RUNNING:
            case State.PAUSED:
            case State.DELAY:
                // not terminating yet. Just add the task.
                break;
            case State.FULFILLED:
            case State.REJECTED:
            case State.TIMEOUT:
                this.catch((e: any) => {
                    f.cancel(e);
                    throw e as TimeoutException<TaskGroupResult<RT, T>>;
                });
                break;
            case State.CANCELLED:
                this.catch((e: any) => {
                    f.cancel(e);
                    throw e as CancelledException<TaskGroupResult<RT,T>>;
                    });
                break;
        }
        return this;
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
