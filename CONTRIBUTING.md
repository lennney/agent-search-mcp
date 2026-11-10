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

## Dependency compatibility

The published runtime supports Node.js >=18.17. Keep the Linux and Windows
Node 18/20/22 CI lanes when updating dependencies. The lint job uses Node 22;
its ESLint 10 toolchain is not part of the published runtime.

Keep Pino on 9.x, Undici on 6.x, and Vitest on 3.x while Node 18 remains
supported. Pino 10 pulls in `thread-stream` 4 (Node >=20), Undici 8 requires
Node >=22.19, and Vitest 5 requires Node >=22.12. A passing run on an
unsupported Node version is not a compatibility guarantee.

Vite 6 is an explicit development dependency because Vitest 3 also accepts
Vite 7, which drops Node 18. Dependabot holds major upgrades for these four
packages while continuing to propose compatible minor and patch updates.
Revisit the holds together with an intentional supported-Node policy change.

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
