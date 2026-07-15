# Product

## Register

product

## Users

Maritime professionals at the Indian Register of Shipping (IRClass): surveyors, technical staff, and department managers. They are domain experts (MARPOL, SOLAS, survey reports, vessel certification) but not AI users. They open the app mid-task to find or add knowledge, often under time pressure. Admins (a small ops group) additionally manage users, departments, and AI configuration.

## Product Purpose

**IRClass Navigator** — a maritime knowledge operating system. Users connect their information (documents, reports, circulars) and ask questions about it. Not a chatbot: AI is the interface, knowledge is the product. Success = a first-time surveyor understands the product in under 10 seconds without documentation and gets an answer with citations on their first try.

## Brand Personality

Institutional, trustworthy, unobtrusive. "A trusted maritime instrument panel," not an AI product. Confidence through restraint: the interface disappears behind the task.

## Anti-references

- Trendy SaaS: gradients, glassmorphism, floating/particle effects, hero-metric dashboards.
- Chatbot UIs: no "AI magic" theatrics, no model names, no retrieval-mode choices surfaced to members.
- Startup landing aesthetics: the logo area must read institutional, not playful.
- AI jargon anywhere member-facing: never "vector store", "embeddings", "chunks", "indexes".

## Design Principles

1. **One primary action.** "Ask IRClass Navigator" is the single visual priority on every entry surface. If two equally weighted primary actions appear on a screen, the design failed. Squint test order: logo → ask box → quick actions → recent work.
2. **Technology invisible.** Members never see models, transformations, retrieval modes, or admin machinery. The system decides; the user types.
3. **Honest UI.** Features that don't exist are not shown (no "coming soon" buttons). When email integrations ship, they appear; until then, nothing.
4. **Operators see work, managers see metrics.** Members get recents and their workspaces; only admins get counts.
5. **Understandable in 5 seconds.** Where do I ask, where do I upload, where are my documents, who do I contact — all answerable at a glance.

## Vocabulary (committed nouns)

Workspace (never Notebook), Knowledge (sidebar) / Knowledge library (action phrasing), Ask Navigator, Departments (organisations), Knowledge queries (not "questions asked"). Processed / Ready to search (not embedded/chunked).

## Accessibility & Inclusion

Minimum 16px body text on reading surfaces, ≥44px click targets, ≥4.5:1 text contrast, full keyboard navigation, screen-reader compatible labels, `prefers-reduced-motion` respected. Motion limited to hover elevation, skeletons, and processing indicators.
