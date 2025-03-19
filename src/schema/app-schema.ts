/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  SchemaFactory,
  Tree,
  TreeViewConfiguration,
  type ValidateRecursiveSchema,
} from "fluid-framework";
import { v4 as uuid } from "uuid";

// Schema is defined using a factory object that generates classes for objects as well
// as list and map nodes.

// Include a UUID to guarantee that this schema will be uniquely identifiable.
const sf = new SchemaFactory("fc1db2e8-0a00-11ee-be56-0242ac120002");

// Define the schema for the note object.
export class Note extends sf.object(
	"Note",
	{
		id: sf.string,
		text: sf.string,
		author: sf.string,
		votes: sf.array(sf.string),
		created: sf.number,
		lastChanged: sf.number,
	},
) {
	// Update the note text and also update the timestamp in the note
	public readonly updateText = (text: string) => {
		this.lastChanged = new Date().getTime();
		this.text = text;
	};

	public readonly toggleVote = (user: string) => {
		const index = this.votes.indexOf(user);
		if (index > -1) {
			this.votes.removeAt(index);
		} else {
			this.votes.insertAtEnd(user);
		}

		this.lastChanged = new Date().getTime();
	};

	public readonly delete = () => {
		const parent = Tree.parent(this);
		if (Tree.is(parent, Items)) {
			const index = parent.indexOf(this);
			parent.removeAt(index);
		}
	};
}

// Schema for a list of Notes and Groups.
export class Items extends sf.arrayRecursive("Items", [() => Item, Note]) {
	public readonly addNode = (author: string) => {
		const timeStamp = new Date().getTime();

		const newNote = new Note({
			id: uuid(),
			text: "",
			author,
			votes: [],
			created: timeStamp,
			lastChanged: timeStamp,
		});

		this.insertAtEnd(newNote);
	};

	public readonly addGroup = (name: string): Item => {
		const group = new Item({
			id: uuid(),
			name,
			items: new Items([]),
		});

		this.insertAtEnd(group);
		return group;
	};
}

{
	// Type validation helper
	type _check = ValidateRecursiveSchema<typeof Items>;
}

// Define the schema for the container of notes.
export class Item extends sf.objectRecursive("Item", {
	id: sf.string,
	name: sf.string,
	text: sf.string,
	items: Items,
}) {
	public readonly delete = () => {
		const parent = Tree.parent(this);
		if (Tree.is(parent, Items)) {
			// Run the deletion as a transaction to ensure that the tree is in a consistent state
			Tree.runTransaction(parent, () => {
				// Move the children of the group to the parent
				if (this.items.length !== 0) {
					const index = parent.indexOf(this);
					parent.moveRangeToIndex(index, 0, this.items.length, this.items);
				}

				// Delete the now empty group
				const i = parent.indexOf(this);
				parent.removeAt(i);
			});
		}
	};
}

{
	// Type validation helper
	type _check = ValidateRecursiveSchema<typeof Item>;
}

// Export the tree config appropriate for this schema.
export const appTreeConfiguration = new TreeViewConfiguration(
	// Schema for the root
	{ schema: Items },
);