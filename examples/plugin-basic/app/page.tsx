export default function PluginExamplePage() {
  return (
    <article>
      <h1>Plugin Architecture Example</h1>
      <p>
        Demonstrating third-party plugin authoring via <code>definePlugin()</code> from{' '}
        <code>ranu/plugin</code>.
      </p>
      <p>
        When running <code>ranu build</code> or <code>ranu dev</code>, the custom banner plugin
        hooks into the lifecycle and logs diagnostic telemetry.
      </p>
    </article>
  );
}
