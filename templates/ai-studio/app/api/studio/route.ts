import { getPartnerConfig } from '../../../src/partners.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      prompt?: string;
      partner?: string;
      model?: string;
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const partnerConfig = getPartnerConfig(body.partner);
    const model = body.model || partnerConfig.defaultModel;

    // Simulate W3C standard streaming output representing real AI generation chunks
    const chunks = [
      `// [Ranu.js AI Studio Engine]\n`,
      `// Provider: ${partnerConfig.name}\n`,
      `// Model: ${model}\n`,
      `// Benchmark: ~${partnerConfig.typicalTps} T/s | ${partnerConfig.typicalTtfbMs}ms TTFB\n\n`,
      `import { useState, useEffect } from 'react';\n`,
      `import { useFormAction } from '@ranujs/core';\n\n`,
      `export default function GeneratedFeature() {\n`,
      `  const [status, setStatus] = useState('active');\n`,
      `  // Generated based on prompt: "${prompt}"\n`,
      `  return (\n`,
      `    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">\n`,
      `      <h2 className="text-xl font-bold text-white mb-2">${partnerConfig.name} Showcase</h2>\n`,
      `      <p className="text-slate-400 text-sm">Real-time streaming component ready for developer review.</p>\n`,
      `    </div>\n`,
      `  );\n`,
      `}\n`,
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          // Micro delay simulating token streaming
          await new Promise((r) => setTimeout(r, 15));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Partner-Engine': partnerConfig.id,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
