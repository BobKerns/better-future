import { Future } from "../future";

const never = () => new Promise(() => {})

describe("Basic", () => {
    describe("API completeness", () => {
        test("Static Mehods", () => {
            expect(Future).toBeInstanceOf(Function);
            expect(Future.delay).toBeInstanceOf(Function);
            expect(Future.timeout).toBeInstanceOf(Function);
            expect(Future.timeoutFromNow).toBeInstanceOf(Function);
        });

        test("Instance Methods", () => {
            const f = new Future(() => 1);
            expect(f).toBeInstanceOf(Future);
            expect(f.then).toBeInstanceOf(Function);
            expect(f.catch).toBeInstanceOf(Function);
            expect(f.finally).toBeInstanceOf(Function);
            expect(f.when).toBeInstanceOf(Function);
            expect(f.onCancel).toBeInstanceOf(Function);
            expect(f.onTimeout).toBeInstanceOf(Function);
            expect(f.start).toBeInstanceOf(Function);
            expect(f.isCancelled).toBeInstanceOf(Function);
            expect(f.check).toBeInstanceOf(Function);
            expect(f.cancel).toBeInstanceOf(Function);
            expect(f.start).toBeInstanceOf(Function);
        });

        test('Initial state', () => {
            const f = new Future(() => 1);
            expect(f.state).toBe('PENDING')
            expect(f.isCancelled()).toBe(false);
            expect(async () => f.check(() => 'OK')).rejects.toThrow();
        });

        test('Start'  , () => {
            const fNever = new Future(never);
            expect(fNever.start().state).toBe('STARTED');
            const fImmediate = new Future(() => 1);
            expect ((async() => {
                await fImmediate.start();
                return fImmediate.state;
            })())
        .resolves.toBe('FULFILLED');
        });
    });
});
