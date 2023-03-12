/*
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import {State, Future} from '..';

export const p_never = new Promise(() => {});

export type MethodTags = 'static' | 'constructor' | 'instance' | 'field';

export type StaticFieldName<T> = Exclude<keyof T, ''>;
export type InstanceFieldName<T> = string & Exclude<keyof T, 'prototype'>;

export type FieldName<T, S> = StaticFieldName<T> | InstanceFieldName<S>;

export interface InstanceMethodSpec<T> {
    name: InstanceFieldName<T>;
    tags: Array<MethodTags>;
    type?: (a: any) => boolean;
}

export interface StaticMethodSpec<S> {
    name: StaticFieldName<S>;
    tags: Array<MethodTags>;
    type?: (a: any) => boolean;
}

export type MethodSpec<T, S> = InstanceMethodSpec<T> | StaticMethodSpec<S>;

export const is = <T>(c: new (...args: any[]) => T) => (a: any): a is T => a instanceof c;
export const isState = (...states: State[]) =>
    states.length === 0
    ? (v: any) => Object.values(State).includes(v)
    : (v: any) => states.includes(v);

export const isStatic =
    <T, S extends Object>(method: MethodSpec<T, S>): method is StaticMethodSpec<S> =>
        method.tags.includes('static');

export const isInstance =
    <T, S extends Object>(method: MethodSpec<T, S>): method is InstanceMethodSpec<T> =>
        method.tags.includes('instance');

/**
 * A filter on method specs based on the presence of a tag.
 * @param tag 
 * @returns A predicate on {@link MethodSpec}s that returns true if the spec as the given tag.
 */
export const hasTag = (tag: MethodTags) =>
    <T,S>(method: MethodSpec<T,S>) =>
        method.tags.includes(tag);
