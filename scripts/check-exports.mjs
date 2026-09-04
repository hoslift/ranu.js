import fs from 'fs';
import path from 'path';

const publishedPackages = [
  { 
    dir: 'packages/ranu', 
    name: 'ranu', 
    canonicalExports: ['.', './config', './react', './server', './plugin'], 
    technicalExports: ['./server-only'] 
  },
  { 
    dir: 'create-ranu', 
    name: 'create-ranu', 
    canonicalExports: ['.'],
    technicalExports: []
  },
  { 
    dir: 'adapters/vercel', 
    name: '@ranu/adapter-vercel', 
    canonicalExports: ['.'],
    technicalExports: []
  }
];

let failed = false;

for (const pkg of publishedPackages) {
  const pkgJsonPath = path.join(pkg.dir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    console.error(`Missing package.json for package: ${pkg.name} at ${pkgJsonPath}`);
    failed = true;
    continue;
  }
  
  const content = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const exports = content.exports;
  
  if (!exports) {
    console.error(`Missing 'exports' field in package.json for package: ${pkg.name}`);
    failed = true;
    continue;
  }
  
  // 1. Verify Canonical Public API Exports
  for (const exp of pkg.canonicalExports) {
    if (!exports[exp]) {
      console.error(`Package ${pkg.name} is missing expected public export: "${exp}"`);
      failed = true;
    }
  }
  
  // 2. Verify Required Technical Exports
  for (const exp of pkg.technicalExports) {
    if (!exports[exp]) {
      console.error(`Package ${pkg.name} is missing required technical export: "${exp}"`);
      failed = true;
    }
  }

  // 2b. For ranu package, verify root index exposes defineConfig convenience re-export
  if (pkg.name === 'ranu') {
    const rootSrc = fs.readFileSync(path.join(pkg.dir, 'src/index.ts'), 'utf8');
    if (!rootSrc.includes('defineConfig')) {
      console.error(`Package ranu root entry (src/index.ts) is missing convenience re-export of defineConfig`);
      failed = true;
    }
  }
  
  // 3. Verify target files resolve to source equivalents
  for (const [expKey, expVal] of Object.entries(exports)) {
    const checkTarget = (val) => {
      if (typeof val === 'string') {
        const srcFile = val.replace('./dist/', './src/').replace('.js', '.ts').replace('.d.ts', '.ts');
        const srcPath = path.join(pkg.dir, srcFile);
        if (!fs.existsSync(srcPath)) {
          console.error(`Export "${expKey}" maps to nonexistent source entry file: ${srcPath}`);
          failed = true;
        }
      } else if (typeof val === 'object' && val !== null) {
        if (val.types) checkTarget(val.types);
        if (val.import) checkTarget(val.import);
        if (val.default) checkTarget(val.default);
      }
    };
    checkTarget(expVal);
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("All package exports verified successfully.");
  process.exit(0);
}
