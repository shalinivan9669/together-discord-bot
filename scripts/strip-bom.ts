import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const DEFAULT_DRIZZLE_CONFIG = 'drizzle.config.ts';
const DEFAULT_MIGRATIONS_DIR = 'src/infra/db/migrations';
const DRIZZLE_OUT_REGEX = /\bout\s*:\s*(['"`])([^'"`]+)\1/;

type RunResult = {
  migrationsDir: string;
  targetFiles: string[];
  bomFiles: string[];
};

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function hasBom(buffer: Buffer): boolean {
  return (
    buffer.length >= UTF8_BOM.length &&
    buffer[0] === UTF8_BOM[0] &&
    buffer[1] === UTF8_BOM[1] &&
    buffer[2] === UTF8_BOM[2]
  );
}

async function walk(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function resolveMigrationsDir(cwd: string): Promise<string> {
  const configPath = path.resolve(cwd, DEFAULT_DRIZZLE_CONFIG);
  const fallback = path.resolve(cwd, DEFAULT_MIGRATIONS_DIR);

  try {
    const raw = await readFile(configPath, 'utf8');
    const text = raw.replace(/^\uFEFF/, '');
    const match = DRIZZLE_OUT_REGEX.exec(text);
    if (!match?.[2]) {
      return fallback;
    }
    return path.resolve(path.dirname(configPath), match[2]);
  } catch (error: unknown) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

function isTargetFile(migrationsDir: string, filePath: string): boolean {
  const relativePath = toPosix(path.relative(migrationsDir, filePath)).toLowerCase();
  if (relativePath.endsWith('.sql')) {
    return true;
  }
  return relativePath.startsWith('meta/') && relativePath.endsWith('.json');
}

async function findBomFiles(cwd: string): Promise<RunResult> {
  const migrationsDir = await resolveMigrationsDir(cwd);

  try {
    await access(migrationsDir);
  } catch (error: unknown) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === 'ENOENT') {
      return { migrationsDir, targetFiles: [], bomFiles: [] };
    }
    throw error;
  }

  const allFiles = await walk(migrationsDir);
  const targetFiles = allFiles
    .filter((filePath) => isTargetFile(migrationsDir, filePath))
    .sort((a, b) => a.localeCompare(b));

  const bomFiles: string[] = [];
  for (const filePath of targetFiles) {
    const bytes = await readFile(filePath);
    if (hasBom(bytes)) {
      bomFiles.push(filePath);
    }
  }

  return { migrationsDir, targetFiles, bomFiles };
}

async function stripBomFiles(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    const bytes = await readFile(filePath);
    if (hasBom(bytes)) {
      await writeFile(filePath, bytes.subarray(UTF8_BOM.length));
    }
  }
}

function relativeList(cwd: string, filePaths: string[]): string[] {
  return filePaths.map((filePath) => toPosix(path.relative(cwd, filePath)));
}

async function run(): Promise<number> {
  const cwd = process.cwd();
  const checkOnly = process.argv.includes('--check');
  const result = await findBomFiles(cwd);
  const bomRelative = relativeList(cwd, result.bomFiles);

  if (checkOnly) {
    if (bomRelative.length === 0) {
      console.log('No UTF-8 BOM found in Drizzle migration files.');
      return 0;
    }

    console.error('UTF-8 BOM found in Drizzle migration files:');
    for (const [index, filePath] of bomRelative.entries()) {
      console.error(`${index + 1}. ${filePath}`);
    }
    return 1;
  }

  if (bomRelative.length === 0) {
    console.log('No UTF-8 BOM found in Drizzle migration files.');
    return 0;
  }

  await stripBomFiles(result.bomFiles);
  console.log(`Removed UTF-8 BOM from ${bomRelative.length} file(s):`);
  for (const [index, filePath] of bomRelative.entries()) {
    console.log(`${index + 1}. ${filePath}`);
  }

  return 0;
}

run()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error('Failed to process UTF-8 BOM for Drizzle migration files.');
    console.error(error);
    process.exit(1);
  });
