import { config } from '../config.js';
import { chat } from './models.js';
import { searchChunks, type RetrievedChunk, type SearchParams } from './retrieve.js';

export const NOT_ENOUGH_INFO =
  'Not enough information: the selected documents do not contain an answer to this question.';
const NOT_ENOUGH_TOKEN = 'NOT_ENOUGH_INFO';

// Passages are labelled [S1], [S2], … instead of [1], [2]: policy text is full of numbered
// headings ("2. Remote work allowance") and the 4B model cited the SECTION number ([2]) when only
// passage [1] existed. A prefix that never occurs in documents removes that ambiguity.
// The final answer is rewritten to plain [n] markers for the API/UI.
const systemPrompt = (n: number) => `You are NUSAskify, an assistant that answers questions about internal company policies.
Rules:
- Use ONLY the context passages. Never use outside knowledge.
- The passages are labelled ${Array.from({ length: n }, (_, i) => `[S${i + 1}]`).join(', ')}. Section numbers inside a passage are NOT passage labels.
- After every sentence that states a fact, cite the label of the passage that supports it, e.g. [S1].
- If the passages do not contain the answer, reply with exactly: ${NOT_ENOUGH_TOKEN}
- Answer in the same language as the question. Be concise.`;

export interface Citation {
  marker: number;
  chunk_id: number;
  document_id: string;
  title: string;
  version: number;
  chunk_index: number;
}

export interface AskResult {
  status: 'answered' | 'insufficient';
  answer: string;
  reason?: string;
  citations: Citation[];
  chunks: RetrievedChunk[];
  raw_llm_output?: string;
}

export async function ask(p: SearchParams): Promise<AskResult> {
  const chunks = await searchChunks(p);

  // Gate 1 (retrieval): nothing relevant enough -> don't even call the LLM.
  const best = chunks[0]?.score ?? 0;
  if (chunks.length === 0 || best < config.minScore) {
    return {
      status: 'insufficient',
      answer: NOT_ENOUGH_INFO,
      reason: chunks.length === 0
        ? 'No chunks matched the tenant/document/validity filter.'
        : `Best similarity ${best.toFixed(3)} < MIN_SCORE ${config.minScore}.`,
      citations: [],
      chunks,
    };
  }

  const context = chunks
    .map((c, i) => `[S${i + 1}] (${c.title}, v${c.version})\n${c.content}`)
    .join('\n\n');
  const raw = await chat(systemPrompt(chunks.length), `Context passages:\n\n${context}\n\nQuestion: ${p.question}`);

  // Gate 2 (generation): the model itself says the context is insufficient.
  if (raw.includes(NOT_ENOUGH_TOKEN)) {
    return { status: 'insufficient', answer: NOT_ENOUGH_INFO, reason: 'LLM found no answer in the context.',
             citations: [], chunks, raw_llm_output: raw };
  }

  // Gate 3 (citation validation): keep only labels that point to a retrieved chunk.
  // Accepts [S1], [S1][S2] and [S1, S2]; anything else in brackets that looks like a citation
  // (e.g. a bare [2]) is treated as invalid and removed.
  const valid = new Set<number>();
  const answer = raw
    .replace(/\[\s*S?\d+(?:\s*,\s*S?\d+)*\s*\]/gi, (m) => {
      if (!/S\d/i.test(m)) return ''; // bare number = not a passage label
      const kept = [...m.matchAll(/S(\d+)/gi)]
        .map((x) => Number(x[1]))
        .filter((idx) => idx >= 1 && idx <= chunks.length);
      kept.forEach((idx) => valid.add(idx));
      return kept.map((idx) => `[${idx}]`).join(''); // hallucinated labels -> removed
    })
    .replace(/[ \t]+([.,;])/g, '$1')
    .trim();

  if (valid.size === 0) {
    return { status: 'insufficient', answer: NOT_ENOUGH_INFO,
             reason: 'LLM answer had no valid citation to a retrieved chunk.',
             citations: [], chunks, raw_llm_output: raw };
  }

  const citations = [...valid].sort((a, b) => a - b).map((marker) => {
    const c = chunks[marker - 1];
    return { marker, chunk_id: c.chunk_id, document_id: c.document_id, title: c.title,
             version: c.version, chunk_index: c.chunk_index };
  });
  return { status: 'answered', answer, citations, chunks, raw_llm_output: raw };
}
