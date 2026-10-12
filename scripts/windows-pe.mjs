import { open, stat } from 'node:fs/promises';

const DOS_HEADER_SIZE = 0x40;
const PE_SIGNATURE = Buffer.from([0x50, 0x45, 0x00, 0x00]);

export async function verifyWindowsPeFile(filePath, label) {
  const fileStat = await stat(filePath);
  if (fileStat.size < DOS_HEADER_SIZE + PE_SIGNATURE.length) {
    throw new Error(`${label}: file is too small to contain a Windows PE header`);
  }

  const handle = await open(filePath, 'r');
  try {
    const dosHeader = Buffer.alloc(DOS_HEADER_SIZE);
    const dosResult = await handle.read(dosHeader, 0, dosHeader.length, 0);
    if (dosResult.bytesRead !== DOS_HEADER_SIZE || dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) {
      throw new Error(`${label}: missing Windows DOS MZ signature`);
    }

    const peOffset = dosHeader.readUInt32LE(0x3c);
    if (peOffset < DOS_HEADER_SIZE || peOffset + PE_SIGNATURE.length > fileStat.size) {
      throw new Error(`${label}: invalid Windows PE header offset`);
    }
    const signature = Buffer.alloc(PE_SIGNATURE.length);
    const peResult = await handle.read(signature, 0, signature.length, peOffset);
    if (peResult.bytesRead !== PE_SIGNATURE.length || !signature.equals(PE_SIGNATURE)) {
      throw new Error(`${label}: missing Windows PE signature`);
    }
  } finally {
    await handle.close();
  }

  return { size: fileStat.size };
}
