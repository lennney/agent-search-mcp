import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const distDirectory = resolve(root, 'dist');

if (process.argv.includes('--clean')) {
  rmSync(distDirectory, { recursive: true, force: true });
  process.exit(0);
}

const aggregationDir = resolve(root, 'dist', 'aggregation');
const semanticBridgeSource = resolve(root, 'src', 'aggregation', 'semantic_bridge.py');
const semanticBridgeTarget = resolve(aggregationDir, 'semantic_bridge.py');
const executable = resolve(root, 'dist', 'index.js');

mkdirSync(aggregationDir, { recursive: true });
copyFileSync(semanticBridgeSource, semanticBridgeTarget);
chmodSync(executable, 0o755);
