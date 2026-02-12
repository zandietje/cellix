# PRP: Fix Read Tool Execution

## Overview

Enable execution of read tools (select_rows, group_aggregate, find_outliers, search_values, get_profile) when the AI calls them. Currently, the frontend silently ignores all non-write tools, causing the AI to say "Please hold on..." but nothing happens.

## Context

- **Priority:** Critical
- **Estimated Effort:** 1-2 days
- **Dependencies:** None (read tool executors already exist in readers.ts)

### Problem Statement

In `ChatPane.tsx` line 62:
```typescript
if (!isWriteTool(tc.name)) continue;  // All read tools are SKIPPED!
```

When the AI calls read tools to fetch data for analysis, the frontend:
1. Receives the tool call via SSE
2. Checks if it's a write tool
3. Skips it entirely if not
4. User sees "Please hold on..." but nothing happens

### Related Files

| File | Purpose |
|------|---------|
| `apps/addin/src/components/chat/ChatPane.tsx` | Handles tool calls from AI |
| `apps/addin/src/lib/tools/executor.ts` | Tool execution dispatcher |
| `apps/addin/src/lib/tools/readers.ts` | Read tool executors (already implemented) |
| `apps/addin/src/lib/tools/index.ts` | Tool utilities including isWriteTool |
| `packages/shared/src/types/tools.ts` | Tool type definitions |

## Research Findings

### Existing Read Tool Executors

The `readers.ts` file already has implementations for:
- `executeGetProfile()` - Returns sheet profile
- `executeSelectRows()` - Filters and returns rows
- `executeGroupAggregate()` - Groups and aggregates data
- `executeFindOutliers()` - Detects anomalies
- `executeSearchValues()` - Searches for values

These executors return data that should be shown to the user and/or fed back to the AI.

### Current Tool Flow

```
AI response with tool_call
    ↓
ChatPane receives tool_call_end event
    ↓
processToolCalls() called
    ↓
if (!isWriteTool(tc.name)) continue;  ← PROBLEM HERE
    ↓
Write tools: generatePreview() → PreviewPanel
Read tools: NOTHING (skipped)
```

### Desired Tool Flow

```
AI response with tool_call
    ↓
ChatPane receives tool_call_end event
    ↓
processToolCalls() called
    ↓
if (isWriteTool(tc.name)) {
  generatePreview() → PreviewPanel → User approves → Execute
} else {
  executeToolCall() → Display results → (Optional: feed back to AI)
}
```

## Implementation Plan

### Files to Modify

#### 1. `apps/addin/src/components/chat/ChatPane.tsx`

Update `processToolCalls` to handle read tools:

```typescript
const processToolCalls = useCallback(
  async (toolCalls: Array<{ id: string; name: string; arguments: string }>) => {
    for (const tc of toolCalls) {
      try {
        let parameters: Record<string, unknown> = {};
        try {
          parameters = JSON.parse(tc.arguments || '{}');
        } catch {
          // Keep empty object if parse fails
        }

        const toolCall: ToolCall = {
          id: tc.id,
          name: tc.name,
          parameters,
          status: 'pending',
        };

        if (isWriteTool(tc.name)) {
          // Write tools: Generate preview for user approval
          const preview = await generatePreview(toolCall);
          addPendingAction(preview);
          if (!preview.validation.valid) {
            updateToolCallStatus(tc.id, 'error');
          }
        } else if (isReadTool(tc.name)) {
          // Read tools: Execute immediately and store results
          const result = await executeToolCall(toolCall);
          if (result.success) {
            // Store result for display and/or AI feedback
            addToolResult(tc.id, result.resultData);
            updateToolCallStatus(tc.id, 'executed');
          } else {
            updateToolCallStatus(tc.id, 'error');
          }
        }
        // Analytics tools: No execution needed (text-only reasoning)
      } catch (err) {
        console.error(`[ChatPane] Failed to process tool ${tc.name}:`, err);
        updateToolCallStatus(tc.id, 'error');
      }
    }
  },
  [addPendingAction, updateToolCallStatus, addToolResult]
);
```

#### 2. `apps/addin/src/lib/tools/index.ts`

Add `isReadTool` helper:

```typescript
import { READ_TOOLS } from '@cellix/shared';

export function isReadTool(toolName: string): boolean {
  return READ_TOOLS.includes(toolName as any);
}
```

#### 3. `apps/addin/src/store/chatStore.ts`

Add storage for tool results:

```typescript
interface ChatState {
  // ... existing state ...

  /** Results from executed read tools */
  toolResults: Map<string, unknown>;

  /** Add a tool result */
  addToolResult: (toolId: string, result: unknown) => void;

  /** Get a tool result */
  getToolResult: (toolId: string) => unknown | undefined;

  /** Clear tool results */
  clearToolResults: () => void;
}
```

#### 4. `apps/addin/src/components/chat/MessageBubble.tsx`

Display read tool results in the chat:

```typescript
// When a message has tool calls with results
{toolCall.status === 'executed' && !isWriteTool(toolCall.name) && (
  <ToolResultDisplay
    toolName={toolCall.name}
    result={getToolResult(toolCall.id)}
  />
)}
```

#### 5. Create `apps/addin/src/components/chat/ToolResultDisplay.tsx`

New component to display read tool results:

```typescript
interface ToolResultDisplayProps {
  toolName: string;
  result: unknown;
}

export function ToolResultDisplay({ toolName, result }: ToolResultDisplayProps) {
  // Render based on tool type
  switch (toolName) {
    case 'select_rows':
      return <DataTable data={result} />;
    case 'group_aggregate':
      return <AggregateResults data={result} />;
    case 'find_outliers':
      return <OutlierResults data={result} />;
    case 'get_profile':
      return <ProfileSummary data={result} />;
    case 'search_values':
      return <SearchResults data={result} />;
    default:
      return <JsonDisplay data={result} />;
  }
}
```

### Implementation Steps

1. **Add isReadTool helper** to `tools/index.ts`
2. **Add toolResults state** to `chatStore.ts`
3. **Update processToolCalls** in `ChatPane.tsx` to execute read tools
4. **Create ToolResultDisplay component** for showing results
5. **Update MessageBubble** to show read tool results
6. **Test with each read tool** (select_rows, group_aggregate, etc.)

## Validation Gates

### Build
- [ ] `pnpm build` passes with no errors
- [ ] `pnpm typecheck` passes

### Lint
- [ ] `pnpm lint` passes

### Manual Testing
- [ ] Ask AI to analyze data → AI calls select_rows → Data displayed
- [ ] Ask AI for aggregates → AI calls group_aggregate → Results displayed
- [ ] Ask for outliers → AI calls find_outliers → Outliers shown
- [ ] Search for value → AI calls search_values → Matches shown
- [ ] Get profile → AI calls get_profile → Profile summary shown

## Safety Considerations

- Read tools don't modify Excel data, so no preview/confirmation needed
- Large result sets should be paginated or truncated for display
- Errors should be displayed gracefully, not crash the UI

## Success Metrics

| Metric | Target |
|--------|--------|
| Read tool execution rate | 100% (no silent failures) |
| User sees results | Within 2 seconds of AI response |
| Error rate | <5% |

## Notes

### Out of Scope (See Separate PRP)
- Feeding tool results back to AI for multi-turn analysis
- This PRP focuses on executing read tools and displaying results

### Future Enhancement
- Consider caching read tool results to avoid re-fetching
- Add "copy to clipboard" for result data
- Add "insert into sheet" option for read results
