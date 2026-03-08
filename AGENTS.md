# AGENTS.md

Guidelines for agentic coding agents operating in this repository.

---

## Thinking

- Please try and plan what will be changed and ask the user to proceed before implementing changes. Feel free to create a subagent to help with planning the change

## Build, Lint, and Test Commands

```bash
# Install dependencies
npm install          # Node.js
yarn install        # Yarn
pnpm install        # pnpm
cargo build         # Rust
composer install    # PHP

# Run development server
npm run dev         # Next.js/Vite
npm start           # Node.js production
cargo run           # Rust

# Build for production
npm run build
cargo build --release

# Linting
npm run lint               # ESLint
npm run lint:fix           # ESLint with auto-fix
cargo clippy               # Rust
rustfmt                    # Rust formatting

# Type checking
npm run typecheck          # TypeScript
tsc --noEmit               # TypeScript direct
cargo check                # Rust

# Running tests
npm test                   # Run all tests
npm test -- --watch        # Watch mode
npm test file.spec.ts      # Run specific file (Jest/Vitest)
cargo test                 # Rust
pytest                     # Python

# Running a single test
npm test -- -t "test name"             # Jest - match test name
npm test -- --testPathPattern="Name"   # Jest - match file
npx vitest run user.spec.ts            # Vitest - specific file
python -m pytest tests/test.py::func   # Python - specific function
```

- After any build, inform the user if the dev server needs restarted if any source file outwith the react app is changed.

---

## Code Style Guidelines

### General Principles

- Keep functions small and focused (single responsibility)
- Write self-documenting code with clear variable/function names
- Avoid premature abstraction - refactor when patterns emerge
- Handle errors explicitly, never silently

### Formatting

- Use tab indentation consistently (check existing files)
- Maximum line length: 80-120 characters
- Add trailing commas in multi-line arrays/objects
- One blank line between top-level definitions

### Imports (TypeScript/JavaScript)

```typescript
// 1. Built-in/node modules
import fs from 'node:fs';

// 2. External libraries
import express from 'express';
import { z } from 'zod';

// 3. Relative imports (absolute paths preferred)
import { UserService } from '@/services/user.service';

// 4. Type imports
import type { User } from '@/types';
```

### Naming Conventions

```typescript
// Variables/functions: camelCase
const userName = 'john';
function getUserById(id: string) {}

// Classes/types/interfaces/enums: PascalCase
class UserService {}
interface UserConfig {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRY_COUNT = 3;

// Files: kebab-case (utilities) | PascalCase (classes)
```

### TypeScript/JavaScript

- Prefer `interface` over `type` for object shapes
- Use strict typing - avoid `any`, use `unknown` when uncertain
- Enable strict null checks
- Prefer `const` over `let`
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### Error Handling

```typescript
// Custom error classes
class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Handle errors explicitly
async function fetchUser(id: string): Promise<User> {
  try {
    return (await api.get(`/users/${id}`)).data;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new Error(`User not found: ${id}`);
    }
    throw new Error('Failed to fetch user');
  }
}
```

### React Guidelines


- Use functional components with hooks
- Co-locate components with styles and tests
- Extract custom hooks for reusable logic
- Define TypeScript interfaces for props
- Keep components under 200 lines

---

## Testing Guidelines

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a user with valid data', async () => {
      // Arrange
      const userData = { name: 'John', email: 'john@example.com' };
      // Act
      const user = await userService.createUser(userData);
      // Assert
      expect(user.id).toBeDefined();
      expect(user.name).toBe('John');
    });
  });
});
```

- Follow AAA pattern (Arrange, Act, Assert)
- Test one thing per test case
- Use descriptive names: `should_return_404_when_not_found`
- Mock external dependencies
- Don't test implementation details

---

## Environment and Configuration

- Never commit secrets to version control
- Use `.env.example` for required variables
- Validate required config at startup

---

## Additional Resources

- See README.md for project-specific setup
- Check package.json for available scripts

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.