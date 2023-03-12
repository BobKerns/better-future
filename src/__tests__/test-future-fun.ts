/*
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import { Future, CancelContext, TimeoutException, withThis, CancelledException } from "..";
import { p_never } from "./tools";

describe("Functional", () => {

    test('Future.runnable runnable', async () => {
        let c: CancelContext<any>;
        const f = new Future(withThis((ctx: CancelContext<any>) => (c = ctx))).start();
        expect(f.state).toEqual('RUNNING');
        return expect(await c!.runable).toBe(c!);
    });
    test('Future.runnable late access', async () => {
        let c: CancelContext<any>;
        const f = new Future(withThis((ctx: CancelContext<any>) => (c = ctx))).start();
        await f;
        return expect(c!.runable).rejects.toBeInstanceOf(Error);
    });

    test('Initial state', () => {
        const f = new Future(() => 1);
        expect(f.state).toBe('PENDING')
    });

    // Test starting a simple task.
    describe('Start'  , () => {
        test ("Never but started", () => {
            const fNever = new Future(() => p_never);
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

    describe("delay", () => {
        test("delay", async () => {
            const f = Future.delay(100)(() => 1);
            expect(f.state).toBe('PENDING');
            const startTime = Date.now();
            expect(f.start().state).toBe('DELAY');
            await f;
            expect(Date.now() - startTime).toBeGreaterThan(99.9)
            expect(f.state).toBe('FULFILLED');
        });
    });

    describe("timeout", () => {
        test("timeout", async () => {
            const createTime = Date.now();
            const f = Future.timeout(100)(() => p_never);
            await Future.delay(100)(() => 1);
            expect(f.state).toBe('PENDING');
            const startTime = Date.now();
            expect(f.start().state).toBe('RUNNING');
            try {
                await f;
                throw new Error("Did not time out");
            } catch (e) {
                if (!(e instanceof TimeoutException)) throw e;
                expect(e).toBeInstanceOf(TimeoutException);
                expect(Date.now() - startTime).toBeGreaterThan(99.9);
                expect(Date.now() - startTime).toBeLessThan(150);
                expect(Date.now() - createTime).toBeGreaterThan(199.9);
                expect(e.endTime - e.startTime).toBeLessThan(150);
                expect(e.endTime - startTime).toBeLessThan(150);
                expect(f.state).toBe('TIMEOUT');
            }
        });
    });
    describe("timeoutFromNow", () => {
        test("timeoutFromNow", async () => {
            const createTime = Date.now();
            const f = Future.timeoutFromNow(100)(() => p_never);
            await Future.delay(50)(() => 1);
            expect(f.state).toBe('PENDING');
            const startTime = Date.now();
            expect(f.start().state).toBe('RUNNING');
            try {
                await f;
                throw new Error("Did not time out");
            } catch (e) {
                if (!(e instanceof TimeoutException)) throw e;
                expect(e).toBeInstanceOf(TimeoutException);
                expect(Date.now() - createTime).toBeGreaterThan(99.9);
                expect(e.endTime - createTime).toBeGreaterThanOrEqual(100);
                expect(e.endTime - startTime).toBeLessThan(100);
                expect(f.state).toBe('TIMEOUT');
            }
        });
    });

    describe("cancel", () => {
        test("cancelled", async () => {
            const f = Future.cancelled();
            expect(f.state).toBe('CANCELLED');
            expect(f.start().state).toBe('CANCELLED');
            await expect(f).rejects.toBeInstanceOf(CancelledException);
        });
    });
});