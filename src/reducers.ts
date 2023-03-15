/**
* @module Future
* Copyright 2023 by Bob Kerns. Licensed under MIT license.
*/

import type { ReducerGroup, Reducer } from './types';

/**
 * A
 */
export function *arithmetic_mean<T extends number, R extends number>(group: ReducerGroup<T, R>): Reducer<T, R> {
    let n = 0;
    let m = 0;
    while (true) {
        const [v, idx] = yield;
        n++;
        if (idx === -1) {
            // Throwing will cause the group to reject.
            if (n === 0) throw new Error("No data for an average");
            return m as R;
        }
    }
}

export interface Statistics {
    n: number;
    average?: number;
    variance?: number;
    standard_deviation?: number;
    sample_variance?: number;

    sample_standard_deviation?: number;
    quadratic_mean?: number;
}

export function *statistics(group: ReducerGroup<number, Statistics>): Reducer<number, Statistics> {
    let n = 0;
    let average = 0;
    let quadratic = 0;
    let S = 0;
    while (true) {
        n++;
        const [v, idx] = yield;
        if (idx === -1) {
            if (n === 0) return {n};
            const variance = S / n;
            const standard_deviation = Math.sqrt(variance);
            const quadratic_mean = Math.sqrt(quadratic);
            if (n === 1) return {
                n,
                average,
                standard_deviation,
                variance,
                quadratic_mean
            };
            const sample_variance = S / (n - 1);
            const sample_standard_deviation = Math.sqrt(sample_variance);
            return {
                n,
                average,
                standard_deviation,
                variance,
                quadratic_mean,
                sample_standard_deviation,
                sample_variance
            };
        }
        const m0 = average;
        average = average + (v - average) / n;
        S = S + (v - m0) * (v - average);
        const v2 = v * v;
        quadratic = quadratic + (v2 - quadratic) / n;
    }
}
