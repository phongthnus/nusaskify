import { Ollama } from 'ollama';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';

const ollama = new Ollama({ host: config.ollamaHost });

const hint = (model: string, e: unknown) => {
  const msg = (e as Error).message;
  if (/fetch failed|ECONNREFUSED/i.test(msg)) return `cannot reach Ollama at ${config.ollamaHost} (is \`ollama serve\` running?)`;
  if (/not found/i.test(msg)) return `${msg} (run \`ollama pull ${model}\`)`;
  return msg;
};
const BATCH = 32;

/** Embeds texts with the ONE embedding model used for chunking, indexing and querying. */
export async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    let res;
    try {
      res = await ollama.embed({ model: config.embedModel, input: texts.slice(i, i + BATCH) });
    } catch (e) {
      throw new HttpError(502, `Embedding model "${config.embedModel}" failed: ${hint(config.embedModel, e)}`);
    }
    out.push(...res.embeddings);
  }
  const bad = out.find((v) => v.length !== config.embedDim);
  if (bad) {
    throw new HttpError(
      500,
      `Embedding dimension ${bad.length} != EMBED_DIM ${config.embedDim}. Fix EMBED_DIM for ${config.embedModel}.`,
    );
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}

export async function chat(system: string, user: string): Promise<string> {
  try {
    const res = await ollama.chat({
      model: config.chatModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      options: { temperature: 0 },
    });
    // Some qwen3 variants emit <think>…</think>; never show it to the user.
    return res.message.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } catch (e) {
    throw new HttpError(502, `Chat model "${config.chatModel}" failed: ${hint(config.chatModel, e)}`);
  }
}
