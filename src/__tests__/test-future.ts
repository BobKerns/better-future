import { Future } from "../future";

const never = () => new Promise(() => {})

describe("Basic", () => {
    describe("API completeness", () => {
        describe("Static Methods", () =>
            test.each([
                Future,
                Future.delay,
                Future.timeout,
                Future.timeoutFromNow,
                Future.resolve,
                Future.reject,
                Future.cancelled,
                Future.never
            ].map(f => ({name: f == Future ? '' : `.${f.name}`, f})))(
                "Future$name is a function",
                ({f}) => expect(f).toBeInstanceOf(Function)
            ));

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
            expect(f.check).toBeInstanceOf(Function);
            expect(f.cancel).toBeInstanceOf(Function);
            expect(f.start).toBeInstanceOf(Function);
        });

        test('Initial state', () => {
            const f = new Future(() => 1);
            expect(f.state).toBe('PENDING')
            expect(f.isCancelled).toBe(false);
            expect(async () => f.check(() => 'OK')).rejects.toThrow();
        });

        describe('Start'  , () => {
            test ("Never", () => {
                const fNever = new Future(never);
                expect(fNever.start().state).toBe('STARTED');
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
