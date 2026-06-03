export const entityData = {
  "david-flowerdew": {
    entityType: "person",
    entityId: "david-flowerdew",
    title: "David Flowerdew",
    subtitle: "BNP Paribas · Agency MBS Trader",
    meta: [
      ["Function", "Trading"],
      ["Strategy", "Agency MBS"],
      ["Location", "New York"],
      ["Updated",  "2 hours ago"],
    ],
    notes:
      "Strong passthrough mortgage context. Relevant for BNP agency MBS desk conversations and broader rates workflow mapping.",
  },
  "kate-li": {
    entityType: "person",
    entityId: "kate-li",
    title: "Kate Li",
    subtitle: "Fidelity · Digital Assets / Data Science",
    meta: [
      ["Function", "Data Science"],
      ["Strategy", "Digital Assets"],
      ["Location", "San Francisco"],
      ["Updated",  "Today"],
    ],
    notes:
      "Strong technical digital asset profile with relevant blockchain and data science experience.",
  },
  "liam-fox": {
    entityType: "person",
    entityId: "liam-fox",
    title: "Liam Fox",
    subtitle: "Old Mission · ETF / Indexing",
    meta: [
      ["Function", "Trading / Indexing"],
      ["Strategy", "ETF / Smart Beta"],
      ["Location", "Chicago"],
      ["Updated",  "Yesterday"],
    ],
    notes:
      "Relevant for ETF and index-related buildouts, especially smart beta and platform-oriented mandates.",
  },
  "bnp-paribas": {
    entityType: "firm",
    entityId: "bnp-paribas",
    title: "BNP Paribas",
    subtitle: "Firm · Rates / MBS / Macro",
    meta: [
      ["Type",     "Bank"],
      ["Focus",    "Rates / MBS"],
      ["Location", "New York / Global"],
      ["Updated",  "Today"],
    ],
    notes:
      "Important platform for U.S. rates and mortgage buildout. Relevant across mandates, desk mapping, and candidate conversations.",
  },
  "millennium": {
    entityType: "firm",
    entityId: "millennium",
    title: "Millennium",
    subtitle: "Firm · Multi-manager hedge fund",
    meta: [
      ["Type",     "Hedge Fund"],
      ["Focus",    "Multi-manager"],
      ["Location", "Global"],
      ["Updated",  "Today"],
    ],
    notes:
      "Core multi-manager platform. Important anchor entity in talent mapping and platform adjacency.",
  },
};

export const contextData = {
  person: {
    "david-flowerdew": {
      activity: [
        { title: "Work history updated", meta: "2 hours ago" },
        { title: "Note added",           meta: "Yesterday" },
        { title: "Reminder due this week", meta: "Follow-up" },
      ],
      notes:     ["Strong passthrough mortgage context", "Relevant to BNP MBS desk mapping"],
      reminders: ["Follow up Thursday", "Review seat context"],
      related:   ["BNP Paribas", "Agency MBS", "Rates Trading"],
      strategies: [
        { strategy_name: "Agency MBS",          confidence: 0.94, review_status: "confirmed" },
        { strategy_name: "Rates RV",            confidence: 0.87, review_status: "confirmed" },
        { strategy_name: "Passthrough Mortgages", confidence: 0.81, review_status: "pending" },
        { strategy_name: "TBA Trading",         confidence: 0.76, review_status: "pending" },
      ],
      performance: [
        { year: 2023, pnl_usd: 4200000,  return_pct: 14.2 },
        { year: 2022, pnl_usd: -800000,  return_pct: -3.1 },
      ],
    },
    "kate-li": {
      activity: [
        { title: "Profile reviewed", meta: "Today" },
        { title: "New note added",   meta: "Today" },
      ],
      notes:     ["Strong digital asset data science profile", "Relevant for in-house digital asset roles"],
      reminders: ["Check location flexibility"],
      related:   ["Fidelity", "Digital Assets", "Data Science"],
    },
    "liam-fox": {
      activity: [
        { title: "ETF note updated", meta: "Yesterday" },
      ],
      notes:     ["Relevant to smart beta / ETF coverage"],
      reminders: ["Review index model experience"],
      related:   ["Old Mission", "ETF", "Smart Beta"],
    },
  },
  firm: {
    "bnp-paribas": {
      activity: [
        { title: "Firm note added",         meta: "Today" },
        { title: "Desk mapping updated",    meta: "Yesterday" },
      ],
      notes:     ["Important U.S. rates / MBS buildout platform", "Relevant to multiple active conversations"],
      reminders: ["Update rates sales mapping", "Review mandate alignment"],
      related:   ["David Flowerdew", "Rates", "Agency MBS"],
      funds: [
        { name: "BNP Paribas Global Rates Fund", fund_type: "Long-Only", aum_usd: 4800000000 },
        { name: "BNP Paribas MBS Strategy",      fund_type: "Credit",    aum_usd: 1200000000 },
      ],
    },
    "millennium": {
      activity: [
        { title: "Platform update logged", meta: "Today" },
      ],
      notes:     ["Anchor multi-manager platform in talent mapping"],
      reminders: ["Review RV pod moves"],
      related:   ["Macro", "Rates RV", "Multi-manager"],
      funds: [
        { name: "Millennium International Ltd", fund_type: "Multi-Strategy", aum_usd: 68000000000 },
        { name: "Millennium USA LLC",           fund_type: "Multi-Strategy", aum_usd: null },
        { name: "Rates RV Pod",                 fund_type: "Relative Value", aum_usd: 2100000000 },
      ],
    },
  },
};

export const commandData = [
  { id: "open-platform",      type: "command", title: "Open Platform",      shortcut: "G P", subtitle: "Navigation" },
  { id: "open-pipeline",      type: "command", title: "Open Pipeline",      shortcut: "G L", subtitle: "Navigation" },
  { id: "open-mandates",      type: "command", title: "Open Mandates",      shortcut: "G M", subtitle: "Navigation" },
  { id: "open-client-requests", type: "command", title: "Open Client Requests", shortcut: "G C", subtitle: "Navigation" },
  { id: "open-research-tasks",  type: "command", title: "Open Research Tasks",  shortcut: "G R", subtitle: "Navigation" },
  { id: "open-followups",     type: "command", title: "Open Follow-ups",    shortcut: "G F", subtitle: "Navigation" },
  { id: "open-hf-map",        type: "command", title: "Open HF Map",        shortcut: "G H", subtitle: "Navigation" },
  { id: "open-ir-map",        type: "command", title: "Open IR Map",        shortcut: "G I", subtitle: "Navigation" },
  { id: "open-finra",         type: "command", title: "Open FINRA Monitor", shortcut: "G N", subtitle: "Navigation" },
  { id: "open-bbg",           type: "command", title: "Open BBG Monitor",   shortcut: "G B", subtitle: "Navigation" },
  { id: "open-system-health", type: "command", title: "Open System Health", shortcut: "G S", subtitle: "Navigation" },
];
