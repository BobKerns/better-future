/**
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import { timeline } from "./clock";

describe("Timeline", () => {
    test("empty", () => {
        const t = timeline``;
        expect(typeof t).toEqual('function');
    });
});