# better-future: Better handling of deferred computation compatible with Promises

## API

## Lifecyce of a [`Future`](build/docs/api/classes/Future.html)

A [`Future`](api/classes/Future.html) is a computation that
will be performed in the future. It is a
[`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)
that can be cancelled or timed out, but does not begin
running until until there is a {@link #then} handler for it, or it is
explicitly started with {@link #start}.

A [`Future`](api/classes/Future.html) can be in one of these states:

* [`PENDING`](api/enums/State.html#PENDING):
  The initial state. The computation has not yet been started.
* [`RUNNING`](api/enums/State.html#RUNNING):
  The computation has been started, but has neither returned nor
  thrown an exception. This corresponds to the _Pending_ state in a
  [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
* [`FULFILLED`](api/enums/State.html#FULFILLED)
  The computation has returned a value.
* [`REJECTED`](api/enums/State.html#REJECTED):
  The computation has thrown an exception or returned a rejected
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

![State diagram of basic Future](assets/basic-states.svg)

[`.catch`()](api/classes/Future.html#catch),
[`.finally`(](api/classes/Future.html#finallu)),
and [`.when`()](api/classes/Future.html#when) do not result in state changes.

### `new Future`(_computation_)

Creates a `Future` that will begin running _computation_ when `.then`() is called.

_computation_: () => `any`

On creation, the state will be _Pending_.

### _future_.`then`(_onFulfilled_, _onRejected_)

Start the computation running, if it is not already running. When the computation
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

Like _future_.`then`(), but does not start the computation.

This is useful when setting up a computation and being notified if/when it completes.

### _future_.`start`()

Starts the computation but does not add any handler.

  ```javascript
future.start().when(handler)
```

is equivalent to

```javascript
future.then(handler)
```

### _future_.`onStart`(_handler_)

Regesters a _handler_ that that will be notified that the computation has been started.
The _handler_ will receive the time the computation started. Handlers can be added
at any time, including long after the `Future` is resolved.

### _future_.`onTimeout`(_handler_)

Registers a _handler_ that will be notified if the `Future` times out. This can
only happen if the future is creaed with `Future`.`timeoutFromNow`() or
`Future`.`timeout`, or if the computation throws an instance of `Timeout`.

### _future_.`cancel`(_msg_=`‘Cancelled’`)

Cancel a pending or executing `Future`. Does nothing if it has completed.

Cancelling a `Future` while the computation is running depends on the computation to
check _future_.`isCancelled`() to actually halt execution, but the `Future`
will be cancelled regardless.

![State Diagram for cancelling](assets/cancel.svg)

### _future_.`isCancelled`()

Returns `true` if this `Future` has been cancelled, or a `Cancelled` exception
is thrown by the user code.

### _future_.`onCancel`(_handler_)

Registers _handler_ to be called when the `Future` is cancelled. _handler_ will receive a `Cancelled`
error object, from which start and end times may be obtained.

### _future_.`check`(_continuation_)

Checks if the `Future` has been cancelled or timed out. Throws the corresponding
`Cancelled` or `Timeout` exception if so. Otherwise, if _continuation_ is called,
it will be called with the `Future` as an argument.

It is an error to call this from anywhere but an ongoing `Future` computation.

### _future_.`state`

Returns one of:

* `”PENDING”`
* `”RUNNING”`
* `TIMEOUT`
* `CANCELLED`
* `”FULFILLED”`
* `”REJECTED”`.

### `Future`.`delay` (_ms_) (_computation_)

Returns a function that when applied to a computation, delays the computation
until a minimum of _ms_ milliseconds have passed.

To immediately start the delay countdown:

```javascript
Future.delay(myComputation).start()
```

![State Diagram for delay](assets/delay.svg)


### `Future`.`timeout` (_ms_) (_computation_)

Returns a function that when applied to a computation, will return a
`Future` that will time out that computation _ms_ milliseconds after
it is started.

![State diagram with timeout](assets/timeout.svg)

### `Future`.`timeoutFromNow` (_ms_) (_computation_)

Returns a function that when applied to a computation, will return a
`Future` that will time out that computation
_ms_ milliseconds from when when it enters the _Pending_ state.

![State Diagram for Future.timeoutFromNow](assets/timeoutFromNow.svg)

### `Future`.`resolve`(_value_)

Create a `Future` that is pre-resolved to the specified value. Useful for testing
and for places that expect a full `Future` but you need to supply a resolved value.

![State Diagram for Future.resolve](assets/resolve.svg)

### `Future`.`reject`(_error_)

Create a `Future` that is pre-rejected with the specified value. Useful fo resting
and for places that expect a full `Future` but you need to supply a rejected value.

![State Diagram for Future.reject](assets/reject.svg)

### `Future`.`cancelled`(_msg_ = `Cancelled`)

Return a pre-cancelled `Future`. Useful in testing.

![State Diagram for Future.cancelled](assets/cancelled.svg)

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

### class Timeout

When a `Future` is created with a timeout, it will fail with a `Timeout`
exceeption.

Inherits:

* _ex_.`future`: The Future for which this was thrown.
* _ex_.`start`: The millisecond time when the Future was started (or created).
* _ex_.`end`: The milllisecond time when the exception occured.

### class Cancelled

When a `Future` is cancelled, it will fail with a `Cancelled`
exceeption.

Inherits:

* _ex_.`future`: The `Future` for which this was thrown.
* _ex_.`start`: The millisecond time when the Future was started (or created).
* _ex_.`end`: The milllisecond time when the exception
