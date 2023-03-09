# A Better Future package

A {@link Future} is just like a `Promise`, except the computation does not start until and
unless `.then`() is called. It is a _thenable_, and thus can be used anywhere a
`Promise` can be used. The full {@link Promise} API is implemented, including static methods.

This allows for a form of lazy evaluation, where computations are deferred until needed,
or not performed at all when they may not be needed.

A {@link Future} can be in one of these states:

* {@link #PENDING}: The initial state. The computation has not yet been started.
* {@link #RUNNING}: The computation has been started, but has neither returned nor
  thrown an exception. This corresponds to the _Pending_ state in a `Promise`.
* {@link #PAUSED}: A pause in the computation has been requested.
* {@link #FULFILLED} The computation has returned a value.
* {@link #REJECTED}: The computation has thrown an exception or returned a rejected
  `Promise`.
* {@link #CANCELLED}: After being cancelled, the `Future` will be in this state until all {@link #onCancel} handlers
  have been called, after which it transitions to{@link #REJECTED}. {@link #state} will remain at {@link #CANCELLED} to denote why it was rejected.
* {@link #TIMEOUT}: If a {@link Future} times out (see {@link #timeout}, it will be in
  this state until all {@link #onTimeout} handlers have been run.

![diag-1](images/basic-states.svg)

`.catch`(), `.finally`(), and `.when`() do not result in state changes.
