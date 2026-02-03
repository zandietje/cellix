# Code Review Command

Perform technical code review on recent changes.

## Arguments

- `$ARGUMENTS` - (Optional) Specific file or directory to review, or "staged" for staged changes

## Purpose

Review code for quality, bugs, security, and adherence to project standards.

## Process

### Step 1: Identify Changes

If no argument provided, review recent uncommitted changes:
```bash
git diff HEAD
git status
```

If "staged" specified:
```bash
git diff --cached
```

If file/directory specified, read those files.

### Step 2: Analysis Categories

Review each category and note findings:

#### 2.1 Logic Errors
- Off-by-one errors
- Incorrect conditionals
- Missing null/undefined checks
- Race conditions
- Async/await issues

#### 2.2 Security Issues (Critical for Cellix)
- Input validation (Zod usage)
- Excel formula injection
- XSS in UI components
- Token/credential exposure
- Unsafe external links in formulas

#### 2.3 Performance Problems
- Unbatched Office.js calls
- Missing memoization
- N+1 queries
- Large object copying
- Memory leaks (event listeners)

#### 2.4 Code Quality
- TypeScript type safety
- Error handling patterns
- Naming conventions
- Code duplication
- Function complexity

#### 2.5 Cellix-Specific Rules
Check against CLAUDE.md hard rules:
- [ ] Preview required for Excel writes?
- [ ] Cell limit enforced (500 max)?
- [ ] No sheet deletion?
- [ ] Audit logging present?
- [ ] Zod validation used?

### Step 3: Generate Report

Create review report with this structure:

```markdown
# Code Review: {Scope/Files}

## Summary
Brief overview of changes reviewed.

## Findings

### Critical (Must Fix)
Issues that block merge:
- **[SECURITY]** Description - `file:line`
- **[BUG]** Description - `file:line`

### High (Should Fix)
Important issues:
- **[PERFORMANCE]** Description - `file:line`
- **[LOGIC]** Description - `file:line`

### Medium (Consider)
Improvements to consider:
- **[QUALITY]** Description - `file:line`

### Low (Suggestions)
Nice-to-have improvements:
- **[STYLE]** Description - `file:line`

## Cellix Rules Compliance
- [ ] Preview required for writes: PASS/FAIL
- [ ] Cell limits enforced: PASS/FAIL
- [ ] Zod validation used: PASS/FAIL
- [ ] Error handling present: PASS/FAIL
- [ ] TypeScript strict: PASS/FAIL

## Recommended Actions
1. Action item 1
2. Action item 2

## Approval
- [ ] Ready to merge (no critical/high issues)
- [ ] Needs revision (issues listed above)
```

### Step 4: Save Report (Optional)

If significant issues found, save to `.claude/code-reviews/{date}-{scope}.md`

## Severity Definitions

| Severity | Definition | Action |
|----------|------------|--------|
| Critical | Security risk, data loss, crash | Must fix before merge |
| High | Bug, significant performance issue | Should fix before merge |
| Medium | Code quality, minor performance | Fix in this or next PR |
| Low | Style, minor improvements | Consider for future |

## Focus Areas by File Type

### TypeScript Components (`*.tsx`)
- Hook dependencies correct
- Event handlers cleaned up
- Proper error boundaries
- Accessibility attributes

### Office.js Code (`excel/*.ts`)
- Operations batched in Excel.run
- Proper context.sync usage
- Error handling for OfficeExtension.Error
- Range validation

### API Routes (`routes/*.ts`)
- Input validation with Zod
- Proper error responses
- Auth middleware applied
- Rate limiting considered

### Services (`services/*.ts`)
- Single responsibility
- Proper typing
- Error propagation
- Testability
