# Commit Command

Create atomic, well-formatted git commits.

## Purpose

Create a properly formatted commit with conventional commit message style.

## Process

### Step 1: Gather Information

Run these commands to understand the changes:

```bash
git status
git diff HEAD
git status --porcelain
```

### Step 2: Analyze Changes

Review the diff and identify:
- What files were changed
- What was the purpose of the changes
- Which category the changes fall into

### Step 3: Determine Commit Type

Use conventional commit types:

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes nor adds |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `chore` | Build process, dependencies, tooling |
| `ci` | CI/CD configuration |

### Step 4: Write Commit Message

Format:
```
type(scope): short description

Longer description if needed.
- Bullet points for multiple changes
- Keep lines under 72 characters

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

**Scope examples for Cellix:**
- `addin` - Add-in frontend changes
- `backend` - Backend API changes
- `excel` - Excel/Office.js helpers
- `tools` - AI tool definitions
- `rag` - RAG/embeddings
- `auth` - Authentication
- `db` - Database/Supabase
- `deps` - Dependencies

### Step 5: Stage and Commit

```bash
git add <files>
git commit -m "$(cat <<'EOF'
type(scope): description

Details here.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

### Step 6: Verify

```bash
git status
git log -1
```

## Examples

### Feature Commit
```bash
git commit -m "$(cat <<'EOF'
feat(excel): add range read helpers

Implement Office.js helpers for reading Excel ranges:
- getSelectedRangeValues()
- getSelectedRangeAddress()
- getUsedRangeSample()

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

### Bug Fix Commit
```bash
git commit -m "$(cat <<'EOF'
fix(tools): validate address format before execution

Add A1 notation validation to prevent invalid range errors.
Fixes issue where malformed addresses caused silent failures.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

### Chore Commit
```bash
git commit -m "$(cat <<'EOF'
chore(deps): update office-addin-dev dependencies

Update to latest office-addin-dev tooling for
improved debugging support.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

## Rules

1. **Atomic commits** - One logical change per commit
2. **Present tense** - "add feature" not "added feature"
3. **No period** at end of subject line
4. **Subject line** max 50 characters
5. **Body** wrapped at 72 characters
6. **Always include** Co-Authored-By line
7. **Never commit** credentials, .env files, or secrets
