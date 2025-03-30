import * as path from 'path';

import { Project } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

const dependencyGraph: Record<string, Set<string>> = {};

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  const normalizedPath = path.relative(process.cwd(), filePath);

  dependencyGraph[normalizedPath] = new Set();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    if (importDecl.isTypeOnly()) continue;

    const target = importDecl.getModuleSpecifierSourceFile();
    if (!target) continue;

    const targetPath = path.relative(process.cwd(), target.getFilePath());

    dependencyGraph[normalizedPath].add(targetPath);
  }
}

function detectCycles() {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(current: string, pathStack: string[]) {
    if (stack.has(current)) {
      const cycleStart = pathStack.indexOf(current);
      const cycle = pathStack.slice(cycleStart).concat(current);
      cycles.push(cycle);
      return;
    }

    if (visited.has(current)) return;

    visited.add(current);
    stack.add(current);
    pathStack.push(current);

    const neighbors = dependencyGraph[current] || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, pathStack);
    }

    stack.delete(current);
    pathStack.pop();
  }

  for (const node in dependencyGraph) {
    dfs(node, []);
  }

  return cycles;
}

const cycles = detectCycles();

if (cycles.length > 0) {
  console.error(
    '🔴 Found circular dependencies (excluding type-only imports):\n'
  );
  cycles.forEach((cycle, i) => {
    console.error(`${i + 1}) ${cycle.join(' → ')}`);
  });
  process.exit(1);
} else {
  console.log(
    '✅ No circular dependencies found (excluding type-only imports).'
  );
}
