# Contributing to ParikshaSuraksha

Thank you for your interest in contributing to ParikshaSuraksha.

## How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/your-feature`)
3. **Commit** your changes (`git commit -m 'Add your feature'`)
4. **Push** to the branch (`git push origin feature/your-feature`)
5. **Open** a Pull Request

## Development Setup

```bash
git clone https://github.com/divyamohan1993/pariksha-suraksha.git
cd pariksha-suraksha
npm install express
node mvp-server.js          # API on :3000
cd packages/candidate-portal && npm install && npx next dev -p 3011  # Portal on :3011
cd packages/admin-dashboard && npm install && npx next dev -p 3010   # Admin on :3010
```

## Guidelines

- Follow existing code style
- Test your changes before submitting
- Keep PRs focused — one feature per PR
- Update documentation if you change APIs

## Areas for Contribution

- Question bank expansion (more subjects, more parameterized templates)
- Accessibility improvements (RPwD Act 2016 compliance)
- Language support (Hindi, regional languages)
- Performance optimization
- Security hardening
- Test coverage

## Reporting Issues

Use [GitHub Issues](https://github.com/divyamohan1993/pariksha-suraksha/issues) with a clear description, steps to reproduce, and expected behavior.

## Code of Conduct

Be respectful. Be constructive. Focus on the work.
