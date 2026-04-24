import type { AppState } from "./types";

export const INITIAL_STATE: AppState = {
  folders: [
    {
      id: "root-welcome",
      name: "Welcome",
      parentId: null,
      createdAt: Date.now(),
    },
  ],
  nodes: [
    {
      id: "welcome-blog",
      folderId: "root-welcome",
      position: { x: 80, y: 80 },
      width: 420,
      data: {
        kind: "blog",
        title: "Welcome to personalGIt",
        markdown:
          "# Welcome to personalGIt\n\nThis is your personal learning canvas. Create folders, drop in links, images, notes, blog posts, and documents you can highlight and comment on.\n\n- Right-click the canvas to add nodes\n- Double-click any node to edit it\n- Drag to connect nodes to map relationships\n\nAsk Cursor to write a blog about anything and it will appear right here.",
      },
    },
    {
      id: "welcome-note",
      folderId: "root-welcome",
      position: { x: 540, y: 120 },
      width: 260,
      data: {
        kind: "note",
        text: "Tip: press N on the canvas to add a quick note.",
        color: "#fef3c7",
      },
    },
  ],
  edges: [],
  selectedFolderId: "root-welcome",
  version: 1,
};

export const NOTE_COLORS = [
  "#fef3c7", // amber
  "#dbeafe", // blue
  "#dcfce7", // green
  "#fce7f3", // pink
  "#e9d5ff", // purple
  "#f3f4f6", // gray
];

export const HIGHLIGHT_COLORS = [
  "#fde68a", // yellow
  "#bbf7d0", // green
  "#bfdbfe", // blue
  "#fbcfe8", // pink
  "#fecaca", // red
];
