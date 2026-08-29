const loopbackHosts = ['127.0.0.1', 'localhost', '::1'];

for (const variable of ['NO_PROXY', 'no_proxy'] as const) {
  const current =
    process.env[variable]
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];
  process.env[variable] = [...new Set([...current, ...loopbackHosts])].join(',');
}
