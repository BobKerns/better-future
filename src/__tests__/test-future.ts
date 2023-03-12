/*
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 */

import { Future } from "../future";

const never = () => new Promise(() => {})

type MethodTags = 'static' | 'constructor' | 'instance';

type StaticFieldName = Exclude<keyof typeof Future, ''>;
type InstanceFieldName = string & Exclude<keyof Future<any>, 'prototype'>;

type FieldName = StaticFieldName | InstanceFieldName;

interface MethodSpec {
    name: FieldName;
    tags: Array<MethodTags>
}

const methods: Array<MethodSpec> = [
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
    {name: 'start', tags: ['instance']},
    {name: 'check', tags: ['instance']},
    {name: 'cancel', tags: ['instance']},
    {name: 'start', tags: ['instance']}
];

const hasTag = (tag: MethodTags) => (method: MethodSpec) => method.tags.includes(tag);

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
                .filter(hasTag('static'))
                .map(method => ({name: method.name, method})))(
                    "Future$name is a function",
                    spec => expect(Future[spec.name as StaticFieldName]).
                        toBeInstanceOf(Function)
            ));
        describe('Instance Methods', () => {
        const f: Future<number> = new Future(() => 1);
        const instanceMethods: Array<keyof typeof f> = [
            'then',
            'catch',
            'finally',
            'when',
            'onStart',  
            'onCancel',
            'onTimeout',
            'start',
            'check',
            'cancel',
            'start'
        ];
        test('InstanceOfFuture', () => expect(f).toBeInstanceOf(Future));
        test.each((instanceMethods).map(name => ({name, value: f[name]})))
        ("Method Future.$name", ({name, value}) =>
            expect(value).toBeInstanceOf(Function));
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
