## 2025-02-14 - Redundant ResizeObserver in List Items

**Learning:** In Svelte 5 (and general list virtualization/layout patterns), parent components often manage layout measurements via wrapper elements using `bind:clientHeight`. Internal `ResizeObserver` instances in child components that dispatch resize events can be redundant and performance-heavy if the parent ignores them.
**Action:** Always check if a component's emitted events (like `resize`) are actually listened to by its consumers before optimizing or maintaining complex measurement logic. Verify if the parent handles measurement via bindings instead.
