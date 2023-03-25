/**
 * @module Future
 * Copyright 2023 by Bob Kerns. Licensed under MIT license.
 * 
 * Minimal heap implementation.
 */

const identity = <T,K>(x: T): K => x as unknown as K;

/**
 * Heap implementation.
 * 
 * @typeParam K The type of the key used to sort the heap.
 * @typeParam T The type of the values stored in the heap.
 */
export class MinHeap<K extends number|string, T> {
    #heap: Array<T> = [];
    /**
     * For testing only.
     */
    readonly __heap = this.#heap;
    #keyFn: (x: T) => number|string;

    /**
     * @param keyFn A function that extracts the key from the value.
     */
    constructor(keyFn: (x: T) => K = identity) {
        this.#keyFn = keyFn;
    } 

    /**
     * @returns The first element in the heap, or `undefined` if the heap is empty.
     */
    peek() {
        return this.#heap[0];
    }
    
    /**
     * Add an item to the heap.
     * @param item 
     */
    add (item: T) {
        const heap = this.#heap;
        /* Inserting the new node at the end of the heap array */
        heap.push(item);
        const key = this.#keyFn;

        if (heap.length === 2) {
            if (key(heap[0]) > key(heap[1])) {
                [heap[0], heap[1]] = [heap[1], heap[0]];
            }
            return;
        }
        /* Finding the correct position for the new node */
        if (heap.length > 2) {
            let i = heap.length - 1;

            /* Traversing up the parent node until the current node (i) is greater than
            // the parent ((i-1)/2)*/
            let parent = Math.floor((i - 1) / 2);
            let [pk, ik] = [key(heap[parent]), key(heap[i])];
            while (i > 0 && pk > ik) {
                // Swapping the two nodes.
                [heap[parent], heap[i]]
                    = [heap[i], heap[parent]];
                [i, parent] = [parent, Math.floor((parent - 1) / 2)];
            }
        }
    }

    /**
     * Remove and return the first element in the heap.
     * @returns 
     */
    pop(): T | undefined {
        const min = this.#heap[0];
        this.#removeAt(0);
        return min;
    }

    /**
     * 
     * @param Item 
     * @returns `true` if the item is in the heap, `false` otherwise.
     */
    has(Item: T) {
        // Linear search will be better until size is quite large due to the
        // need to extract keys. Even if we optimize for the identity case,
        // the native-code linear search will be faster for reasonable sizes.
        return this.#heap.indexOf(Item) >= 0;
    }

    /**
     * Remove the given item from the heap.
     * @param item The item to remove.
     * @returns `true` if the item was found and removed, `false` otherwise.
     * @remarks This is a linear search, so it is not efficient for very
     * large heaps. But it takes a very large heap to overcome the native
     * linear search's advantages. That advantge is made even greater by the
     * need to extract keys.
     */
    remove(item: T) {
        const idx = this.#heap.indexOf(item);
        if (idx >= 0) {
            this.#removeAt(idx);
            return true;
        }
        return false;
    }
    
    /**
     * Remove the element at the given index. This is the root
     * of a subtree within the heap
     * @param i The index of the element to remove.
     */
    #removeAt(i: number): void {
        const heap = this.#heap;
        const key = this.#keyFn;

        if (heap.length > 2) {
            // Make the ith element the last, then sort it all out
            heap[i] = heap[heap.length-1];
            heap.splice(-1, 1);
            // Special case for remaining length = 2, just sxsap or not.
            if (heap.length === 2) {
                if (key(heap[0]) > key(heap[1])) {
                    [heap[0], heap[1]] = [heap[1], heap[0]];
                }
                return;
            }

            // The ith children are always at 2i+1 and 2i+2
            let left = 2 * i + 1;
            let right = 2 * i + 2;
            // Temps to av=oid evaluating the key function multiple times.
            let [vi, vl, vr] = [heap[i], heap[left], heap[right]];
            if (!vl || !vr) return;
            let [ki, kl, kr]  = [key(vi), key(vl), key(vr)] ;
            while (ki > kl || ki > kr) {
                if (kl < kr) {
                    [heap[i], heap[left]] = [vl, vi];
                    [i, vi, ki] = [left, vl, kl];
                } else {
                    [heap[i], heap[right]] = [vr, vi];
                    [i, vi, ki] = [right, vr, kr];
                }

                [left, right] = [i * 2, i * 2 + 1];
                [vl, vr] = [heap[left], heap[right]];
                if (!vl || !vr) return;
                [kl, kr] = [key(vl), key(vr)];
            }
        }

        // If there are only two elements in the array, we directly splice out the first element
        // ("first" is relative to the subtree at _i_)

        else if (heap.length <= 2) {
            heap.splice(i, 1);
        } 
    }

    get length() {
        return this.#heap.length;
    }
}