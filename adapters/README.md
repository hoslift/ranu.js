# Ranu.js Deployment Adapters

Official deployment adapters for deploying Ranu.js applications to cloud platforms and servers.

---

## 📦 Installation

### From the Command Line (npm):
```bash
# Install individual adapter from npmjs.com
npm install @ranujs/adapter-node

# Or install the grouped adapter suite from GitHub Packages
npm install @hoslift/adapters --registry=https://npm.pkg.github.com
```

### Via package.json:
```json
{
  "dependencies": {
    "@hoslift/adapters": "^0.4.0"
  }
}
```

---

## Supported Platforms

- **Node.js** (`@ranujs/adapter-node`): Standalone Node.js server.
- **Vercel** (`@ranujs/adapter-vercel`): Vercel Serverless and Edge Functions.
- **Cloudflare** (`@ranujs/adapter-cloudflare`): Cloudflare Workers & Pages.
- **Netlify** (`@ranujs/adapter-netlify`): Netlify Serverless Functions.
- **Bun** (`@ranujs/adapter-bun`): High-speed Bun native HTTP server.
- **Deno** (`@ranujs/adapter-deno`): Deno runtime and Deno Deploy.
- **Static** (`@ranujs/adapter-static`): Static HTML export (SSG).

---

## Documentation

Full deployment guides: [https://github.com/hoslift/ranu.js](https://github.com/hoslift/ranu.js)
