import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const META_DIR = path.resolve(process.cwd(), 'src/infra/db/migrations/meta');

async function walkJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkJsonFiles(fullPath);
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        return [fullPath];
      }
      return [];
    })
  );

  return files.flat();
}

function hasUtf8Bom(buffer: Buffer): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  );
}

async function stripBom(filePath: string): Promise<boolean> {
  const raw = await readFile(filePath);

  if (hasUtf8Bom(raw)) {
    await writeFile(filePath, raw.subarray(3));
    return true;
  }

  if (raw.toString('utf8').startsWith('\uFEFF')) {
    const clean = raw.toString('utf8').replace(/^\uFEFF/, '');
    await writeFile(filePath, clean, 'utf8');
    return true;
  }

  return false;
}

async function main(): Promise<void> {
  try {
    await access(META_DIR);
  } catch (error: unknown) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === 'ENOENT') {
      console.log('Migration meta directory not found. Skipping BOM strip.');
      return;
    }
    throw error;
  }

  const jsonFiles = await walkJsonFiles(META_DIR);
  const stripped: string[] = [];

  for (const filePath of jsonFiles) {
    if (await stripBom(filePath)) {
      stripped.push(path.relative(process.cwd(), filePath));
    }
  }

  if (stripped.length === 0) {
    console.log('No UTF-8 BOM found in migration meta JSON files.');
    return;
  }

  console.log(`Removed UTF-8 BOM from ${stripped.length} file(s):`);
  for (const filePath of stripped) {
    console.log(`- ${filePath}`);
  }
}

main().catch((error: unknown) => {
  console.error('Failed to strip BOM from migration meta JSON files.');
  console.error(error);
  process.exit(1);
});
