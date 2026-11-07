/**
 * Prometheus-compatible metrics registry and exposition engine.
 * Zero-dependency implementation adhering to Prometheus text exposition format version 0.0.4.
 */

export interface MetricsProvider {
  increment(name: string, value?: number, labels?: Record<string, string>): void;
  record(name: string, value: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  getMetricsText(): Promise<string> | string;
}

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricDefinition {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;
  readonly buckets?: readonly number[];
}

const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

function serializeLabels(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) {
    return '';
  }
  const sortedKeys = Object.keys(labels).sort();
  const pairs = sortedKeys.map((key) => {
    const val = String(labels[key])
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/"/g, '\\"');
    return `${key}="${val}"`;
  });
  return `{${pairs.join(',')}}`;
}

class CounterMetric {
  private values = new Map<string, number>();

  constructor(readonly def: MetricDefinition) {}

  inc(val = 1, labels?: Record<string, string>): void {
    const key = serializeLabels(labels);
    const curr = this.values.get(key) ?? 0;
    this.values.set(key, curr + val);
  }

  reset(): void {
    this.values.clear();
  }

  toPrometheusText(): string {
    const lines: string[] = [
      `# HELP ${this.def.name} ${this.def.help}`,
      `# TYPE ${this.def.name} counter`,
    ];
    if (this.values.size === 0) {
      lines.push(`${this.def.name} 0`);
    } else {
      const sortedKeys = Array.from(this.values.keys()).sort();
      for (const key of sortedKeys) {
        lines.push(`${this.def.name}${key} ${this.values.get(key)}`);
      }
    }
    return lines.join('\n');
  }
}

class GaugeMetric {
  private values = new Map<string, number>();

  constructor(readonly def: MetricDefinition) {}

  set(val: number, labels?: Record<string, string>): void {
    const key = serializeLabels(labels);
    this.values.set(key, val);
  }

  reset(): void {
    this.values.clear();
  }

  toPrometheusText(): string {
    const lines: string[] = [
      `# HELP ${this.def.name} ${this.def.help}`,
      `# TYPE ${this.def.name} gauge`,
    ];
    if (this.values.size === 0) {
      lines.push(`${this.def.name} 0`);
    } else {
      const sortedKeys = Array.from(this.values.keys()).sort();
      for (const key of sortedKeys) {
        lines.push(`${this.def.name}${key} ${this.values.get(key)}`);
      }
    }
    return lines.join('\n');
  }
}

interface HistogramData {
  count: number;
  sum: number;
  bucketCounts: number[];
}

class HistogramMetric {
  readonly buckets: readonly number[];
  private values = new Map<string, HistogramData>();

  constructor(readonly def: MetricDefinition) {
    this.buckets = def.buckets ?? DEFAULT_HISTOGRAM_BUCKETS;
  }

  observe(val: number, labels?: Record<string, string>): void {
    const key = serializeLabels(labels);
    let data = this.values.get(key);
    if (!data) {
      data = {
        count: 0,
        sum: 0,
        bucketCounts: new Array(this.buckets.length).fill(0),
      };
      this.values.set(key, data);
    }

    data.count += 1;
    data.sum += val;

    for (let i = 0; i < this.buckets.length; i++) {
      const bound = this.buckets[i];
      if (bound !== undefined && val <= bound) {
        const currentCount = data.bucketCounts[i] ?? 0;
        data.bucketCounts[i] = currentCount + 1;
      }
    }
  }

  reset(): void {
    this.values.clear();
  }

  toPrometheusText(): string {
    const lines: string[] = [
      `# HELP ${this.def.name} ${this.def.help}`,
      `# TYPE ${this.def.name} histogram`,
    ];

    if (this.values.size === 0) {
      for (const b of this.buckets) {
        lines.push(`${this.def.name}_bucket{le="${b}"} 0`);
      }
      lines.push(`${this.def.name}_bucket{le="+Inf"} 0`);
      lines.push(`${this.def.name}_sum 0`);
      lines.push(`${this.def.name}_count 0`);
      return lines.join('\n');
    }

    const sortedKeys = Array.from(this.values.keys()).sort();
    for (const key of sortedKeys) {
      const data = this.values.get(key)!;
      // Parse base label pairs if key is "{k=\"v\"}"
      const innerLabels = key ? key.slice(1, -1) : '';

      for (let i = 0; i < this.buckets.length; i++) {
        const bound = this.buckets[i];
        const count = data.bucketCounts[i] ?? 0;
        const leStr = `le="${bound}"`;
        const bucketLabels = innerLabels ? `{${innerLabels},${leStr}}` : `{${leStr}}`;
        lines.push(`${this.def.name}_bucket${bucketLabels} ${count}`);
      }

      const infLabels = innerLabels ? `{${innerLabels},le="+Inf"}` : '{le="+Inf"}';
      lines.push(`${this.def.name}_bucket${infLabels} ${data.count}`);

      const sumLabels = innerLabels ? `{${innerLabels}}` : '';
      lines.push(`${this.def.name}_sum${sumLabels} ${Number(data.sum.toFixed(6))}`);
      lines.push(`${this.def.name}_count${sumLabels} ${data.count}`);
    }

    return lines.join('\n');
  }
}

/**
 * Built-in zero-dependency Prometheus registry.
 */
export class PrometheusRegistry implements MetricsProvider {
  private counters = new Map<string, CounterMetric>();
  private gauges = new Map<string, GaugeMetric>();
  private histograms = new Map<string, HistogramMetric>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.registerCounter({
      name: 'ranu_http_requests_total',
      help: 'Total number of HTTP requests handled by Ranu.js runtime.',
      type: 'counter',
    });
    this.registerHistogram({
      name: 'ranu_http_request_duration_seconds',
      help: 'Latency of HTTP request handling in seconds.',
      type: 'histogram',
    });
    this.registerGauge({
      name: 'ranu_http_requests_active',
      help: 'Number of active in-flight HTTP requests.',
      type: 'gauge',
    });
    this.registerCounter({
      name: 'ranu_ssr_renders_total',
      help: 'Total number of React SSR streaming renders completed.',
      type: 'counter',
    });
    this.registerHistogram({
      name: 'ranu_ssr_render_duration_seconds',
      help: 'Latency of React SSR renders in seconds.',
      type: 'histogram',
    });
    this.registerCounter({
      name: 'ranu_server_actions_total',
      help: 'Total number of Server Action RPC dispatches handled.',
      type: 'counter',
    });
    this.registerHistogram({
      name: 'ranu_server_action_duration_seconds',
      help: 'Latency of Server Action executions in seconds.',
      type: 'histogram',
    });
    this.registerCounter({
      name: 'ranu_streaming_chunks_total',
      help: 'Total number of streaming chunks flushed to clients.',
      type: 'counter',
    });
    this.registerCounter({
      name: 'ranu_streaming_bytes_total',
      help: 'Total number of bytes streamed to clients.',
      type: 'counter',
    });
  }

  registerCounter(def: MetricDefinition): void {
    if (!this.counters.has(def.name)) {
      this.counters.set(def.name, new CounterMetric(def));
    }
  }

  registerGauge(def: MetricDefinition): void {
    if (!this.gauges.has(def.name)) {
      this.gauges.set(def.name, new GaugeMetric(def));
    }
  }

  registerHistogram(def: MetricDefinition): void {
    if (!this.histograms.has(def.name)) {
      this.histograms.set(def.name, new HistogramMetric(def));
    }
  }

  increment(name: string, value = 1, labels?: Record<string, string>): void {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = new CounterMetric({ name, help: name, type: 'counter' });
      this.counters.set(name, counter);
    }
    counter.inc(value, labels);
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    let g = this.gauges.get(name);
    if (!g) {
      g = new GaugeMetric({ name, help: name, type: 'gauge' });
      this.gauges.set(name, g);
    }
    g.set(value, labels);
  }

  record(name: string, value: number, labels?: Record<string, string>): void {
    let h = this.histograms.get(name);
    if (!h) {
      h = new HistogramMetric({ name, help: name, type: 'histogram' });
      this.histograms.set(name, h);
    }
    h.observe(value, labels);
  }

  reset(): void {
    for (const c of this.counters.values()) c.reset();
    for (const g of this.gauges.values()) g.reset();
    for (const h of this.histograms.values()) h.reset();
  }

  getMetricsText(): string {
    const sections: string[] = [];
    for (const c of this.counters.values()) {
      sections.push(c.toPrometheusText());
    }
    for (const g of this.gauges.values()) {
      sections.push(g.toPrometheusText());
    }
    for (const h of this.histograms.values()) {
      sections.push(h.toPrometheusText());
    }
    return sections.join('\n\n') + '\n';
  }
}

let activeMetricsProvider: MetricsProvider = new PrometheusRegistry();

/**
 * Returns the currently active MetricsProvider.
 */
export function getMetrics(): MetricsProvider {
  return activeMetricsProvider;
}

/**
 * Sets a custom MetricsProvider.
 */
export function setMetricsProvider(provider: MetricsProvider): void {
  activeMetricsProvider = provider;
}

/**
 * Resets the active metrics provider (if it supports reset) or creates a fresh default registry.
 */
export function resetMetrics(): void {
  if (activeMetricsProvider instanceof PrometheusRegistry) {
    activeMetricsProvider.reset();
  } else {
    activeMetricsProvider = new PrometheusRegistry();
  }
}

/**
 * Helper to record a metric on the active metrics provider.
 */
export function recordMetric(
  name: string,
  value: number,
  labels?: Record<string, string>,
): void {
  activeMetricsProvider.record(name, value, labels);
}
