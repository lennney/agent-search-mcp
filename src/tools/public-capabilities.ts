import { engines } from '../engines/index.js';
import { publicCapabilityControls } from '../infrastructure/config.js';
import { toolRegistry } from './registry.js';

export type CapabilityLocale = 'en' | 'zh';

export interface PublicCapabilityRenderOptions {
  isToolEnabled?: (toolId: string) => boolean;
}

function cell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderPublicCapabilityMatrix(
  locale: CapabilityLocale,
  options: PublicCapabilityRenderOptions = {},
): string {
  const isToolEnabled = options.isToolEnabled ?? (() => true);
  const engineList = Object.values(engines);
  const tools = toolRegistry.filter(tool => isToolEnabled(tool.id));
  const zeroKeyCount = engineList.filter(engine => engine.isFree).length;
  const optionalCount = engineList.length - zeroKeyCount;
  const lines = locale === 'zh'
    ? [
      '## 搜索引擎',
      '',
      `运行时注册了 ${engineList.length} 个适配器：${zeroKeyCount} 个零密钥适配器和 ${optionalCount} 个可选 API 适配器。`,
      '',
      '| 引擎 | 访问方式 | 语言 | 定位 |',
      '|---|---|---|---|',
      ...engineList.map(engine => `| ${cell(engine.name)} | ${engine.credentialEnvironment ? `\`${engine.credentialEnvironment}\`` : '零密钥'} | ${cell(engine.languages.join(', '))} | ${cell(engine.strengths.zh)} |`),
      '',
      '## 工具',
      '',
      '| 工具 | 说明 | 适用场景 |',
      '|---|---|---|',
      ...tools.map(tool => `| \`${tool.id}\` | ${cell(tool.summary.zh)} | ${cell(tool.bestFor.zh)} |`),
      '',
      '### 能力控制',
      '',
      '| 环境变量 | 默认值 | 作用 |',
      '|---|---|---|',
      ...publicCapabilityControls.map(control => `| \`${control.environment}\` | ${cell(control.defaultValue)} | ${cell(control.description.zh)} |`),
    ]
    : [
      '## Engines',
      '',
      `The runtime registers ${engineList.length} adapters: ${zeroKeyCount} zero-key adapters and ${optionalCount} optional API adapters.`,
      '',
      '| Engine | Access | Languages | Role |',
      '|---|---|---|---|',
      ...engineList.map(engine => `| ${cell(engine.name)} | ${engine.credentialEnvironment ? `\`${engine.credentialEnvironment}\`` : 'Zero-key'} | ${cell(engine.languages.join(', '))} | ${cell(engine.strengths.en)} |`),
      '',
      '## Tools',
      '',
      '| Tool | Description | Best for |',
      '|---|---|---|',
      ...tools.map(tool => `| \`${tool.id}\` | ${cell(tool.summary.en)} | ${cell(tool.bestFor.en)} |`),
      '',
      '### Capability controls',
      '',
      '| Environment | Default | Purpose |',
      '|---|---|---|',
      ...publicCapabilityControls.map(control => `| \`${control.environment}\` | ${cell(control.defaultValue)} | ${cell(control.description.en)} |`),
    ];

  return `${lines.join('\n')}\n`;
}
