# Primer Command

Load and understand the Cellix project context quickly.

## Purpose

Initialize your understanding of the Cellix project by reading key context files and understanding the current state.

## Steps

### 1. Read Core Context Files

Read the following files in order:
1. `CLAUDE.md` - Primary context and rules
2. `FEATURE_PLAN.md` - Detailed feature specifications
3. `package.json` (if exists) - Dependencies and scripts

### 2. Understand Project Structure

Run a tree command to see the current directory structure:
```bash
tree /F /A C:\ZANDIT\Cellix
```

Or if tree is unavailable:
```bash
dir /S /B C:\ZANDIT\Cellix
```

### 3. Check Current Phase

Determine which development phase the project is in:
- Look for existing `apps/` directory structure
- Check if `pnpm-workspace.yaml` exists
- Look for any existing code in `apps/addin/` or `apps/backend/`

### 4. Review Recent Changes (if git initialized)

```bash
git log --oneline -10
git status
```

### 5. Check for Active PRPs

Look in `PRPs/` directory for any in-progress feature plans:
```bash
dir C:\ZANDIT\Cellix\PRPs
```

## Output

After completing the steps, provide a summary:

1. **Project State:** (Pre-Phase 1 / Phase X in progress / etc.)
2. **Key Technologies:** List the main tech stack components found
3. **Current Focus:** What appears to be the current work area
4. **Active PRPs:** Any feature plans in progress
5. **Ready for:** What tasks the project is ready for next

## Example Output

```
# Cellix Project Context Loaded

## Project State
Pre-Phase 1 - Foundation not yet started

## Tech Stack
- Frontend: React 18 + TypeScript + Vite + Office.js
- Backend: Fastify + Node.js 20
- Database: Supabase (pgvector)
- AI: OpenAI / Azure OpenAI

## Current Focus
Project setup and scaffolding

## Active PRPs
None found

## Ready For
- Initialize monorepo with pnpm workspaces
- Setup add-in project scaffold
- Configure Supabase project
```
