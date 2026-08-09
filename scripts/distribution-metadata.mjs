import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageMetadata = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const registryMetadata = JSON.parse(
  readFileSync(new URL('../server.json', import.meta.url), 'utf8'),
);

const repository = 'lennney/agent-search-mcp';
const expectedDescription = packageMetadata.description;
const expectedTopics = packageMetadata.distributionMetadata?.githubTopics ?? [];
const errors = [];

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function arraysEqual(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

if (registryMetadata.name !== packageMetadata.mcpName) {
  errors.push('server.json name must match package.json mcpName');
}
if (registryMetadata.version !== packageMetadata.version) {
  errors.push('server.json version must match package.json version');
}
if (registryMetadata.description !== expectedDescription) {
  errors.push('server.json description must match package.json description');
}
if (expectedDescription.length > 100) {
  errors.push('package.json description must not exceed 100 characters');
}
if (/\b\d+\s+(?:zero-key|free)\s+engines?\b/i.test(expectedDescription)) {
  errors.push('description must not contain a volatile engine-count claim');
}
if (/\b(?:only|best|unique)\b/i.test(expectedDescription)) {
  errors.push('description must not contain an unqualified exclusivity claim');
}
if (expectedTopics.length === 0 || expectedTopics.length > 20) {
  errors.push('distributionMetadata.githubTopics must contain 1 to 20 topics');
}
if (new Set(expectedTopics).size !== expectedTopics.length) {
  errors.push('distributionMetadata.githubTopics must not contain duplicates');
}
for (const topic of expectedTopics) {
  if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(topic)) {
    errors.push(`invalid GitHub topic: ${topic}`);
  }
}

const liveMode = process.argv.includes('--live-github');
const syncMode = process.argv.includes('--sync-github');

function readGitHubMetadata() {
  const output = execFileSync(
    'gh',
    [
      'repo',
      'view',
      repository,
      '--json',
      'description,repositoryTopics',
    ],
    { encoding: 'utf8' },
  );
  const metadata = JSON.parse(output);
  return {
    description: metadata.description,
    topics: metadata.repositoryTopics.map(topic => topic.name),
  };
}

if (syncMode) {
  const current = readGitHubMetadata();
  const argumentsList = [
    'repo',
    'edit',
    repository,
    '--description',
    expectedDescription,
  ];
  for (const topic of current.topics.filter(topic => !expectedTopics.includes(topic))) {
    argumentsList.push('--remove-topic', topic);
  }
  for (const topic of expectedTopics.filter(topic => !current.topics.includes(topic))) {
    argumentsList.push('--add-topic', topic);
  }
  execFileSync('gh', argumentsList, { stdio: 'inherit' });
}

if (liveMode || syncMode) {
  const current = readGitHubMetadata();
  if (current.description !== expectedDescription) {
    errors.push('GitHub description does not match package.json description');
  }
  if (!arraysEqual(current.topics, expectedTopics)) {
    errors.push('GitHub topics do not match distributionMetadata.githubTopics');
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    liveMode || syncMode
      ? 'Distribution metadata is aligned locally and on GitHub.\n'
      : 'Local distribution metadata is aligned.\n',
  );
}
