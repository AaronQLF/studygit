"use client";

// Notion-style block manipulation shortcuts:
//   Alt+ArrowUp / Alt+ArrowDown — move the current block (or list item)
//   Mod+D                       — duplicate the current block
//
// "Block" resolves to the deepest enclosing list/task item so reordering
// works item-by-item inside lists; everywhere else it's the top-level
// block (paragraph, heading, callout, table, …).

import { Extension, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";

function blockDepth($from: ResolvedPos): number {
  for (let d = $from.depth; d >= 1; d -= 1) {
    const name = $from.node(d).type.name;
    if (name === "listItem" || name === "taskItem") return d;
  }
  return 1;
}

function moveBlock(editor: Editor, dir: -1 | 1): boolean {
  const { state, view } = editor;
  const { $from, $to } = state.selection;
  if ($from.depth < 1) return false;

  const depth = blockDepth($from);
  const start = $from.before(depth);
  const end = $from.after(depth);
  // Selection spilling past this block (multi-block select) — leave the
  // default arrow behavior alone rather than moving half the selection.
  if ($to.pos > end) return false;

  const parent = $from.node(depth - 1);
  const index = $from.index(depth - 1);
  const targetIndex = index + dir;
  if (targetIndex < 0 || targetIndex >= parent.childCount) return false;

  const node = $from.node(depth);
  const sibling = parent.child(targetIndex);

  // Swap with the sibling: delete the block, then re-insert on the far
  // side of the sibling. Both insert positions are computed against the
  // post-delete document (the sibling shifts into `start` when moving
  // down).
  const insertPos = dir === -1 ? start - sibling.nodeSize : start + sibling.nodeSize;
  const caretOffset = $from.pos - start;

  const tr = state.tr.delete(start, end).insert(insertPos, node);
  tr.setSelection(
    TextSelection.near(tr.doc.resolve(insertPos + caretOffset), 1)
  ).scrollIntoView();
  view.dispatch(tr);
  return true;
}

function duplicateBlock(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from, $to } = state.selection;
  if ($from.depth < 1) return false;

  const depth = blockDepth($from);
  const start = $from.before(depth);
  const end = $from.after(depth);
  if ($to.pos > end) return false;

  const node = $from.node(depth);
  const tr = state.tr.insert(end, node);
  tr.setSelection(
    TextSelection.near(tr.doc.resolve(end + ($from.pos - start)), 1)
  ).scrollIntoView();
  view.dispatch(tr);
  return true;
}

export const BlockKeys = Extension.create({
  name: "blockKeys",

  addKeyboardShortcuts() {
    return {
      "Alt-ArrowUp": ({ editor }) => moveBlock(editor, -1),
      "Alt-ArrowDown": ({ editor }) => moveBlock(editor, 1),
      "Mod-d": ({ editor }) => duplicateBlock(editor),
    };
  },
});
