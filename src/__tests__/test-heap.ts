/**
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import { MinHeap } from "../clock/heap";

const permutations = <T>(xs: T[]): T[][] => {
    const ret: T[][] = [];
    const permute = (xs: T[], i: number) => {
        if (i === xs.length) {
            ret.push(xs.slice());
        } else {
            for (let j = i; j < xs.length; j++) {
                [xs[i], xs[j]] = [xs[j], xs[i]];
                permute(xs, i + 1);
                [xs[i], xs[j]] = [xs[j], xs[i]];
            }
        }
    };
    permute(xs, 0);
    return ret;
};

describe ("MinHeap", () => {
    test("empty", () => {
        const h = new MinHeap();
        expect(h.length).toBe(0);
    });

    test("add", () => {
        const h = new MinHeap();
        h.add(6);
        expect(h.length).toBe(1);
        expect(h.peek()).toBe(6);
    });

    test("add2", () => {
        const h = new MinHeap();
        h.add(6);
        h.add(3);
        expect(h.length).toBe(2);
        expect(h.peek()).toBe(3);
    });

    test("add3", () => {
        const h = new MinHeap();
        h.add(6);
        h.add(3);
        h.add(9);
        expect (h.__heap).toEqual([3, 6, 9]);
        expect(h.length).toBe(3);
        expect(h.peek()).toBe(3);
    });

    test("add4", () => {
        const h = new MinHeap();
        h.add(6);
        h.add(3);
        h.add(9);
        h.add(1);
        expect (h.__heap).toEqual([1, 3, 9, 6]);
        expect(h.length).toBe(4);
        expect(h.peek()).toBe(1);
    });

    test("add5", () => {
        const h = new MinHeap();
        h.add(6);
        h.add(3);
        h.add(9);
        h.add(1);
        h.add(7);
        expect (h.__heap).toEqual([1, 3, 9, 6, 7]);
        expect(h.length).toBe(5);
        expect(h.peek()).toBe(1);
    });

    test("pop", () => {
        const h = new MinHeap();
        h.add(6);
        h.add(3);
        h.add(9);
        h.add(1);
        h.add(7);
        expect(h.pop()).toBe(1);
        expect(h.pop()).toBe(3);
        expect(h.pop()).toBe(6);
        expect(h.pop()).toBe(7);
        expect(h.pop()).toBe(9);
        expect(h.length).toBe(0);
        expect(h.peek()).toBe(undefined);
    });

    test("has", () => {
        const h = new MinHeap();
        h.add(6);
        h.add(3);
        h.add(9);
        h.add(1);
        h.add(7);
        expect(h.has(1)).toBe(true);
        expect(h.has(3)).toBe(true);
        expect(h.has(6)).toBe(true);
        expect(h.has(7)).toBe(true);
        expect(h.has(9)).toBe(true);
        expect(h.has(0)).toBe(false);
        expect(h.has(2)).toBe(false);
        expect(h.has(4)).toBe(false);
        expect(h.has(5)).toBe(false);
        expect(h.has(8)).toBe(false);
        expect(h.has(10)).toBe(false);
    });

    test("remove", () => {
        const h = new MinHeap();
        h.add(6);
        h.add(3);
        h.add(9);
        h.add(1);
        h.add(7);
        expect(h.remove(17)).toBe(false);
        expect(h.remove(1)).toBe(true);
        expect(h.remove(3)).toBe(true);
        expect(h.remove(6)).toBe(true);
        expect(h.remove(7)).toBe(true);
        expect(h.remove(9)).toBe(true);
        expect(h.length).toBe(0);
        expect(h.peek()).toBe(undefined);
    });
});
