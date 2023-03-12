/*
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import {TaskGroup, Future} from '../index';

describe("TaskGroup", () => {
    test("Is constructor", () => {
        expect(typeof TaskGroup).toBe('function');
        expect(TaskGroup.prototype).toBeDefined();
    });
});