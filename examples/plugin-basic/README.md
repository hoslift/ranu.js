# Ranu.js Plugin Architecture Example

This example demonstrates how to author and register custom framework plugins using the authoritative **Plugin API v1** (`definePlugin()`).

## Concepts Demonstrated

- **Authoring a plugin**: Use `definePlugin` from `ranu/plugin` with `apiVersion: 1`
- **Registering in configuration**: Add the plugin to the `plugins: [...]` array in `ranu.config.ts`
- **Lifecycle hooks**: Access framework lifecycle events, diagnostic loggers, and context during build and runtime

## Project Structure

```text
├── app/
│   ├── layout.tsx
│   └── page.tsx
├── plugins/
│   └── banner-plugin.ts   # Authoritative plugin implementation
├── package.json
├── ranu.config.ts         # Plugin registration
└── tsconfig.json
```

## Running the Example

```bash
pnpm dev
```
