/**
 * Validate that a file is a real MP3 (MPEG layer III), not DASH/fMP4 with .mp3 extension.
 */
import fs from 'node:fs';

function hasMpegSync(buf, offset) {
  if (offset + 1 >= buf.length) return false;
  const b0 = buf[offset];
  const b1 = buf[offset + 1];
  if (b0 !== 0xff) return false;
  // frame sync 11 bits set; layer III = bits ...xx where layer is 01
  if ((b1 & 0xe0) !== 0xe0) return false;
  const layer = (b1 >> 1) & 0x3;
  // 01 = Layer III (MPEG convention: inverted)
  return layer === 0x01;
}

/**
 * @param {string} filePath
 * @throws {Error} if not a real MP3
 */
export function assertRealMp3(filePath) {
  if (!filePath.toLowerCase().endsWith('.mp3')) {
    throw new Error(`Áudio deve ter extensão .mp3: ${filePath}`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de áudio não encontrado: ${filePath}`);
  }

  const size = fs.statSync(filePath).size;
  if (size < 128) {
    throw new Error(`Arquivo de áudio muito pequeno para ser MP3: ${filePath}`);
  }

  const readLen = Math.min(size, 64 * 1024);
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(readLen);
  fs.readSync(fd, buf, 0, readLen, 0);
  fs.closeSync(fd);

  // ISO BMFF / fMP4 (YouTube DASH often disguised as .mp3)
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') {
    throw new Error(
      `Áudio parece fMP4/DASH (ftyp), não MP3 real: ${filePath}\n` +
        `  Converta: ffmpeg -i entrada -vn -codec:a libmp3lame -qscale:a 2 saida.mp3`,
    );
  }

  // ID3v2
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return;
  }

  for (let i = 0; i < buf.length - 1; i++) {
    if (hasMpegSync(buf, i)) return;
  }

  throw new Error(
    `Não encontrei frames MPEG Layer III em ${filePath}.\n` +
      `  Use um MP3 real (file arquivo.mp3 deve dizer MPEG / layer III).`,
  );
}
