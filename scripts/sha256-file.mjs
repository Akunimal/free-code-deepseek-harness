import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** Hash large release assets incrementally so packaging memory stays bounded. */
export async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}
