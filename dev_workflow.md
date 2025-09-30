# Development Workflow Guide

## Formatting Requirements

This project uses `dprint` to maintain consistent code formatting across all files. Before committing or pushing your changes, make sure to format your code.

### Manual Formatting

Run the following command to format all files in the project:

```bash
npx dprint fmt
```

Run the following command to check if all files are properly formatted:

```bash
npx dprint check
```

### Git Hooks (Automated Formatting)

To prevent formatting issues from occurring in the first place, this project uses `pre-commit` and `pre-push` hooks that will run automatically:

1. `pre-commit` hook: Runs checks before each commit
2. `pre-push` hook: Runs checks before each push

These hooks will automatically check formatting and prevent commits/pushes that include unformatted files.

#### Installing Git Hooks

If the hooks aren't already installed in your environment, run:

```bash
pip install pre-commit
pre-commit install
pre-commit install --hook-type pre-push
```

#### Running Hooks Manually

To run pre-commit hooks manually (useful for testing):

```bash
pre-commit run --all-files
```

## Development Best Practices

1. Always run `npx dprint fmt` before committing your changes
2. Install and use the pre-commit hooks to automate formatting checks
3. Run `npm run build` and tests before pushing to ensure your changes don't break the build
4. Check the `.pre-commit-config.yaml` file for other automated checks that run during commit/push

## Troubleshooting

If you encounter issues with pre-commit hooks:

1. Make sure you have Node.js and npm installed
2. Install pre-commit: `pip install pre-commit`
3. Run `pre-commit install` to install the hooks
4. If hooks are failing, you can temporarily skip them with `git commit --no-verify`, but fix the underlying issue as soon as possible

Following these practices will ensure code consistency and prevent formatting-related issues during the development process.
