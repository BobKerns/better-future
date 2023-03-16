/*
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import {Future} from './future';
import { State } from './state';
import { TaskGroupResultType, TaskType } from './enums';
import type { TaskGroupOptions, FutureOptions, Task, ReducerFn, Reducer, ReducerGroup } from './types';
import { CancelledException, TimeoutException, Throw } from './utils';
import { TaskPool } from './task-pool';
import { TaskContext } from './task-context';

const todo = () => { throw new Error('TODO'); };

type TaskGroupFulfilled<RT extends TaskGroupResultType, R>
    = (v: TaskGroupResult<RT, R> | PromiseLike<TaskGroupResult<RT, R>>) => void;

type TaskGroupResult<RT extends TaskGroupResultType, T> =
    RT extends TaskGroupResultType.FIRST ? T
    : RT extends TaskGroupResultType.ALL ? T[]
    : RT extends TaskGroupResultType.ANY ? T
    : RT extends TaskGroupResultType.ALL_SETTLED ? PromiseSettledResult<T>[]
    : never;

/**
 *
 * A {@link TaskGroup} is a collection of {@link Task]s, wrapped in {@link Future}
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
 **/
export class TaskGroup<RT extends TaskGroupResultType, F, T = F, R = T> extends Future<TaskGroupResult<RT, R>> {
    #result_type: RT;

    #name: string;

    #fullfilled?: (v: TaskGroupResult<RT, R> | PromiseLike<TaskGroupResult<RT, R>>) => void;
    #rejected?: (e?: any) => void;

    #timeout?: number;

    #pool?: TaskPool;

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

    #context?: TaskContext<R>;

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

    /**
    * Construct a new {@link TaskGroup} with the specified options.
    *
    * * {@link TaskGroupOptions#resultType} - The type of result to return.
    *   One of `FIRST`, `ALL`, `ANY`, or `ALL_SETTLED`.
    * * {@link TaskGroupOptions#name} - The name of the group. Defaults to a generated unique name.
    * * {@link TaskGroupOptions#timeout} - The number of milliseconds to wait before timing
    *   out the group. `undefined` means no timeout.
    * * {@link TaskGroupOpitions#pool} - The {@link TaskPool} to use for running the tasks in the group. If not specified,,
    *   no pool will be used.
    *
    * @param options a {@link TaskGroupOptions} object.
    */
    constructor({ resultType, name, timeout, pool, ...others }: TaskGroupOptions<RT, F, T, R>) {
        super(
            (fulfilled: TaskGroupFulfilled<RT, R>,
                rejected: (e?: any) => void) => {
                this.#fullfilled = fulfilled;
                this.#rejected = rejected;
                this.pool = pool;
                this.onCancel(e => this.#forall(t => t.cancel(e as CancelledException<unknown>)));
                this.onTimeout(e => this.#forall(t => t.forceTimeout(e as TimeoutException<unknown>)));
                if (resultType === TaskGroupResultType.REDUCE) {
                    const {reducer} = others as Partial<TaskGroupOptions<TaskGroupResultType.REDUCE, F, T, R>>;
                    //const {reducer} = o;
                    if (reducer && typeof reducer !== 'function') {
                        this.#reducer = reducer[0](this.#context!, ...reducer.slice(1));
                    }
                }
                if (this.#pool) {
                    this.onStart(() => this.#forall(t => this.#pool?.add(t)))
                }
                switch (this.#result_type) {
                    case TaskGroupResultType.FIRST:
                        this.onStart(() =>
                            Promise.race(this.#normal_tasks).then(fulfilled as (v: any) => void, rejected));
                        break;
                    case TaskGroupResultType.ALL:
                        this.onStart(() =>
                            Promise.all(this.#normal_tasks).then(fulfilled as (v: any) => void, rejected));
                        break;
                    case TaskGroupResultType.ANY:
                        this.onStart(() =>
                            Promise.any(this.#normal_tasks).then(fulfilled as (v: any) => void, rejected));
                        break;
                    case TaskGroupResultType.ALL_SETTLED:
                        this.onStart(() =>
                            Promise.allSettled(this.#normal_tasks).then(fulfilled as (v: any) => void, rejected));
                        break;
                    case TaskGroupResultType.REDUCE:
                        let count = 0;
                        let idx = 0;
                        this.#normal_tasks.forEach(t => {
                            const tidx = idx++;
                            const acceptor = (v: T) => {
                                try {
                                    this.#reducer?.next([v, tidx]);
                                } catch (e) {
                                    rejected(e);
                                }
                            };
                            const rejector = (e: any) => {
                                try {
                                    this.#reducer?.throw(e);
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
            },
            {
                ...others,
                global: true,
                // Workaround for lack of protected fields in Jaavvascript
                _contextCallback: (context: TaskContext<R>) => {
                    this.#context = context;
                }
            }
            );
        this.#result_type = (resultType  as RT ?? Throw(new Error(`"resultType is a required parameter`)));
        this.#name = name ?? `TaskGroup-${TaskGroup.#counter++}`;
        this.#timeout = timeout;
        let canceller = () =>
            this.#daemon_tasks.forEach(t => t.cancel());
        this.when(canceller, canceller)
        TaskGroup.#groups.push(new WeakRef(this));
    }

    /**
     * Add a task, creating a future for it.
     * @param task
     * @param type The type of task (defaults to {@link TaskType.NORMAL}}})
     * @param options The {@link FutureOptions} for the created {@link Future}.
     * @returns The {@link TaskGroup} for chaining.
     */
    add(task: Task<T>, type: TaskType.NORMAL, options?: FutureOptions): this;
    /**
     * Add a task, creating a future for it.
     * @param task
     * @param type The type of task (defaults to {@link TaskType.NORMAL}}})
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
    add(task: Task<T>, options?: FutureOptions): this;
    /**
     * Add a background or daemon task.
     *
     * @param task The {limk Future} to add to the group. Any `PromiseLike` can be used with
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
    add(task: PromiseLike<TaskGroupResult<RT, T>>, type?: TaskType.NORMAL): this;
    /**
     * Implementation of {@link TaskGroup.add}.
     *
     * @param task
     * @param type
     * @param options
     * @returns
     */
    add<X>(task: PromiseLike<any>|Task<T|X>, type: TaskType|FutureOptions = TaskType.NORMAL, options?: FutureOptions): this {
        if (typeof task === 'function') {
            if (typeof type === 'object') {
                options = type;

            }
            task = new Future(task, options!);
        }
        const f = Future.resolve(task);
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
                if (this.#pool) {
                    this.#pool.add(f);
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
     */
    set pool(pool: TaskPool|undefined) {
        super.pool = pool;
        this.#forall(t => pool?.add(t));
    }

}
