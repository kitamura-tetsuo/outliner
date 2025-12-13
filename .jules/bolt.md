## 2025-12-13 - [OutlinerItem Layout Thrashing]

**Learning:** `getClickPosition` in `OutlinerItem` was performing O(N) layout thrashing (creating span, setting text, measuring width) for every character on every click/drag. This fallback was being hit because `document.caretRangeFromPoint` returns local offsets which didn't match the global text index expected by the component.
**Action:** When implementing custom text rendering (like rich text overlays), ensure cursor mapping logic handles the mismatch between DOM structure and raw text index efficiently (e.g., by traversing DOM length) rather than relying on expensive measurement loops.
