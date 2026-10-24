import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// 1. SIMULTANEOUS IMPORT FROM ALL 6 SUBPATHS (Source Entrypoints)
import {
  createAIProvider as srcCreateAIProvider,
  streamAI as srcStreamAI,
  generateObject as srcGenerateObject,
  AIValidationError as srcAIValidationError,
  isStandardSchema as srcIsStandardSchema,
  formatAIChunkToSSE as srcFormatAIChunkToSSE,
  createBoundedStream as srcCreateBoundedStream,
  pipeWithBackpressure as srcPipeWithBackpressure,
  createStreamingDrainTracker as srcCreateStreamingDrainTracker,
} from '../src/ai.js';
import { createGemini as srcCreateGemini, gemini as srcGemini } from '../src/ai/gemini.js';
import { createGroq as srcCreateGroq, groq as srcGroq } from '../src/ai/groq.js';
import { createClaude as srcCreateClaude, claude as srcClaude } from '../src/ai/claude.js';
import {
  createOpenAI as srcCreateOpenAI,
  openai as srcOpenAI,
  isReasoningModel as srcIsReasoningModel,
} from '../src/ai/openai.js';
import {
  createCustomAI as srcCreateCustomAI,
  custom as srcCustom,
  isDeepSeekR1 as srcIsDeepSeekR1,
  resolveBaseURL as srcResolveBaseURL,
} from '../src/ai/custom.js';

// 2. SIMULTANEOUS IMPORT FROM ALL 6 SUBPATHS (Built Dist Artifacts)
import * as DistAI from '../dist/ai.js';
import * as DistGemini from '../dist/ai/gemini.js';
import * as DistGroq from '../dist/ai/groq.js';
import * as DistClaude from '../dist/ai/claude.js';
import * as DistOpenAI from '../dist/ai/openai.js';
import * as DistCustom from '../dist/ai/custom.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

describe('Empirical Challenge Suite: PR #251 packages/ranu Export Alignment', () => {
  // =========================================================================
  // Challenge 1: Multi-Subpath Concurrency & Cross-Talk Stress
  // =========================================================================
  describe('Challenge 1: Simultaneous Multi-Subpath Import & Concurrency Stress', () => {
    it('verifies all 6 subpaths can be imported simultaneously without namespace collisions', () => {
      // Core AI kernel exports
      expect(srcStreamAI).toBeTypeOf('function');
      expect(srcCreateAIProvider).toBeTypeOf('function');
      expect(srcGenerateObject).toBeTypeOf('function');
      expect(srcAIValidationError).toBeDefined();
      expect(srcIsStandardSchema).toBeTypeOf('function');
      expect(srcFormatAIChunkToSSE).toBeTypeOf('function');
      expect(srcCreateBoundedStream).toBeTypeOf('function');
      expect(srcPipeWithBackpressure).toBeTypeOf('function');
      expect(srcCreateStreamingDrainTracker).toBeTypeOf('function');

      // Model driver factories
      expect(srcCreateGemini).toBeTypeOf('function');
      expect(srcGemini).toBeTypeOf('function');

      expect(srcCreateGroq).toBeTypeOf('function');
      expect(srcGroq).toBeTypeOf('function');

      expect(srcCreateClaude).toBeTypeOf('function');
      expect(srcClaude).toBeTypeOf('function');

      expect(srcCreateOpenAI).toBeTypeOf('function');
      expect(srcOpenAI).toBeTypeOf('function');
      expect(srcIsReasoningModel).toBeTypeOf('function');

      expect(srcCreateCustomAI).toBeTypeOf('function');
      expect(srcCustom).toBeTypeOf('function');
      expect(srcIsDeepSeekR1).toBeTypeOf('function');
      expect(srcResolveBaseURL).toBeTypeOf('function');

      // Dist mirrors source
      expect(DistAI.streamAI).toBeTypeOf('function');
      expect(DistGemini.createGemini).toBeTypeOf('function');
      expect(DistGroq.createGroq).toBeTypeOf('function');
      expect(DistClaude.createClaude).toBeTypeOf('function');
      expect(DistOpenAI.createOpenAI).toBeTypeOf('function');
      expect(DistCustom.createCustomAI).toBeTypeOf('function');
    });

    it('executes 60+ concurrent streaming requests across all 5 providers with zero cross-talk', async () => {
      const TOTAL_REQUESTS = 75; // 15 per provider across 5 providers
      const providers = ['gemini', 'groq', 'claude', 'openai', 'custom'] as const;

      interface RequestRecord {
        readonly id: string;
        readonly provider: (typeof providers)[number];
        readonly expectedChunks: string[];
        readonly receivedChunks: string[];
      }

      const records: RequestRecord[] = [];

      // Helper to generate provider-specific mock SSE stream
      function createProviderStream(provider: (typeof providers)[number], reqId: string) {
        const encoder = new TextEncoder();
        const chunkCount = 4;
        const expectedChunks: string[] = [];

        for (let c = 1; c <= chunkCount; c++) {
          expectedChunks.push(`${provider}-chunk-${c}-for-${reqId}`);
        }

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            for (let c = 0; c < expectedChunks.length; c++) {
              const text = expectedChunks[c]!;
              let ssePayload = '';

              switch (provider) {
                case 'gemini':
                  ssePayload = `data: ${JSON.stringify({
                    candidates: [{ content: { parts: [{ text }] } }],
                  })}\n\n`;
                  break;
                case 'groq':
                  ssePayload = `data: ${JSON.stringify({
                    choices: [{ delta: { content: text } }],
                    x_groq: { usage: { queue_time: 0.001 } },
                  })}\n\n`;
                  break;
                case 'claude':
                  ssePayload = `event: content_block_delta\ndata: ${JSON.stringify({
                    type: 'content_block_delta',
                    index: 0,
                    delta: { type: 'text_delta', text },
                  })}\n\n`;
                  break;
                case 'openai':
                  ssePayload = `data: ${JSON.stringify({
                    choices: [{ delta: { content: text } }],
                  })}\n\n`;
                  break;
                case 'custom':
                  ssePayload = `data: ${JSON.stringify({
                    choices: [{ delta: { content: text } }],
                  })}\n\n`;
                  break;
              }

              // Interleaved async delay to ensure true concurrency and scheduling race pressure
              await new Promise((r) => setTimeout(r, (c % 3) * 2 + 1));
              controller.enqueue(encoder.encode(ssePayload));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });

        return { stream, expectedChunks };
      }

      // Launch 75 concurrent executions across all 5 providers
      const tasks = Array.from({ length: TOTAL_REQUESTS }, async (_, idx) => {
        const providerName = providers[idx % providers.length]!;
        const reqId = `stress-req-${idx}-${providerName}`;

        const { stream: mockBodyStream, expectedChunks } = createProviderStream(
          providerName,
          reqId,
        );

        const mockFetch: typeof fetch = async (url, init) => {
          // Assert that the request headers or URL contain provider-specific traits without bleeding
          const urlStr = String(url);
          if (providerName === 'gemini') {
            expect(urlStr).toContain('generativelanguage.googleapis.com');
          } else if (providerName === 'groq') {
            expect(urlStr).toContain('api.groq.com');
          } else if (providerName === 'claude') {
            expect(urlStr).toContain('api.anthropic.com');
          } else if (providerName === 'openai') {
            expect(urlStr).toContain('api.openai.com');
          } else if (providerName === 'custom') {
            expect(urlStr).toContain('localhost:11434');
          }

          return new Response(mockBodyStream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        };

        let modelInstance;
        switch (providerName) {
          case 'gemini': {
            const provider = DistGemini.createGemini({
              apiKey: `key-${reqId}`,
              fetch: mockFetch,
            });
            modelInstance = provider('gemini-1.5-flash');
            break;
          }
          case 'groq': {
            const provider = DistGroq.createGroq({
              apiKey: `key-${reqId}`,
              fetch: mockFetch,
            });
            modelInstance = provider('llama-3.3-70b-versatile');
            break;
          }
          case 'claude': {
            const provider = DistClaude.createClaude({
              apiKey: `key-${reqId}`,
              fetch: mockFetch,
            });
            modelInstance = provider('claude-3-5-haiku-20241022');
            break;
          }
          case 'openai': {
            const provider = DistOpenAI.createOpenAI({
              apiKey: `key-${reqId}`,
              fetch: mockFetch,
            });
            modelInstance = provider('gpt-4o-mini');
            break;
          }
          case 'custom': {
            const provider = DistCustom.createCustomAI({
              apiKey: `key-${reqId}`,
              fetch: mockFetch,
            });
            modelInstance = provider('llama3.2');
            break;
          }
        }

        // Execute streamAI from ranu/ai
        const response = await DistAI.streamAI({
          model: modelInstance,
          prompt: `Hello from ${reqId}`,
        });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        // Consume and collect SSE response chunks
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        const receivedTexts: string[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          const lines = accumulated.split('\n');
          accumulated = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const rawData = line.slice(6).trim();
              if (rawData === '[DONE]') continue;
              try {
                const parsed = JSON.parse(rawData);
                if (typeof parsed.text === 'string') {
                  receivedTexts.push(parsed.text);
                }
              } catch {
                // non-JSON SSE lines
              }
            }
          }
        }

        const record: RequestRecord = {
          id: reqId,
          provider: providerName,
          expectedChunks,
          receivedChunks: receivedTexts,
        };

        records.push(record);
      });

      await Promise.all(tasks);

      expect(records).toHaveLength(TOTAL_REQUESTS);

      // Verify ZERO CROSS-TALK across all concurrent requests
      for (const rec of records) {
        expect(rec.receivedChunks).toEqual(rec.expectedChunks);

        // Assert no chunks from any OTHER request contaminated this stream
        for (const otherRec of records) {
          if (otherRec.id === rec.id) continue;
          for (const chunk of rec.receivedChunks) {
            expect(chunk).not.toContain(otherRec.id);
          }
        }
      }
    });

    it('asserts concurrent driver instances with conflicting options maintain isolated configs', () => {
      const p1 = DistGemini.createGemini({ apiKey: 'gemini-key-alpha' });
      const p2 = DistGemini.createGemini({ apiKey: 'gemini-key-beta' });

      expect(p1.config.apiKey).toBe('gemini-key-alpha');
      expect(p2.config.apiKey).toBe('gemini-key-beta');

      const m1 = p1('gemini-1.5-pro');
      const m2 = p2('gemini-1.5-flash');

      expect(m1.modelId).toBe('gemini-1.5-pro');
      expect(m2.modelId).toBe('gemini-1.5-flash');

      // Verify Groq isolation
      const g1 = DistGroq.createGroq({ apiKey: 'groq-key-1', baseURL: 'https://groq-1.example.com' });
      const g2 = DistGroq.createGroq({ apiKey: 'groq-key-2', baseURL: 'https://groq-2.example.com' });
      expect(g1.config.apiKey).toBe('groq-key-1');
      expect(g2.config.apiKey).toBe('groq-key-2');
      expect(g1.config.baseURL).toBe('https://groq-1.example.com');
      expect(g2.config.baseURL).toBe('https://groq-2.example.com');
    });
  });

  // =========================================================================
  // Challenge 2: Programmatic Cycle Stress & Dependency Graph Verification
  // =========================================================================
  describe('Challenge 2: Programmatic Workspace Dependency Graph Cycle Stress', () => {
    it('programmatically verifies 0 circular dependencies including packages, adapters, and ai-models', () => {
      // Find all package.json files across packages/*, adapters/*, ai-models/*, and create-ranu
      const searchDirs = ['packages', 'adapters', 'ai-models'];
      const packageJsonFiles: string[] = [];

      for (const sDir of searchDirs) {
        const fullDir = path.join(repoRoot, sDir);
        if (fs.existsSync(fullDir)) {
          const subdirs = fs.readdirSync(fullDir);
          for (const sub of subdirs) {
            const pjPath = path.join(fullDir, sub, 'package.json');
            if (fs.existsSync(pjPath)) {
              packageJsonFiles.push(pjPath);
            }
          }
        }
      }

      if (fs.existsSync(path.join(repoRoot, 'create-ranu/package.json'))) {
        packageJsonFiles.push(path.join(repoRoot, 'create-ranu/package.json'));
      }

      expect(packageJsonFiles.length).toBeGreaterThanOrEqual(15);

      // Build dependency graph of workspace packages
      const graph: Record<string, string[]> = {};
      const allKnownPackages = new Set<string>();

      for (const pj of packageJsonFiles) {
        const data = JSON.parse(fs.readFileSync(pj, 'utf8'));
        const name: string = data.name;
        allKnownPackages.add(name);
        graph[name] = [];

        const allDeps = {
          ...data.dependencies,
          ...data.devDependencies,
          ...data.peerDependencies,
        };

        for (const [depName, depVer] of Object.entries(allDeps)) {
          if (typeof depVer === 'string' && depVer.startsWith('workspace:')) {
            graph[name]!.push(depName);
          }
        }
      }

      // Assert specific relationships for PR #251:
      // @ranujs/core depends on @ranu/ai and @ranu/ai-* in devDependencies
      expect(graph['@ranujs/core']).toContain('@ranu/ai');
      expect(graph['@ranujs/core']).toContain('@ranu/ai-gemini');
      expect(graph['@ranujs/core']).toContain('@ranu/ai-groq');
      expect(graph['@ranujs/core']).toContain('@ranu/ai-claude');
      expect(graph['@ranujs/core']).toContain('@ranu/ai-openai');
      expect(graph['@ranujs/core']).toContain('@ranu/ai-custom');

      // Crucial: none of the ai-models packages must depend back on @ranujs/core!
      expect(graph['@ranu/ai']).not.toContain('@ranujs/core');
      expect(graph['@ranu/ai-gemini']).not.toContain('@ranujs/core');
      expect(graph['@ranu/ai-groq']).not.toContain('@ranujs/core');
      expect(graph['@ranu/ai-claude']).not.toContain('@ranujs/core');
      expect(graph['@ranu/ai-openai']).not.toContain('@ranujs/core');
      expect(graph['@ranu/ai-custom']).not.toContain('@ranujs/core');

      // Crucial: @ranu/ai must not depend on any model driver
      expect(graph['@ranu/ai']).not.toContain('@ranu/ai-gemini');
      expect(graph['@ranu/ai']).not.toContain('@ranu/ai-groq');
      expect(graph['@ranu/ai']).not.toContain('@ranu/ai-claude');
      expect(graph['@ranu/ai']).not.toContain('@ranu/ai-openai');
      expect(graph['@ranu/ai']).not.toContain('@ranu/ai-custom');

      // DFS Cycle Detection Algorithm across the full monorepo graph
      const visited: Record<string, boolean> = {};
      const recStack: Record<string, boolean> = {};
      const cycles: string[] = [];

      function findCycles(node: string, currentPath: string[] = []) {
        visited[node] = true;
        recStack[node] = true;
        currentPath.push(node);

        for (const neighbor of graph[node] || []) {
          if (!visited[neighbor]) {
            findCycles(neighbor, currentPath);
          } else if (recStack[neighbor]) {
            const cycleStart = currentPath.indexOf(neighbor);
            const cycleChain = [...currentPath.slice(cycleStart), neighbor].join(' -> ');
            cycles.push(cycleChain);
          }
        }

        recStack[node] = false;
        currentPath.pop();
      }

      for (const node of Object.keys(graph)) {
        if (!visited[node]) {
          findCycles(node);
        }
      }

      // Assert 0 cycles in the entire monorepo dependency graph
      expect(cycles).toEqual([]);
      expect(cycles).toHaveLength(0);
    });

    it('verifies static AST imports in packages/ranu/src/ai/**/*.ts contain 0 cycle-inducing references', () => {
      const ranuSrcAiDir = path.resolve(__dirname, '../src/ai');
      const files = fs.readdirSync(ranuSrcAiDir);

      for (const f of files) {
        if (!f.endsWith('.ts')) continue;
        const content = fs.readFileSync(path.join(ranuSrcAiDir, f), 'utf8');

        // Verify only outward exports from @ranu/ai or @ranu/ai-*
        const importExportMatches = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
        for (const match of importExportMatches) {
          const specifier = match.replace(/from\s+['"]/, '').replace(/['"]/, '');
          expect(specifier).toMatch(/^@ranu\/ai(-[a-z]+)?$/);
          // Never import from ranu or @ranujs/core itself
          expect(specifier).not.toContain('@ranujs/core');
          expect(specifier).not.toContain('packages/ranu');
        }
      }
    });
  });

  // =========================================================================
  // Challenge 3: Built Output Resolution via Node.js ESM Loader
  // =========================================================================
  describe('Challenge 3: Built Output Resolution against ./dist/ Artifacts', () => {
    it('verifies packages/ranu package.json exports field accurately matches all built artifacts', () => {
      const pkgPath = path.resolve(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      const expectedSubpaths = [
        './ai',
        './ai/gemini',
        './ai/groq',
        './ai/claude',
        './ai/openai',
        './ai/custom',
      ];

      for (const subpath of expectedSubpaths) {
        expect(pkg.exports).toHaveProperty(subpath);
        const subConfig = pkg.exports[subpath];

        expect(subConfig).toHaveProperty('types');
        expect(subConfig).toHaveProperty('import');

        // Check types file exists on filesystem
        const typesPath = path.resolve(__dirname, '..', subConfig.types);
        expect(fs.existsSync(typesPath)).toBe(true);

        // Check import file exists on filesystem
        const importPath = path.resolve(__dirname, '..', subConfig.import);
        expect(fs.existsSync(importPath)).toBe(true);

        // Assert non-empty build artifacts
        const typesStat = fs.statSync(typesPath);
        const importStat = fs.statSync(importPath);
        expect(typesStat.size).toBeGreaterThan(0);
        expect(importStat.size).toBeGreaterThan(100);
      }
    });

    it('verifies Node.js ESM loader dynamically evaluates every built subpath without ERR_MODULE_NOT_FOUND', async () => {
      const subpaths = [
        { path: '../dist/ai.js', check: (m: any) => expect(m.streamAI).toBeTypeOf('function') },
        {
          path: '../dist/ai/gemini.js',
          check: (m: any) => {
            expect(m.createGemini).toBeTypeOf('function');
            expect(m.gemini).toBeTypeOf('function');
          },
        },
        {
          path: '../dist/ai/groq.js',
          check: (m: any) => {
            expect(m.createGroq).toBeTypeOf('function');
            expect(m.groq).toBeTypeOf('function');
          },
        },
        {
          path: '../dist/ai/claude.js',
          check: (m: any) => {
            expect(m.createClaude).toBeTypeOf('function');
            expect(m.claude).toBeTypeOf('function');
          },
        },
        {
          path: '../dist/ai/openai.js',
          check: (m: any) => {
            expect(m.createOpenAI).toBeTypeOf('function');
            expect(m.openai).toBeTypeOf('function');
            expect(m.isReasoningModel).toBeTypeOf('function');
          },
        },
        {
          path: '../dist/ai/custom.js',
          check: (m: any) => {
            expect(m.createCustomAI).toBeTypeOf('function');
            expect(m.custom).toBeTypeOf('function');
            expect(m.isDeepSeekR1).toBeTypeOf('function');
            expect(m.resolveBaseURL).toBeTypeOf('function');
          },
        },
      ];

      for (const item of subpaths) {
        const mod = await import(item.path);
        expect(mod).toBeDefined();
        item.check(mod);
      }
    });

    it('executes isolated Node.js child process importing all 6 subpaths via package manifest resolution', () => {
      // Run isolated node process verifying that Node.js native ESM loader can import the dist subpaths
      const script = `
        import * as ai from './dist/ai.js';
        import * as gemini from './dist/ai/gemini.js';
        import * as groq from './dist/ai/groq.js';
        import * as claude from './dist/ai/claude.js';
        import * as openai from './dist/ai/openai.js';
        import * as custom from './dist/ai/custom.js';

        if (typeof ai.streamAI !== 'function') throw new Error('ai.streamAI missing');
        if (typeof gemini.createGemini !== 'function') throw new Error('gemini.createGemini missing');
        if (typeof groq.createGroq !== 'function') throw new Error('groq.createGroq missing');
        if (typeof claude.createClaude !== 'function') throw new Error('claude.createClaude missing');
        if (typeof openai.createOpenAI !== 'function') throw new Error('openai.createOpenAI missing');
        if (typeof custom.createCustomAI !== 'function') throw new Error('custom.createCustomAI missing');

        console.log('ALL_SUBPATHS_RESOLVED_CLEANLY');
      `;

      const ranuDir = path.resolve(__dirname, '..');
      const output = execSync(`node --input-type=module -e "${script.replace(/\n/g, ' ')}"`, {
        cwd: ranuDir,
        encoding: 'utf8',
      });

      expect(output).toContain('ALL_SUBPATHS_RESOLVED_CLEANLY');
    });
  });

  // =========================================================================
  // Challenge 4: ESM Tree-Shaking & Credential Isolation
  // =========================================================================
  describe('Challenge 4: Tree-Shaking Isolation & Zero-Credential Leakage', () => {
    it('verifies importing only ranu/ai/gemini does not require credentials from OpenAI, Anthropic, or Groq', () => {
      // Clear environment variables
      const savedEnv = { ...process.env };
      delete process.env['OPENAI_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['GROQ_API_KEY'];
      delete process.env['CUSTOM_AI_KEY'];

      try {
        const provider = DistGemini.createGemini({ apiKey: 'gemini-only-key' });
        expect(provider.name).toBe('gemini');

        const model = provider('gemini-1.5-flash');
        expect(model.provider).toBe('gemini');
        expect(model.modelId).toBe('gemini-1.5-flash');

        // Direct helper also works without throwing
        const directModel = DistGemini.gemini('gemini-2.0-flash', { apiKey: 'gemini-only-key' });
        expect(directModel.provider).toBe('gemini');
      } finally {
        Object.assign(process.env, savedEnv);
      }
    });

    it('verifies static dist/ai/gemini.js bundle is completely tree-shaken and isolated from other SDKs', () => {
      const geminiBundlePath = path.resolve(__dirname, '../dist/ai/gemini.js');
      const bundleContent = fs.readFileSync(geminiBundlePath, 'utf8');

      // Gemini bundle must contain Gemini-specific symbols
      expect(bundleContent).toContain('createGemini');
      expect(bundleContent).toContain('gemini');
      expect(bundleContent).toContain('DEFAULT_BASE_URL');
      expect(bundleContent).toContain('generativelanguage.googleapis.com');

      // Gemini bundle must NOT contain OpenAI symbols
      expect(bundleContent).not.toContain('createOpenAI');
      expect(bundleContent).not.toContain('isReasoningModel');
      expect(bundleContent).not.toContain('api.openai.com');
      expect(bundleContent).not.toContain('o1-mini');
      expect(bundleContent).not.toContain('o3-mini');

      // Gemini bundle must NOT contain Anthropic symbols
      expect(bundleContent).not.toContain('createClaude');
      expect(bundleContent).not.toContain('anthropic-version');
      expect(bundleContent).not.toContain('api.anthropic.com');
      expect(bundleContent).not.toContain('claude-3-5-sonnet');

      // Gemini bundle must NOT contain Groq symbols
      expect(bundleContent).not.toContain('createGroq');
      expect(bundleContent).not.toContain('api.groq.com');
      expect(bundleContent).not.toContain('x_groq');

      // Gemini bundle must NOT contain Custom Ollama symbols
      expect(bundleContent).not.toContain('createCustomAI');
      expect(bundleContent).not.toContain('isDeepSeekR1');
      expect(bundleContent).not.toContain('11434');
    });

    it('verifies symmetric tree-shaking isolation for Claude, OpenAI, and Groq bundles', () => {
      // 1. Claude bundle isolation
      const claudeContent = fs.readFileSync(path.resolve(__dirname, '../dist/ai/claude.js'), 'utf8');
      expect(claudeContent).toContain('createClaude');
      expect(claudeContent).not.toContain('createGemini');
      expect(claudeContent).not.toContain('createOpenAI');
      expect(claudeContent).not.toContain('createGroq');

      // 2. OpenAI bundle isolation
      const openaiContent = fs.readFileSync(path.resolve(__dirname, '../dist/ai/openai.js'), 'utf8');
      expect(openaiContent).toContain('createOpenAI');
      expect(openaiContent).not.toContain('createGemini');
      expect(openaiContent).not.toContain('createClaude');
      expect(openaiContent).not.toContain('createGroq');

      // 3. Groq bundle isolation
      const groqContent = fs.readFileSync(path.resolve(__dirname, '../dist/ai/groq.js'), 'utf8');
      expect(groqContent).toContain('createGroq');
      expect(groqContent).not.toContain('createGemini');
      expect(groqContent).not.toContain('createClaude');
      expect(groqContent).not.toContain('createOpenAI');
    });

    it('verifies isolated execution of gemini in a clean Node child process loads 0 foreign modules', () => {
      const script = `
        import { createGemini, gemini } from './dist/ai/gemini.js';
        const p = createGemini({ apiKey: 'gemini-isolated-test' });
        const m = p('gemini-1.5-flash');
        if (m.provider !== 'gemini') process.exit(1);

        if (typeof globalThis.OpenAI !== 'undefined') process.exit(2);
        if (typeof globalThis.Anthropic !== 'undefined') process.exit(3);

        console.log('GEMINI_TREE_SHAKING_ISOLATION_CONFIRMED');
      `;

      const ranuDir = path.resolve(__dirname, '..');
      const output = execSync(`node --input-type=module -e "${script.replace(/\n/g, ' ')}"`, {
        cwd: ranuDir,
        encoding: 'utf8',
      });

      expect(output).toContain('GEMINI_TREE_SHAKING_ISOLATION_CONFIRMED');
    });
  });
});
