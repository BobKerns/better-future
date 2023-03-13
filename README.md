# better-future: Better handling of deferred task compatible with Promises

A general-purpose package for managing deferred or parallel tasks. Features include:

* 100% compatible with `Promise` API.
* Lazy evaluation
* Cancellation
* Pause/resume
* Awaitable task groups

## Motivation

This package grew out of finding I needed something I'd written many times before
in Javascript (and in other forms even before).

The scenario is this:

You have a computation task. You don't know if you will need the result. Typically, there will be many
of these tasks, and you will only need a few of them.

You could return a function that you call when you need the result, and build adaptors for everything
that uses them.

But your asynchronous task will return a `Promise`, and your consumers of that are likely to expect a
`Promise`. And you'd find yourself needing to cache the results, and to potentially notify multiple
awaiting consumers when results are available.

In short, we need something very much like a `Promise`, but for a future result.

## A note about terminology

Unfortunately, terminology has divered over the years between different communities. What python and Java call a "Future"
roughly corresponds to a `Promise` + cancellation. A "Task" in python is a scheduable coroutine that is also awaitable.

Although the core concepts overlap, it's best not to try to map the concepts between languages. There are differences
due to python's convoluted async history, and there are differences due to how the runtimes operate.

The key terms here:

* `Promise`: always refers to a Javascript Promise
* _thenable_: An object with a compliant `.then()` method. This includes instances of `Promise`,
  [`Future`](api/classes/Future.html),
  and predecessors to Javascript's `Promise` class.
* [`Future`](api/classes/Future.html): A `Promise`-like _thenable_ that offers delayed/lazy execution, timeouts, and
  cancellation.
* _Task_: A computation to be managed by a [`Future`](api/classes/Future.html). This will typically be an async function
  returning a `Promise`, but that is not a requirement. In the default case, they should take exactly zero arguments, or
  two arguments like he argment to `Promise`.

## Basic API

The familiar `Promise` API is here, including the static methods such as `Promise.race`. A [`Future`](api/classes/Future.html) implements `.then()`, `.catch()`, and `.finally()`, and thus can be used
anywhere a `Promise` can be. 

The [`Future`](api/classes/Future.html) API includes two key additions: [`.start()`](api/classes/Future.html#start) and
[`.when()`](api/classes/Future.html#when).

Unlike a `Promise`, a [`Future`](api/classes/Future.html) does not begin
work until either [`Future`.`start`()](api/classes/Future.htm#start) is called, or [`Future`.`then`()](api/classes/Future.html#then), indicating a consumer for the information.

[`Future``.when`()])api/classes/Future.html#when) is just like [`Future`.`then`()](api/classes/Future.html#then)
without the [`Future`.`start`()](api/classes/Future.htm#start). This is useful for passive consumers of the information.
For examplee:

```typescript
return new Future(() => fetch(DATA_URL)).when(v => (console.log("data: ", v), v);
```

This also illustrates another feature: The [`Future`)api/classes/Future.html#constructor) can accept
a function of zero arguments, and it will seamlessly be adapted to the `(resolved, rejected) => void`
pattern accepted by `Promise`.

## Lifecyce of a [`Future`](build/docs/api/classes/Future.html)

A [`Future`](api/classes/Future.html) is a task that
will be performed in the future. It is a
[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)
that can be cancelled or timed out, but does not begin
running until until there is a {@link #then} handler for it, or it is
explicitly started with {@link #start}.

A [`Future`](api/classes/Future.html) can be in one of these states:

* [`PENDING`](api/enums/State.html#PENDING):
  The initial state. The task has not yet been started.
* [`RUNNING`](api/enums/State.html#RUNNING):
  The task has been started, but has neither returned nor
  thrown an exception. This corresponds to the _Pending_ state in a
  [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
* [`PAUSED`](api/enums/State.html#PAUSED): A pause in execution has been requested.
* [`FULFILLED`](api/enums/State.html#FULFILLED)
  The task has returned a value.
* [`REJECTED`](api/enums/State.html#REJECTED):
  The task has thrown an exception or returned a rejected
  [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
* [`CANCELLED`](api/enums/State.html#CANCELLED): After being cancelled, the
  [`Future`](api/classes/Future.html) will be in this state until
  all {@link #onCancel} handlers have been called, after which it transitions to
  [`REJECTED`](api/enums/State.html#REJECTED). [`state`](build/docs/api/classes/Future.html#state) will remain at
  [`CANCELLED`](api/enums/State.html#CANCELLED) to denote why
  it was rejected.
* [`TIMEOUT`](api/enums/State.html#TIMEOUT): If a [`Future`](build/docs/api/classes/Future.html)
  times out (see [`timeout`](api/classes/Future.html#timeout), it will be in
  this state until all [`onTimeout`](api/classes/Future.html#onTimeout) handlers have been run.

Timeouts are layered on top of basic [`Future`](api/classes/Future.html)
states. The exact state diagram depends on whether [`Future.timeout`](api/classes/Future.html#timeout) or [`Future.timeoutAfter`](api/classes/Future.html#timeoutAfter)is used.

![State diagram of basic Future](images/basic-states.svg)

[`.catch`()](api/classes/Future.html#catch),
[`.finally`(](api/classes/Future.html#finallu)),
and [`.when`()](api/classes/Future.html#when) do not result in state changes.

### `new Future`(_computation_, _options_)

Creates a `Future` that will begin running _computation_ when `.then`() is called.

_computation_: () => `any`

On creation, the state will be _Pending_.

The optional _options_ parameter can specify timeouts, an initial delay, and enable cancellation.

### _future_.`then`(_onFulfilled_, _onRejected_)

Start the task running, if it is not already running. When the computatask
terminates, _onFulfilled_ or _onRejected_ will be called with the value or error
as with a `Promise`.

The state will transition to _Running_ if it was _Pending_.

### _future_.`catch`(_onRejected_)

If the state is _Fulfilled_, _onRejected_ is called immediately with the rejection value as for `Promise`.`catch`().

If the state is _Fulfilled_, _onRejected_ will not be called.

If the state is _Pending_ or _Running_, and the state becomes _Fulfilled_, _onRejected_ will be called at that time.

### _future_.`finally`(_handler_)

If the state is _Fulfilled_ or _Rejected_, _handler_ will be called. If the state
later transitions to _Fulfilled_ or _Rejected_, the handler will be called at that
time.

### _future_.`when`(_onFulfilled_, _onRejected_)

Like _future_.`then`(), but does not start the task.

This is useful when setting up a task and being notified if/when it completes.

### _future_.`start`()

Starts the task but does not add any handler.

  ```javascript
future.start().when(handler)
```

is equivalent to

```javascript
future.then(handler)
```

### _future_.`onStart`(_handler_)

Regesters a _handler_ that that will be notified that the task has been started.
The _handler_ will receive the time the task started. Handlers can be added
at any time, including long after the `Future` is resolved.

### _future_.`onTimeout`(_handler_)

Registers a _handler_ that will be notified if the `Future` times out. This can
only happen if the future is creaed with `Future`.`timeoutFromNow`() or
`Future`.`timeout`, or if the task throws an instance of `Timeout`.

### _future_.`cancel`(_msg_=`‘Cancelled’`)

Cancel a pending or executing `Future`. Does nothing if it has completed.

Cancelling a `Future` while the task is running depends on the task to
await on  _context_.`running`() to actually halt execution, but the `Future`
will be cancelled regardless.

![State Diagram for cancelling](images/cancel.svg)

### _future_.`onCancel`(_handler_)

Registers _handler_ to be called when the `Future` is cancelled. _handler_ will receive a `Cancelled`
error object, from which start and end times may be obtained.

### _future_.`state`

Returns one of:

* `”PENDING”`
* `"DELAY"`
* `”RUNNING”`
* `"PAUSED"`
* `TIMEOUT`
* `CANCELLED`
* `”FULFILLED”`
* `”REJECTED”`.

### `Future`.`resolve`(_value_)

Create a `Future` that is pre-resolved to the specified value. Useful for testing
and for places that expect a full `Future` but you need to supply a resolved value.

![State Diagram for Future.resolve](images/resolve.svg)

### `Future`.`reject`(_error_)

Create a `Future` that is pre-rejected with the specified value. Useful fo resting
and for places that expect a full `Future` but you need to supply a rejected value.

![State Diagram for Future.reject](images/reject.svg)

### `Future`.`cancelled`(_msg_ = `Cancelled`)

Return a pre-cancelled `Future`. Useful in testing.

![State Diagram for Future.cancelled](images/cancelled.svg)

### `Future`.`never`()

Return a `Future` that never arrives. Useful for testing and as a placeholder.

[State Diagram for Future.never](build/docs/api/classes/Future.html#never)

### `Future`.`race`(_promises_)

Returns a `Future` that, when started, will resolve with the first of the supplied iterable
of `PromiseLike` arguments to complete.

Unlike `Promise`.`race`(_promises_), any supplied `Future` instances will not be started
until requested with `.then()` or `.start()`.

### `Future`.`all`(_promises_)

Returns a `Future` that, when started, will resolve when all of the supplied iterable of
`PromiseLike` arguments are fulfilled, or reject when the first rejects. If all are
fullfilled, the result is fulfilled with an array of the results of the arguments.

Unlike `Promise`.`all`(_promises_), any supplied `Future` instances will not be started
until requested with `.then()` or `.start()`.

### `Future`.`allSettled`(_promises_)

Returns a `Future` that, when started, will resolve when all of thesupplied iterable of
`PromiseLike` arguments are resolved. It will be fulfilled with an array of
`PromiseSettledResult` objects, one of:

```javascript
{
    type: 'fulfilled',
    value: T
}
```

```javascript
{
    type: 'rejected',
    reason: any
}
```

### class `FutureException`

Abstract base class for exceptions relating to`Future`s.

Provides:

* _ex_.`future`: The `Future` for which this was thrown.
* _ex_.`start`: The millisecond time when the `Future` was started (or created).
* _ex_.`end`: The milllisecond time when the exception occured.

### class TimeoutException

When a `Future` is created with a timeout, it will fail with a `TimeoutException`
exceeption.

Inherits:

* _ex_.`future`: The Future for which this was thrown.
* _ex_.`start`: The millisecond time when the Future was started (or created).
* _ex_.`end`: The milllisecond time when the exception occured.

### class CancelledException

When a `Future` is cancelled, it will fail with a `CancelledException`
exceeption.

Inherits:

* _ex_.`future`: The `Future` for which this was thrown.
* _ex_.`start`: The millisecond time when the Future was started (or created).
* _ex_.`end`: The milllisecond time when the exception
