import type { AppState } from "./types";

export const DEFAULT_WORKSPACE_ID = "ws-personal";

export const INITIAL_STATE: AppState = {
  workspaces: [
    {
      id: DEFAULT_WORKSPACE_ID,
      name: "Personal",
      createdAt: Date.now(),
    },
  ],
  nodes: [
    {
      id: "welcome-page",
      workspaceId: DEFAULT_WORKSPACE_ID,
      position: { x: 80, y: 80 },
      width: 440,
      data: {
        kind: "page",
        title: "Welcome to personalGIt",
        content:
          "<h1>Welcome to personalGIt</h1>" +
          "<p>This is your personal learning canvas. Capture readings, write structured notes, connect ideas visually.</p>" +
          "<h2>Try a page</h2>" +
          "<p>Press <code>/</code> inside any page to open the slash menu. Insert headings, lists, todos, toggles, callouts, code, math, or diagrams.</p>" +
          '<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Drop a PDF onto the canvas and highlight a passage</p></div></li>' +
          '<li data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Add a Page (<code>B</code>) and try the slash menu</p></div></li>' +
          '<li data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Drag from one node\u2019s handle to another to connect ideas</p></div></li></ul>' +
          "<h2>Keyboard</h2>" +
          "<ul><li><code>L I N B D P</code> on the canvas \u2014 add a link, image, note, page, doc, or pdf</li>" +
          "<li><code>\u2318K</code> \u2014 command palette</li>" +
          "<li><code>[</code> \u2014 toggle sidebar</li>" +
          "<li><code>Enter</code> on a selected node \u2014 focus it</li></ul>",
      },
    },
    {
      id: "welcome-note",
      workspaceId: DEFAULT_WORKSPACE_ID,
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
  selectedWorkspaceId: DEFAULT_WORKSPACE_ID,
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

// Fill palette for shape nodes. "transparent" renders an outline-only frame.
export const SHAPE_FILLS = [
  "transparent",
  "#fde68a", // amber
  "#bfdbfe", // blue
  "#bbf7d0", // green
  "#fbcfe8", // pink
  "#ddd6fe", // purple
  "#fecaca", // red
  "#e7e5e4", // stone
];

// Border palette for shape nodes, paired roughly to the fills above.
export const SHAPE_STROKES = [
  "#92400e", // amber
  "#1d4ed8", // blue
  "#15803d", // green
  "#be185d", // pink
  "#6d28d9", // purple
  "#b91c1c", // red
  "#57534e", // stone
  "#1f2937", // slate
];
