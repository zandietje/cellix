# Execute PRP Command

Implement a feature using its Project Requirement Plan.

## Arguments

- `$ARGUMENTS` - Path to PRP file (e.g., "PRPs/excel-read-helpers.md")

## Purpose

Execute a feature implementation following the detailed plan in the PRP, ensuring all validation gates pass.

## Process

### Phase 1: Load Context

1. **Read CLAUDE.md** - Load architecture rules and hard constraints
2. **Read the PRP file** - Load the implementation plan
3. **Read FEATURE_PLAN.md** - Cross-reference with overall feature specs

### Phase 2: Pre-Implementation Check

Verify:
- [ ] All dependencies mentioned in PRP exist or will be created
- [ ] No conflicts with existing code
- [ ] Development environment is ready (`pnpm install` done)

### Phase 3: Implementation

#### ULTRATHINK Mode

Before writing any code, create a comprehensive mental model:
1. Trace the data flow through the feature
2. Identify all touch points with existing code
3. Consider error scenarios
4. Plan the order of file creation/modification

#### Execute Steps

Follow the PRP's "Implementation Steps" section:
1. Create files in the specified order
2. Implement each component according to the plan
3. Use code snippets from PRP as templates
4. Follow existing patterns in the codebase

#### Coding Standards

- TypeScript strict mode
- Zod for runtime validation
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- No console.log in production code (use proper logging)

### Phase 4: Validation Gates

Execute ALL validation gates from the PRP:

#### Build Check
```bash
pnpm build
```

#### Lint Check
```bash
pnpm lint
```

#### Type Check
```bash
pnpm exec tsc --noEmit
```

#### Test
```bash
pnpm test
```

### Phase 5: Completion Checklist

Before marking complete, verify:

- [ ] All files from "Files to Create" exist
- [ ] All modifications from "Files to Modify" done
- [ ] All implementation steps completed
- [ ] Build passes
- [ ] Lint passes
- [ ] Tests pass (if tests were part of scope)
- [ ] Safety considerations addressed

### Phase 6: Final Review

1. **Re-read the PRP** - Ensure nothing was missed
2. **Cross-reference CLAUDE.md** - Verify hard rules followed
3. **Check safety controls** - Especially for Excel write operations

## Output

Provide a completion report:

```markdown
# PRP Execution Complete: {Feature Name}

## Files Created
- `path/to/file.ts` - Description

## Files Modified
- `path/to/file.ts` - What changed

## Validation Results
- Build: PASS/FAIL
- Lint: PASS/FAIL
- Tests: PASS/FAIL

## Deviations from Plan
(List any changes made that differ from the PRP)

## Known Issues
(Any issues discovered during implementation)

## Ready for Testing
- [ ] Manual testing steps listed here
```

## Error Handling

If a validation gate fails:
1. Identify the issue
2. Fix without deviating from architecture
3. Re-run validation
4. Document the fix

If blocked:
1. Document the blocker
2. Ask user for guidance if architectural decision needed
3. Do not proceed with workarounds that violate CLAUDE.md rules
