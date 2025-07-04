import { get } from "svelte/store";
import { describe, it, expect } from "vitest";
import {
  createChecklist,
  addItem,
  toggleItem,
  checklists,
} from "../../services/checklistService";

describe("checklist integration", () => {
  it("persists multiple lists", () => {
    const id1 = createChecklist("A", "packing");
    const id2 = createChecklist("B", "shopping");
    addItem(id1, "one");
    addItem(id2, "two");
    toggleItem(id1, get(checklists).find((l) => l.id === id1)!.items[0].id);
    const l1 = get(checklists).find((l) => l.id === id1)!;
    const l2 = get(checklists).find((l) => l.id === id2)!;
    expect(l1.items[0].state).toBe("checked");
    expect(l2.items[0].state).toBe("active");
  });
});
