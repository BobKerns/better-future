# better-future: Better handling of deferred task compatible with Promises

A general-purpose package for managing deferred or parallel tasks. Main features include:

## Futures

* 100% compatible with `Promise` API.
* Lazy evaluation
* Cancellation
* Pause/resume
* Initial delay
* Implemented on top of Javascript `Promise` implementation. Does not reinvent the wheel,
  helping to ensure consistent semantics.

## Task groups

* _Awaitaable_: You can `await` completion (or failure) of the combined set of tasks.
* _Background tasks_: These do not directly contribute to the task result, but should
  complete before the task completes.
* _Daemon Tasks_: These do not directly contribute to the task result, but should be
  terminated when the task resolves.
* _Filters_ strip down large data early, miimizing memory usage.
* _Data aggregation- (map/reduce). Reducers can often accumulate results in O(1) space.
  * For example, average, RMS/quadratic mean, standard deviation (population & sample), bincount

## Task pools

* Task pools limit simultaneous execution, with its impact
  on memory usage and latency.
* Combined with an initial delay, can achieve a form of rate limiting.
* Very useful for web scraping applications.

## Possible future additions

### Infinite tasks

These would produce an async generator. These would be useful for monitoring real-time event streams,
calciulating things like moving averages.

## `Promise`-based publish/subscribe

Combined with Infinite tasks_, this would allow multiple consumers of an event stream

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

When you do this at scale, you find you need features like timeouts, cancellation, aggregation of results,
resource management, memory optimization, etc.

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
