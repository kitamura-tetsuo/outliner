Yes! The test "editing the bottom item adds new sibling" explicitly types `" hello"` into the last item and expects the total count of items to increase by ONE (`countBefore + 1`).
But it received `4` (meaning `countBefore + 2`).
Why did it add TWO siblings when we typed?
Because for every keystroke, maybe the auto-add logic runs and creates an item?
Wait, if it adds an item on edit, where is that logic?
Let's find the logic for auto-adding a sibling when editing the last item.
