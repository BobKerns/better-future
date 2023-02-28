import {Future } from '../index';

describe("Dummy test", () => {
    test("Hello", async () => {
        expect((await new Future(() => "HELL WRLD!"))).toBe("HELL WRLD!");
    })
});
