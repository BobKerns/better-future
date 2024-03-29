/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import {Future} from './future';
import { State } from './state';
import { TaskGroupResultType, TaskType } from './enums';
import type {
    TaskGroupOptions, BaseTypeGroupOptions, FutureOptions, Task,
    ReducerFn, Reducer, TaskGroupResult,

} from './types';
import { CancelledException, TimeoutException, Throw, withThis } from './utils';
import { TaskPool } from './task-pool';
import { TaskContext } from './task-context';

const todo = () => { throw new Error('TODO'); };

/**
 *
 * A {@link TaskGroup} is a collection of {@link Task}s, wrapped in {@link Future}
 * that can be run in parallel and be mnaged as a group.
 * Cancelling the group will cancel all of the tasks in the group
 * that have not yet completed. A timeout can be specified for the group, in which case
 * the group will after the timeout expires, and all the tasks in the group will be
 * timed out as well.s
 *
 * A {@link TaskGroup} is itself a {@link Future}, and can be used as a task in another
 * context, assigned to a {@link TaskPool} or another {@link TaskGroup}.
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
 *
 * @typeParam RT - The result type of the group. One of `FIRST`, `ALL`, `ANY`, or `ALL_SETTLED`.
 * @typeParam F - The type of the value returned by the {@link TaskType.NORMAL}
 *                 tasks in the group, prior to addition of a filter.
 * @typeParam T - The type of the value returned by the {@link TaskType.NORMAL} + filter.
 *                If no filter is specified, this is the same as `F`.
 * @typeParam R - The type of the value returned by the group. If the result type is
 *                {@link TaskGroupResultType.REDUCE}, this is the type of the value
 *                returned by the reducer. If {@link TaskGroupResultType.FIRST} or
 *                {@link TaskGroupResultType.ANY}, this is the same as `T`.
 *                If {@link TaskGroupResultType.ALL}, it will be `T[]`
 *                If {@link TaskGroupResultType.ALL_SETTLED}, it will be
 *                `PromiseSettledResult<T>[]`
 **/
export class TaskGroup<
        RT extends TaskGroupResultType,
        F,
        T = F,
        R extends TaskGroupResult<RT, T, TaskGroupResult<RT, T, any>>
            = TaskGroupResult<RT, T, TaskGroupResult<RT, T, any>>
            > extends Future<R>
{
    #result_type: RT;

    #name?: string
    get name() {
        return this.#name ?? (this.#name = `TaskGroup-${TaskGroup.#counter++}`);
    }

    #rejected?: (e?: any) => void;

    #timeout?: number;

    #normal_tasks = new Set<Future<T>>();

    #background_tasks = new Set<Future<any>>();

    #daemon_tasks = new Set<Future<any>>();

    // Default handling of normal tasks. This is overridden if th result type is REDUCED.
    #add_normal_task: (task: Future<T>) => void = (task: Future<T>) => {
        if (this.state !== State.PENDING) {
            throw new Error(`Cannot add normal tasks to group ${this.#name} after it has been started.`);
        }
        this.#normal_tasks.add(task);
    }

    #filter?: (v: F) => T;

    #reducer?: Reducer<T, R>;

    static #counter: number = 0;

    static #groups = new Array<WeakRef<TaskGroup<any, any>>>();

    /**
     * The list of all {@link TaskGroup}s that have been created but not garbage ollected.
     */
    get groups() {
        return TaskGroup.#groups.map(r => r.deref()).filter(v => v !== undefined);
    }

    #forall(f: (v: Future<any>) => void) {
        this.#normal_tasks.forEach(f);
        this.#background_tasks.forEach(f);
        this.#daemon_tasks.forEach(f);
    }

    #run(fulfilled: (v: T | T[] | PromiseSettledResult<T>[] | R) => void, rejected: (e?: any) => void) {
        switch (this.#result_type) {
            case TaskGroupResultType.FIRST:
                this.onStart(() =>
                    Promise.race(this.#normal_tasks).then(fulfilled as (v: T) => void, rejected));
                break;
            case TaskGroupResultType.ALL:
                this.onStart(() =>
                    Promise.all(this.#normal_tasks).then(fulfilled as (v: T[]) => void, rejected));
                break;
            case TaskGroupResultType.ANY:
                this.onStart(() =>
                    Promise.any(this.#normal_tasks).then(fulfilled as (v: T) => void, rejected));
                break;
            case TaskGroupResultType.ALL_SETTLED:
                this.onStart(() =>
                    Promise.allSettled(this.#normal_tasks)
                        .then(fulfilled as (v: PromiseSettledResult<T>[]) => void, rejected));
                break;
            case TaskGroupResultType.REDUCE:
                let count = this.#normal_tasks.size;
                let idx = 0;
                this.#normal_tasks.forEach(t => {
                    const tidx = idx++;
                    /**
                     * When there are no more tasks to resolve, extract the resdult
                     * from the reducer.
                     */
                    const finalize = async () => {
                        try {
                            const result = await this.#reducer?.next([undefined as T, -1]);
                            fulfilled(result as R);
                        } catch (e) {
                            rejected(e);
                        }
                    }

                    /**
                     * Accept a fulfilled value from the task
                     * @param v The fulfillment value of the task.
                     */
                    const acceptor =async  (v: T) => {
                        try {
                            await this.#reducer?.next([v, tidx]);
                            if (--count === 0) {
                                finalize();
                            }
                        } catch (e) {
                            rejected(e);
                        }
                    };

                    /**
                     * Accept a rejected value from the task by throwing into
                     * the reducer. If the Reducer handles it, we continue.
                     * If it does not catch it or passes it on, we reject now.
                     * @param e The rejection reason of the task.
                     */
                    const rejector = async (e: any) => {
                        try {
                            await this.#reducer?.throw(e);
                            if (--count === 0) {
                                finalize();
                            }
                        } catch (e) {
                            rejected(e);
                        }
                    };
                    t.then(acceptor, rejector);
                });
                break;
            default:
                throw new Error(`Unknown result type ${this.#result_type}`);
        }
    }

    /**
    * Construct a new {@link TaskGroup} with the specified options.
    *
    * * {@link BaseTaskGroupOptions.resultType} - The type of result to return.
    *   One of `FIRST`, `ALL`, `ANY`, `ALL_SETTLED` or `REDUCE`.
    * * {@link BaseTaskGroupOptions#name} - The name of the group. Defaults to a generated unique name.
    * * {@link BaseTaskGroupOptions#timeout} - The number of milliseconds to wait before timing
    *   out the group. `undefined` means no timeout.
    * * {@link BaseTaskGroupOptions#pool} - The {@link TaskPool} to use for running the tasks in the group. If not specified,,
    *   no pool will be used.
    * * {@link BaseTaskGroupOptions#reducer} - A function that will be called to reduce/aggregate the values
    *   Required if `resultType` is `REDUCE`.
    *
    * @param options a {@link TaskGroupOptions} object.
    */
    constructor({ resultType, name, pool, filter, ...others }: TaskGroupOptions<RT, F, T, R>) {
        super(
            withThis((ctx: TaskContext<R>) =>
                new Promise<R>((fulfilled, rejected) => {
                    this.#rejected = rejected;
                    this.pool = pool;
                    this.#filter = filter;
                    this.onCancel(e => this.#forall(t => t.cancel(e as CancelledException<unknown>)));
                    this.onTimeout(e => this.#forall(t => t.forceTimeout(e as TimeoutException<unknown>)));

                    this.#result_type = (resultType  as RT ?? Throw(new Error(`"resultType is a required parameter`)));
                    this.#name = name ?? `TaskGroup-${TaskGroup.#counter++}`;
                    let canceller = () =>
                        this.#daemon_tasks.forEach(t => t.cancel());
                    this.when(canceller, canceller)

                    if (resultType === TaskGroupResultType.REDUCE) {
                        const {reducer} = others as Partial<TaskGroupOptions<TaskGroupResultType.REDUCE, F, T, R>>;
                        if (reducer && typeof reducer !== 'function') {
                            const [r, ...args] = reducer;
                            this.#reducer = r(ctx, ...args);
                        } if (reducer) {
                            const r = reducer as ReducerFn<T, R,[]>;
                            this.#reducer = r(ctx)
                        } else {
                            throw new Error(`"reducer" is a required parameter for TaskGroupResultType.REDUCE`);
                        }
                    }
                    if (this.pool) {
                        this.onStart(() => this.#forall(t => this.pool?.add(t)))
                    }
                    this.#run(fulfilled as (v: T | T[] | PromiseSettledResult<T>[] | R) => void, rejected)
                })),
                {
                    ...others,
                    cancel: true
                }
            );

            this.#result_type = (resultType  as RT ?? Throw(new Error(`"resultType is a required parameter`)));
            TaskGroup.#groups.push(new WeakRef(this));
    }

    /**
     * Add a task, creating a future for it.
     * @param task
     * @param type The type of task (defaults to {@link TaskType.NORMAL})
     * @param options The {@link FutureOptions} for the created {@link Future}.
     * @returns The {@link TaskGroup} for chaining.
     */
    add(task: Task<F>, type: TaskType.NORMAL, options?: FutureOptions): this;
    /**
     * Add a task, creating a future for it.
     * @param task
     * @param type The type of task (defaults to {@link TaskType.NORMAL})
     * @param options The {@link FutureOptions} for the created {@link Future}.
     * @returns The {@link TaskGroup} for chaining.
     */
    add<X>(task: Task<X>, type: TaskType.BACKGROUND|TaskType.DAEMON, options?: FutureOptions): this;
    /**
     * Add a background or daemon task, creating a future for it.
     * @param task
     * @param options The {@link FutureOptions} for the created {@link Future}.
     * @returns The {@link TaskGroup} for chaining.
     */
    add(task: Task<F>, options?: FutureOptions): this;
    /**
     * Add a background or daemon task.
     *
     * @param task The {@link Future} to add to the group. Any `PromiseLike` can be used with
     *             limited functionality.
     * @param type The tpe of task to add. Defaults to {@link TaskType.NORMAL}.
     * @returns The {@link TaskGroup} for chaining.
     */
    add<X>(task: PromiseLike<X>, type: TaskType.BACKGROUND|TaskType.DAEMON): this;
    /*
     * Add a {@link TaskType.NORMAL} task.
     *
     * @param task The {limk Future} to add to the group. Any `PromiseLike` can be used with
     *            limited functionality.
     * @param type The tpe of task to add. Defaults to {@link TaskType.NORMAL}.
     * @Breeturns The {@link TaskGroup} for chaining.
     */
    add(task: PromiseLike<TaskGroupResult<RT, F>>, type?: TaskType.NORMAL): this;
    /**
     * Implementation of {@link TaskGroup.add}.
     *
     * @param task
     * @param type
     * @param options
     * @returns
     */
    add<X>(task: PromiseLike<F|X>|Task<F|X>, type: TaskType|FutureOptions = TaskType.NORMAL, options?: FutureOptions): this {
        let task2: Future<F>;
        if (typeof task === 'function') {
            if (typeof type === 'object') {
                options = type;

            }
            task2 = new Future<F>(task as Task<F>, options!);
        } else {
            task2 = Future.resolve<F>(task as PromiseLike<F>);
        }
        const f: Future<T> = this.#filter
            ? Future.resolve(task2).then(this.#filter!)
            : Future.resolve(task2) as unknown as Future<T>; // F = T if no filter.
        switch (type) {
            case TaskType.BACKGROUND:
                this.#background_tasks.add(f);
                break;
            case TaskType.DAEMON:
                this.#daemon_tasks.add(f);
                break;
            case TaskType.NORMAL:
                this.#normal_tasks.add(f as unknown as Future<T>);
        }
        switch (this.state) {
            case State.PENDING:
                // We will add the task to the pool and do other setup when we start.
                break;
            case State.RUNNING:
            case State.PAUSED:
            case State.DELAY:
                // not terminating yet. Just add the task.
                if (this.pool) {
                    this.pool.add(f);
                }
                break;
            case State.TIMEOUT:
                this.catch((e: any) => {
                    f.cancel(e);
                    throw e as TimeoutException<TaskGroupResult<RT, T>>;
                });
                break;
            case State.FULFILLED:
            case State.REJECTED:
                // Already terminated. Cancel the tasks.
                this.#forall(t => t.cancel());
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

    /**
     * Addng a {@link TaskGroup} to a {@link TaskPool} will add all the tasks in the group to the pool.
     * @param pool The {@link TaskPool} to add the group to.
     */
    set pool(pool: TaskPool|undefined) {
        super.pool = pool;
        this.#forall(t => pool?.add(t));
    }

}
