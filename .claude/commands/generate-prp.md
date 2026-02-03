# Generate PRP Command

Generate a comprehensive Project Requirement Plan (PRP) for a feature.

## Arguments

- `$ARGUMENTS` - Feature name or description (e.g., "excel-read-helpers", "chat-ui", "shopee-connector")

## Purpose

Create a detailed implementation plan that enables one-pass feature development with high confidence.

## Process

### Phase 1: Research & Analysis

#### 1.1 Codebase Analysis
Search the existing codebase for:
- Similar patterns or implementations
- Related types and interfaces
- Relevant utility functions
- Test patterns used

```bash
# Search for related code
grep -r "keyword" apps/ packages/
```

#### 1.2 External Research
If the feature involves external APIs or libraries:
- Fetch relevant documentation using WebFetch
- Search for best practices
- Look for Office.js patterns (if Excel-related)
- Check Shopee/Lazada API docs (if connector-related)

#### 1.3 FEATURE_PLAN.md Reference
Read `FEATURE_PLAN.md` to find:
- Feature specification details
- Required sub-tasks
- Expected deliverables
- Safety requirements

### Phase 2: Clarification (if needed)

If requirements are unclear, ask the user for clarification:
- Scope boundaries
- Priority of sub-features
- Integration requirements
- Safety considerations

### Phase 3: Generate PRP Document

Create the PRP file at `PRPs/{feature-name}.md` with this structure:

```markdown
# PRP: {Feature Name}

## Overview
Brief description of the feature and its purpose.

## Context
- **Phase:** Which development phase this belongs to
- **Dependencies:** Other features or code this depends on
- **Related Files:** Existing files that will be modified or referenced

## Documentation References
- [Link 1](url) - Description
- [Link 2](url) - Description

## Research Findings

### Existing Patterns
Code patterns found in the codebase that should be followed.

### External Best Practices
Relevant patterns from documentation/research.

### Gotchas & Edge Cases
Known issues or edge cases to handle.

## Implementation Plan

### Files to Create
1. `path/to/file.ts` - Description
2. `path/to/file.ts` - Description

### Files to Modify
1. `path/to/existing.ts` - What changes needed

### Implementation Steps
1. **Step 1:** Description with pseudocode if helpful
2. **Step 2:** Description
3. ...

### Code Snippets
```typescript
// Key implementation patterns to follow
```

## Validation Gates

### Build
- [ ] `pnpm build` passes

### Lint
- [ ] `pnpm lint` passes
- [ ] No TypeScript errors

### Tests
- [ ] Unit tests written
- [ ] `pnpm test` passes

### Manual Testing
- [ ] Feature works in Excel (if add-in related)
- [ ] API responds correctly (if backend related)

## Safety Considerations
- Preview requirements (if Excel write)
- Validation rules
- Error handling approach

## Confidence Score
X/10 - Brief explanation of confidence level

## Notes
Any additional context or decisions made.
```

## Output

1. Save PRP to `PRPs/{feature-name}.md`
2. Summarize the key points of the plan
3. Report confidence score with reasoning

## Quality Standards

A good PRP should:
- Enable implementation without further research
- Include actual code snippets for complex patterns
- Reference specific file paths
- Have clear validation criteria
- Score 8+ confidence for straightforward features
