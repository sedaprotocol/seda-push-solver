/**
 * CacheCapacityMap<Key, Value>
 *
 * A cache implementation with a fixed capacity. When the cache reaches its maximum
 * capacity, the oldest items are automatically removed to make room for new entries.
 */

import { Maybe } from "true-myth";

export class CacheCapacityMap<Key, Value> {
	private storage: Map<Key, Value> = new Map();
	private keys: Key[] = [];

	constructor(private maxItems: number) {}

	set(key: Key, value: Value) {
		this.storage.set(key, value);
		this.keys.push(key);

		// Remove from cache if we got too many items
		if (this.keys.length > this.maxItems) {
			const removedKey = this.keys.shift();

			// This should not happen since we do have a length.
			if (!removedKey) {
				return;
			}

			this.storage.delete(removedKey);
		}
	}

	get(key: Key): Maybe<Value> {
		return Maybe.of(this.storage.get(key));
	}

	delete(key: Key) {
		const cachedKeyIndex = this.keys.findIndex((k) => k === key);
		this.keys.splice(cachedKeyIndex);
		this.storage.delete(key);
	}
}
