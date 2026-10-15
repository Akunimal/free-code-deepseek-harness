import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const binary = 'opencode2api-win-x64.exe';
const receiptName = 'freecode-build-receipt.json';
const hash = data => createHash('sha256').update(data).digest('hex');
function inputs(root) {
  const vendor = join(root, 'vendor/opencode2api');
  const digest = createHash('sha256');
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      if (entry.isDirectory() && entry.name !== 'graphify-out' && entry.name !== '.git') visit(join(directory,entry.name));
      else if (entry.isFile() && (/\.go$/.test(entry.name) || ['go.mod','go.sum','UPSTREAM_VERSION'].includes(entry.name))) {
        const path = join(directory,entry.name);
        digest.update(relative(vendor,path).replaceAll('\\','/')).update('\0').update(readFileSync(path)).update('\0');
      }
    }
  };
  visit(vendor);
  const patch = join(root,'patches/opencode2api-pash-tool-name.patch');
  if (existsSync(patch)) digest.update(readFileSync(patch));
  return digest.digest('hex');
}
function paths(root) {
  return {
    source: join(root,'apps/shell/resources/opencode2api'),
    staged: join(root,'apps/shell/resources/freecode/opencode2api'),
  };
}

// Build completion only; never called implicitly from prepackage verification.
export function stageSidecar(root) {
  const {source,staged}=paths(root);
  const license = join(root,'vendor/opencode2api/LICENSE');
  const receipt={schemaVersion:1,version:readFileSync(join(root,'vendor/opencode2api/UPSTREAM_VERSION'),'utf8').trim(),sourceSha256:inputs(root),binarySha256:hash(readFileSync(join(source,binary))),licenseSha256:hash(readFileSync(license))};
  mkdirSync(staged,{recursive:true});
  writeFileSync(join(source,receiptName),JSON.stringify(receipt,null,2)+'\n');
  copyFileSync(join(source,binary),join(staged,binary));
  copyFileSync(join(source,receiptName),join(staged,receiptName));
  copyFileSync(license,join(source,'LICENSE'));
  copyFileSync(license,join(staged,'LICENSE'));
}

export function verifyStagedSidecar(root) {
  const {source,staged}=paths(root);
  const receipt=JSON.parse(readFileSync(join(staged,receiptName),'utf8'));
  if (receipt.schemaVersion!==1 || receipt.version!==readFileSync(join(root,'vendor/opencode2api/UPSTREAM_VERSION'),'utf8').trim() || receipt.sourceSha256!==inputs(root)) throw new Error('opencode2api source fingerprint changed; rebuild sidecar before packaging');
  if (receipt.binarySha256!==hash(readFileSync(join(source,binary))) || receipt.binarySha256!==hash(readFileSync(join(staged,binary)))) throw new Error('opencode2api staged binary is stale; rebuild/stage sidecar');
  if (receipt.licenseSha256!==hash(readFileSync(join(root,'vendor/opencode2api/LICENSE')))
    || receipt.licenseSha256!==hash(readFileSync(join(staged,'LICENSE')))) throw new Error('opencode2api staged license is missing or stale; rebuild/stage sidecar');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
  if (process.argv[2]==='--verify') verifyStagedSidecar(root);
  else if (process.argv[2]==='--stage-built') stageSidecar(root);
  else throw new Error('use --verify or --stage-built (after Go build)');
  console.log('opencode2api staging: verified');
}
