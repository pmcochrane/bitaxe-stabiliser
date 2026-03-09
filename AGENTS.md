# AGENTS.md

## Thinking

Plan changes and ask the user to confirm before implementing. Use a subagent to help plan if needed.

---

## Build, Lint, and Test Commands

Inform the user if the dev server needs restarting after changes to source files outside the React app.

---

## Code Style

- Small, single-responsibility functions
- Clear variable/function names
- Avoid premature abstraction
- Handle errors explicitly

**Formatting:** tabs, 80–120 char line limit, trailing commas, one blank line between top-level definitions.

**Imports (TS/JS):** built-ins → external libs → relative/absolute → type imports.

**Naming:** `camelCase` variables/functions, `PascalCase` classes/types/interfaces, `SCREAMING_SNAKE_CASE` constants, `kebab-case` utility files.

**TypeScript:** prefer `interface` over `type`, avoid `any`, strict null checks, prefer `const`, use `?.` and `??`.

**React:** functional components with hooks, co-locate styles and tests, custom hooks for reusable logic, typed props, components under 200 lines.

---

## Error Handling

```typescript
class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

async function fetchUser(id: string): Promise {
  try {
    return (await api.get(`/users/${id}`)).data;
  } catch (error) {
    if (error instanceof NotFoundError) throw new Error(`User not found: ${id}`);
    throw new Error('Failed to fetch user');
  }
}
```

---

## Testing

- AAA pattern (Arrange, Act, Assert)
- One assertion per test
- Descriptive names: `should_return_404_when_not_found`
- Mock external dependencies
- Don't test implementation details

---

## Environment

- Never commit secrets
- Use `.env.example` for required variables
- Validate config at startup

---

## Workflow

1. **Plan first** — write to `tasks/todo.md`, confirm before implementing
2. **Use subagents** for research, exploration, and parallel analysis
3. **Verify before done** — run tests, check logs, prove it works
4. **After corrections** — update `tasks/lessons.md` with the pattern
5. **Bug reports** — just fix them; no hand-holding needed
6. **Non-trivial changes** — ask "is there a more elegant solution?"

---

## Core Principles

- **Simplicity**: minimal code impact per change
- **No shortcuts**: find root causes, no temp fixes
- **Precision**: only touch what's necessary