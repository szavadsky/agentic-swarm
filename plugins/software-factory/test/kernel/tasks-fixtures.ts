export const TEXT = `---
slug: auth.token-refresh
title: Refresh tokens
kind: task
flow: implement-review
deps: [auth.session-store]
scope: [auth]
tier: default
source: Milestone auth / refresh
---

Why: rotate without a re-login.
Done when: refresh rotates the token.
`;

export const TYPES = {
  development: {
    flow: "implement-review",
    kind: "development" as const,
    schema: "outcome",
  },
  spike: { flow: "spike", kind: "spike" as const, schema: "outcome" },
};

export const TYPED = `---
slug: auth.probe
title: Probe the token store
type: spike
deps: []
scope: [auth]
---

Done when: the finding names the store.
`;
