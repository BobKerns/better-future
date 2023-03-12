/*
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import { Future } from "..";
import { MethodSpec, is, isState, isStatic, isInstance, hasTag, p_never } from "./tools";

const methods: Array<MethodSpec<Future<any>, typeof Future>> = [
    {name: "delay", tags: ['static']},
    {name: "timeout", tags: ['static']},
    {name: "timeoutFromNow", tags: ['static']},
    {name: "resolve", tags: ['static']},
    {name: "reject", tags: ['static']},
    {name: "cancelled", tags: ['static']},
    {name: "never", tags: ['static']},
    {name: "all", tags: ['static']},
    {name: "allSettled", tags: ['static']},
    {name: "race", tags: ['static']},
    {name: "any", tags: ['static']},
    {name:'then', tags: ['instance']},
    {name: 'catch', tags: ['instance']},
    {name: 'finally', tags: ['instance']},
    {name: 'when', tags: ['instance']},
    {name: 'onStart',   tags: ['instance']},
    {name: 'onCancel', tags: ['instance']},
    {name: 'onTimeout', tags: ['instance']},
    {name: 'start', tags: ['instance'] },
    {name: 'pause', tags: ['instance'] },
    {name: 'resume', tags: ['instance'] },
    {name: 'runnable', tags: ['field'], type: is(Promise)},
    {name: 'state', tags: ['field'], type: isState()},
    {name: 'cancel', tags: ['instance']}
];

describe("Basic", () => {
    describe("API completeness", () => {
        test("Future is a function", () =>
            expect(Future)
            .toBeInstanceOf(Function));
        test("Future is a constructor", () =>
                expect(Future.prototype)
                .toBeInstanceOf(Object));
        describe("Static Methods", () => 
            test.each(methods
                .filter(isStatic))
            (
                `Future.$name is a function`,
                ({name}) => expect(Future[name]).
                    toBeInstanceOf(Function)
            ));
        describe('Instance Methods', () => {
            const f: Future<number> = new Future(() => 1);
            test('InstanceOfFuture', () => expect(f).toBeInstanceOf(Future));
            test.each(methods
                .filter(isInstance)
                .map(m => ({name: m.name, value: f[m.name] }))
            )
            (`Method Future.$name`, ({value}) =>
                expect(value).toBeInstanceOf(Function));
        });

        describe("Instance fields", () => {
            const f: Future<number> = new Future(() => 1).start();
            test.each(methods
                .filter(hasTag('field'))
                .map(m => ({name: m.name, value: m.type?.(f[m.name as keyof typeof f] )}))
            )
            (`Field Future.$name`, ({value}) =>
                expect(value).toBeTruthy());

             // Future.runnable should error if accessed before start.
             // It should only be accessed from a running computation.
            test('Future.runnable invalid access', () => {
                const f = new Future(() => 1);
                expect((() => {
                    try {
                        return (f.runnable, undefined);
                    } catch (e) {
                        return e;
                    }
                })()).toBeInstanceOf(Error)
            });
            test('Future.runnable runnable', async () => {
                const f = new Future(() => 1).start();
                expect(f.state).toEqual('RUNNING');
                return expect(await f.runnable).toBe(await f);
            });
            test('Future.runnable late access', async () => {
                const f = new Future(() => 1).start();
                await f;
                return expect(f.runnable).rejects.toBeInstanceOf(Error);
            });
        });

        test('Initial state', () => {
            const f = new Future(() => 1);
            expect(f.state).toBe('PENDING')
            expect(f.isCancelled).toBe(false);
        });

        describe('Start'  , () => {
            test ("Never", () => {
                const fNever = new Future(p_never);
                expect(fNever.start().state).toBe('RUNNING');
            });
            test ("Immediate", () => {
                const fImmediate = new Future(() => 1);
                expect ((async() => {
                    await fImmediate.start();
                    return fImmediate.state;
                })())
                .resolves.toBe('FULFILLED');
            });
            test("Fail", () => {
                const fFail = new Future(() => { throw new Error('Fail') });
                expect ((async() => {
                    try {
                        await fFail.start();
                    } catch (e) {
                        //
                    }
                    return fFail.state;
                })())
                .resolves.toBe('REJECTED');
            });
        });
    });
});
