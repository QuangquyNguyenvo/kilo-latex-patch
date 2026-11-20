// Minimal asar reader/writer. We never rewrite existing file data: patched or
// new files are appended after the original data and the header is updated to
// point at them. That keeps app.asar.unpacked untouched and makes restore exact
// (original header + original data prefix).
import fs from 'node:fs';
import crypto from 'node:crypto';

export const BLOCK_SIZE = 4 * 1024 * 1024;

export function readArchive(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const sizeBuf = Buffer.alloc(8);
    fs.readSync(fd, sizeBuf, 0, 8, 0);
    const headerPickleSize = sizeBuf.readUInt32LE(4);
    const headerBuf = Buffer.alloc(headerPickleSize);
    fs.readSync(fd, headerBuf, 0, headerPickleSize, 8);
    const strLen = headerBuf.readInt32LE(4);
    const headerString = headerBuf.subarray(8, 8 + strLen).toString('utf8');
    const dataStart = 8 + headerPickleSize;
    const totalSize = fs.fstatSync(fd).size;
    return {
      file,
      header: JSON.parse(headerString),
      headerString,
      headerHash: sha256(Buffer.from(headerString, 'utf8')),
      dataStart,
      dataSize: totalSize - dataStart,
      totalSize,
    };
  } finally {
    fs.closeSync(fd);
  }
}

export function encodeHeader(headerString) {
  const str = Buffer.from(headerString, 'utf8');
  const pad = (4 - (str.length % 4)) % 4;
  const payloadLen = 4 + str.length + pad;
  const headerBuf = Buffer.alloc(4 + payloadLen);
  headerBuf.writeUInt32LE(payloadLen, 0);
  headerBuf.writeInt32LE(str.length, 4);
  str.copy(headerBuf, 8);
  const sizeBuf = Buffer.alloc(8);
  sizeBuf.writeUInt32LE(4, 0);
  sizeBuf.writeUInt32LE(headerBuf.length, 4);
  return Buffer.concat([sizeBuf, headerBuf]);
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function integrityOf(buf) {
  const blocks = [];
  for (let i = 0; i < buf.length || (i === 0 && buf.length === 0); i += BLOCK_SIZE) {
    blocks.push(sha256(buf.subarray(i, i + BLOCK_SIZE)));
    if (buf.length === 0) break;
  }
  return { algorithm: 'SHA256', hash: sha256(buf), blockSize: BLOCK_SIZE, blocks };
}

export function getNode(header, relPath) {
  let node = header;
  for (const part of relPath.split('/').filter(Boolean)) {
    if (!node.files || !node.files[part]) return null;
    node = node.files[part];
  }
  return node;
}

export function ensureDir(header, relPath) {
  let node = header;
  for (const part of relPath.split('/').filter(Boolean)) {
    node.files[part] ??= { files: {} };
    node = node.files[part];
    if (!node.files) throw new Error(`${relPath}: ${part} is a file, not a directory`);
  }
  return node;
}

export function readEntry(archive, relPath) {
  const node = getNode(archive.header, relPath);
  if (!node || node.files) throw new Error(`not a file in asar: ${relPath}`);
  if (node.unpacked) throw new Error(`file is unpacked, not supported: ${relPath}`);
  const buf = Buffer.alloc(node.size);
  const fd = fs.openSync(archive.file, 'r');
  try {
    fs.readSync(fd, buf, 0, node.size, archive.dataStart + Number(node.offset));
  } finally {
    fs.closeSync(fd);
  }
  return buf;
}

// Write `outFile` = new header + the first `keepDataBytes` of the source data
// region + `appended` buffers (already referenced by offsets in `headerString`).
export function writeArchive({ src, srcDataStart, keepDataBytes, headerString, appended, outFile }) {
  const head = encodeHeader(headerString);
  const out = fs.openSync(outFile, 'w');
  const inp = fs.openSync(src, 'r');
  try {
    fs.writeSync(out, head);
    const chunk = Buffer.alloc(8 * 1024 * 1024);
    let copied = 0;
    while (copied < keepDataBytes) {
      const n = fs.readSync(inp, chunk, 0, Math.min(chunk.length, keepDataBytes - copied), srcDataStart + copied);
      if (n <= 0) throw new Error('unexpected end of asar data');
      fs.writeSync(out, chunk, 0, n);
      copied += n;
    }
    for (const buf of appended) fs.writeSync(out, buf);
    fs.fsyncSync(out);
  } finally {
    fs.closeSync(inp);
    fs.closeSync(out);
  }
}

export function writeRaw({ head, src, srcDataStart, keepDataBytes, outFile }) {
  const out = fs.openSync(outFile, 'w');
  const inp = fs.openSync(src, 'r');
  try {
    fs.writeSync(out, head);
    const chunk = Buffer.alloc(8 * 1024 * 1024);
    let copied = 0;
    while (copied < keepDataBytes) {
      const n = fs.readSync(inp, chunk, 0, Math.min(chunk.length, keepDataBytes - copied), srcDataStart + copied);
      if (n <= 0) throw new Error('unexpected end of asar data');
      fs.writeSync(out, chunk, 0, n);
      copied += n;
    }
    fs.fsyncSync(out);
  } finally {
    fs.closeSync(inp);
    fs.closeSync(out);
  }
}
