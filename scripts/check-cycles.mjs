import fs from 'fs';
import path from 'path';

const packagesDir = 'packages';
const adaptersDir = 'adapters';

function getPackages() {
  const pkgs = [];
  
  if (fs.existsSync(packagesDir)) {
    fs.readdirSync(packagesDir).forEach(dir => {
      const pkgPath = path.join(packagesDir, dir, 'package.json');
      if (fs.existsSync(pkgPath)) pkgs.push(pkgPath);
    });
  }
  
  if (fs.existsSync(adaptersDir)) {
    fs.readdirSync(adaptersDir).forEach(dir => {
      const pkgPath = path.join(adaptersDir, dir, 'package.json');
      if (fs.existsSync(pkgPath)) pkgs.push(pkgPath);
    });
  }
  
  if (fs.existsSync('create-ranu/package.json')) {
    pkgs.push('create-ranu/package.json');
  }
  
  return pkgs;
}

const pkgs = getPackages();
const graph = {};

for (const pkgPath of pkgs) {
  const content = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const name = content.name;
  graph[name] = [];
  
  const deps = {
    ...content.dependencies,
    ...content.devDependencies,
    ...content.peerDependencies
  };
  
  for (const [depName, depVer] of Object.entries(deps)) {
    if (depVer && depVer.startsWith('workspace:')) {
      graph[name].push(depName);
    }
  }
}

const visited = {};
const recStack = {};

function dfs(node, pathStack = []) {
  visited[node] = true;
  recStack[node] = true;
  pathStack.push(node);
  
  for (const neighbor of (graph[node] || [])) {
    if (!visited[neighbor]) {
      if (dfs(neighbor, pathStack)) return true;
    } else if (recStack[neighbor]) {
      pathStack.push(neighbor);
      const cycleStartIdx = pathStack.indexOf(neighbor);
      const cycleChain = pathStack.slice(cycleStartIdx).join(' -> ');
      console.error(`Circular dependency detected: ${cycleChain}`);
      return true;
    }
  }
  
  recStack[node] = false;
  pathStack.pop();
  return false;
}

let hasCycle = false;
for (const node of Object.keys(graph)) {
  if (!visited[node]) {
    if (dfs(node)) {
      hasCycle = true;
      break;
    }
  }
}

if (hasCycle) {
  process.exit(1);
} else {
  console.log("No cyclic dependencies found in workspace.");
  process.exit(0);
}
