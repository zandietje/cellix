# Phase Check Command

Validate completion of current development phase.

## Arguments

- `$ARGUMENTS` - Phase number to check (e.g., "1", "2", "3")

## Purpose

Verify that all requirements for a development phase are complete before moving to the next phase.

## Process

### Step 1: Load Phase Requirements

Read `FEATURE_PLAN.md` and extract the checklist for the specified phase.

### Step 2: Verify Each Item

For each checklist item in the phase:

1. **Check if code exists** - Search for relevant files/functions
2. **Verify functionality** - Run related tests if available
3. **Check integration** - Ensure it works with other components

### Step 3: Run Validation Gates

```bash
# Build check
pnpm build

# Type check
pnpm exec tsc --noEmit

# Lint check
pnpm lint

# Test check
pnpm test
```

### Step 4: Generate Report

```markdown
# Phase {N} Completion Check

## Phase: {Phase Name}
**Goal:** {Phase goal from FEATURE_PLAN.md}

## Checklist Status

### {Section 1}
- [x] Item 1 - `path/to/implementation.ts`
- [x] Item 2 - `path/to/implementation.ts`
- [ ] Item 3 - **MISSING**

### {Section 2}
- [x] Item 1 - `path/to/implementation.ts`
- [ ] Item 2 - **INCOMPLETE** (reason)

## Validation Gates
| Gate | Status | Notes |
|------|--------|-------|
| Build | PASS/FAIL | |
| TypeScript | PASS/FAIL | X errors |
| Lint | PASS/FAIL | X warnings |
| Tests | PASS/FAIL | X/Y passing |

## Deliverable Verification
**Expected:** {Deliverable from FEATURE_PLAN.md}
**Actual:** {Description of current state}
**Status:** COMPLETE / INCOMPLETE

## Summary
- **Completed:** X/Y items (Z%)
- **Missing:** List of missing items
- **Blockers:** Any blocking issues

## Recommendation
- [ ] Phase complete - Ready for Phase {N+1}
- [ ] Phase incomplete - Address items above
```

## Phase Reference

| Phase | Key Deliverable |
|-------|-----------------|
| 1 | Add-in loads in Excel, shows chat UI, backend health check |
| 2 | Add-in can read/write Excel data, shows context in UI |
| 3 | Chat with AI, receive structured tool calls |
| 4 | Preview actions before execution, safe writes |
| 5 | AI responses grounded in ecommerce domain knowledge |
| 6 | Pull live data from Shopee/Lazada |
| 7 | Proactive alerts when metrics behave abnormally |
| 8 | Intelligent cross-platform/period comparisons |
| 9 | One-click report generation |
| 10 | Ready-to-use ecommerce analytics templates |
| 11 | Receive alerts in Slack, Teams, or email |
| 12 | Production-ready add-in in AppSource |

## Automated Checks by Phase

### Phase 1 Checks
- `apps/addin/` directory exists
- `apps/backend/` directory exists
- `manifest.xml` present
- Health endpoint responds
- Add-in loads without errors

### Phase 2 Checks
- Excel read helpers implemented
- Excel write helpers implemented
- Context extraction working
- Control panel UI renders

### Phase 3 Checks
- AI service configured
- Tool schemas defined
- Chat endpoint responds
- Streaming works

### Phase 4 Checks
- Validation layer present
- Preview component renders
- Execution engine handles queue
- Safety controls enforced

### Phase 5+ Checks
Specific to each phase's feature set.
