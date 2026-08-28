import { execSync } from 'child_process';

const steps = [
  { name: 'typecheck', cmd: 'pnpm typecheck' },
  { name: 'build', cmd: 'pnpm build' },
  { name: 'lint', cmd: 'pnpm lint' },
  { name: 'unit tests', cmd: 'pnpm test' },
  { name: 'integration tests', cmd: 'pnpm test:integration' },
  { name: 'check cycles', cmd: 'pnpm check-cycles' },
  { name: 'check exports', cmd: 'pnpm check-exports' }
];

console.log('\n=== RUNNING CI VERIFICATION ===\n');

for (const step of steps) {
  console.log(`[CI STEP] Starting: ${step.name} (${step.cmd})`);
  try {
    execSync(step.cmd, { stdio: 'inherit', env: process.env });
    console.log(`[CI STEP] PASSED: ${step.name}\n`);
  } catch (error) {
    console.error(`\n[CI STEP] FAILED: ${step.name} (${step.cmd})`);
    process.exit(1);
  }
}

console.log('=== ALL CI VERIFICATION STEPS PASSED SUCCESSFULLY ===\n');
process.exit(0);
