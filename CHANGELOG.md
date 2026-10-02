# Changelog

All notable changes to Ranu.js will be documented in this file.

The format follows [Semantic Versioning](https://semver.org/) and changes are managed using [Changesets](https://github.com/changesets/changesets).

## 0.1.2 (Public Alpha)

### Core Improvements & Bundle Packaging

- Self-contained bundle packaging for `@hoslift/ranu` and `@hoslift/adapter-vercel`, bundling internal workspace packages into distribution artifacts.
- Added executable shebangs (`#!/usr/bin/env node`) to `create-ranu` and `ranu` CLI entrypoints.
- Synchronized all workspace dependencies and resolved Vercel adapter dependencies.

## 0.1.1 (Public Alpha)

### Organization & Security Updates

- Migrated package namespace to the official `@hoslift` organization (`@hoslift/ranu`, `@hoslift/create-ranu`, `@hoslift/adapter-vercel`).
- Security hardening: resolved polynomial ReDoS in route output path generation (Alert #3).
- Bumped TypeScript to 5.9.3 and updated development dependencies.

## 0.1.0 (Public Alpha)

### Initial Release

- Initial Public Alpha release of the Ranu.js full-stack framework (`ranu`), project scaffolding CLI (`create-ranu`), and Vercel deployment adapter (`@ranu/adapter-vercel`).
- Full-stack capabilities: file-based routing, React 19 SSR streaming, SSG, client hydration, API routes, middleware, CSS modules, plugin system, container & Vercel deployment.
- Hardened security baseline: polynomial ReDoS protection, route parameter sanitization, secret separation, and zero information leakage.
