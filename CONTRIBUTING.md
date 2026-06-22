# Contributing to Agent Search MCP

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/my-feature`
5. Make your changes
6. Run tests: `npm test`
7. Commit: `git commit -m "feat: add my feature"`
8. Push: `git push origin feature/my-feature`
9. Open a Pull Request

## Development

```bash
# Build
npm run build

# Test
npm test

# Watch mode
npm run test:watch
```

## Code Style

- TypeScript strict mode
- ESLint + Prettier
- Follow existing patterns

## Adding a New Engine

1. Create `src/engines/my-engine.ts`
2. Implement `SearchProvider` interface
3. Register in `src/engines/index.ts`
4. Add tests in `tests/engines.test.ts`

## Reporting Issues

- Use GitHub Issues
- Include reproduction steps
- Include Node.js version

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
