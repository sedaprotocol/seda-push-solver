import { describe, expect, it } from "bun:test";
import { CacheCapacityMap } from "./cache";
import { unwrap } from "./unwrap";

describe("cache", () => {
	it("Should be able to store and get items normally", () => {
		const cache = new CacheCapacityMap<string, string>(10);
		cache.set("test", "a");

		expect(unwrap(cache.get("test"))).toBe("a");
	});

	it("Should remove items when it reached it max capicity", () => {
		const cache = new CacheCapacityMap<string, string>(2);
		cache.set("a", "1");
		cache.set("b", "2");

		expect(unwrap(cache.get("a"))).toBe("1");

		cache.set("c", "3");

		expect(cache.get("a").isNothing).toBe(true);
		expect(unwrap(cache.get("b"))).toBe("2");
		expect(unwrap(cache.get("c"))).toBe("3");
	});
});
