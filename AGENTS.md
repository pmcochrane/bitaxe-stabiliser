# AGENTS.md

Guidelines for agentic coding agents operating in this repository.

---

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

---

## Code Style Guidelines

### General Principles

- Keep functions small and focused (single responsibility)
- Write self-documenting code with clear variable/function names
- Avoid premature abstraction - refactor when patterns emerge
- Handle errors explicitly, never silently

### Formatting

- Use 2 or 4 space indentation consistently (check existing files)
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
