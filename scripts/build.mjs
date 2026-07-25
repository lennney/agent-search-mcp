import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const aggregationDir = resolve(root, 'dist', 'aggregation');
const semanticBridgeSource = resolve(root, 'src', 'aggregation', 'semantic_bridge.py');
const semanticBridgeTarget = resolve(aggregationDir, 'semantic_bridge.py');
const executable = resolve(root, 'dist', 'index.js');

mkdirSync(aggregationDir, { recursive: true });
copyFileSync(semanticBridgeSource, semanticBridgeTarget);
chmodSync(executable, 0o755);
