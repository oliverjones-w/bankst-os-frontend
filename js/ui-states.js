// Single source of truth for supported UI states per component type.
// Keep this in sync with actual CSS state implementations.

export const UI_STATES = {
  button: {
    primary:  ["default", "hover", "active", "disabled"],
    icon:     ["default", "hover", "active", "disabled"],
    toolbar:  ["default", "hover", "active", "disabled"],
  },
  navItem:    ["default", "hover", "active", "disabled"],
  tag:        ["default"],
  statusDot:  ["active", "inactive", "null", "error"],
  row:        ["default", "hover", "selected", "error"],
  input:      ["default", "focus", "error", "disabled"],
  card:       ["default", "focused", "dragging"],
  emptyState: ["default"],
  skeleton:   ["default"],
};

// Canonical state labels shown as column headers
export const STATE_LABELS = {
  default:  "Default",
  hover:    "Hover",
  active:   "Active",
  selected: "Selected",
  disabled: "Disabled",
  focus:    "Focus",
  error:    "Error",
  loading:  "Loading",
  dragging: "Dragging",
  focused:  "Focused",
  null:     "Null",
  inactive: "Inactive",
};
