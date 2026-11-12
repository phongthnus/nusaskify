import path from 'node:path';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { HttpError } from '../lib/errors.js';

const ODT_MIME = 'application/vnd.oasis.opendocument.text';
const SUPPORTED: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': ODT_MIME,
};

export function detectType(fileName: string): { ext: string; mime: string } {
  const ext = path.extname(fileName).toLowerCase();
  const mime = SUPPORTED[ext];
  if (!mime) {
    throw new HttpError(
      415,
      `Unsupported file type "${ext || 'unknown'}". Only PDF (.pdf), Word (.docx) and OpenDocument (.odt) files are accepted.`,
    );
  }
  return { ext, mime };
}

/** File buffer -> normalized plain text. */
export async function parseFile(fileName: string, buffer: Buffer): Promise<string> {
  const { ext } = detectType(fileName);
  let text: string;
  try {
    if (ext === '.pdf') {
      const parser = new PDFParse({ data: buffer });
      try {
        text = joinWrappedLines((await parser.getText()).text);
      } finally {
        await parser.destroy();
      }
    } else if (ext === '.odt') {
      text = await extractOdtText(buffer);
    } else {
      text = (await mammoth.extractRawText({ buffer })).value;
    }
  } catch (e) {
    throw new HttpError(422, `Could not read ${ext} file: ${(e as Error).message}`);
  }

  text = normalize(text);
  if (text.length < 20) {
    throw new HttpError(422, 'No extractable text found (is it a scanned PDF without a text layer?)');
  }
  return text;
}

/**
 * ODT = zip archive; the body text lives in content.xml as <text:h> (headings) and <text:p>
 * (paragraphs, also inside lists and table cells). Each heading/paragraph becomes its own block
 * separated by a blank line, like mammoth's DOCX output, so both chunkers see the same structure.
 */
async function extractOdtText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const mimetype = (await zip.file('mimetype')?.async('string'))?.trim();
  if (mimetype !== ODT_MIME) {
    throw new Error(`not an OpenDocument text file (mimetype: ${mimetype ?? 'missing'})`);
  }
  const xml = await zip.file('content.xml')?.async('string');
  if (!xml) throw new Error('content.xml missing');

  const body = xml.match(/<office:text\b[\s\S]*<\/office:text>/)?.[0] ?? xml;
  return decodeXml(
    body
      // drop comments and the deleted text kept by tracked changes
      .replace(/<office:annotation\b[\s\S]*?<\/office:annotation>/g, '')
      .replace(/<text:tracked-changes\b[\s\S]*?<\/text:tracked-changes>/g, '')
      // whitespace elements
      .replace(/<text:s\s+text:c="(\d+)"\s*\/>/g, (_, n) => ' '.repeat(Number(n)))
      .replace(/<text:s\s*\/>/g, ' ')
      .replace(/<text:tab\s*\/>/g, '\t')
      .replace(/<text:line-break\s*\/>/g, '\n')
      // block boundaries
      .replace(/<\/text:(?:p|h)>/g, '\n\n')
      .replace(/<text:(?:p|h)\b[^>]*\/>/g, '\n\n') // empty paragraph
      .replace(/<[^>]+>/g, ''),
  );
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * PDFs hard-wrap long sentences ("...domestic trips and\nUSD 80 for..."). Sentence splitters
 * treat '\n' as a boundary, so re-join a line onto the next one when it looks wrapped:
 * long line (> 60 chars) that does not end with sentence/heading punctuation.
 */
function joinWrappedLines(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.trim().length > 60 && !/[.!?:;]\s*$/.test(prev) && line.trim()) {
      out[out.length - 1] = `${prev.trimEnd()} ${line.trimStart()}`;
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^-- \d+ of \d+ --$/gm, '') // pdf-parse page markers
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
