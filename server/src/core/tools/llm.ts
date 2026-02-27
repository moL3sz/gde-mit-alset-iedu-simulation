export interface GenerateChatCompletionInput {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateChatCompletionOutput {
  text: string;
  model: string;
  provider: 'mock' | 'openai';
}

export interface LlmTool {
  generateChatCompletion(input: GenerateChatCompletionInput): Promise<GenerateChatCompletionOutput>;
}

const DEFAULT_PHRASES = [
  'I understand the core idea and can build on it.',
  'I need one more concrete example to fully apply this.',
  'I can answer this, but I want to verify one assumption first.',
  'This is clear, and I can connect it to a real scenario.',
];

const FOLLOW_UPS = [
  'Could we test this with a short example?',
  'Can you show how this changes in an exam setting?',
  'What is the most common mistake here?',
  'Can we compare this with an alternative strategy?',
];

const stableHash = (value: string): number => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
};

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

interface OpenAiTextContentItem {
  type?: string;
  text?: string;
}

interface OpenAiOutputItem {
  content?: OpenAiTextContentItem[];
}

interface OpenAiResponsePayload {
  output_text?: string;
  output?: OpenAiOutputItem[];
}

class DeterministicMockLlmTool implements LlmTool {
  public generateChatCompletion(
    input: GenerateChatCompletionInput,
  ): Promise<GenerateChatCompletionOutput> {
    const fingerprint = stableHash(`${input.systemPrompt}|${input.userPrompt}`);
    const phrase = DEFAULT_PHRASES[fingerprint % DEFAULT_PHRASES.length] ?? DEFAULT_PHRASES[0];
    const followUp = FOLLOW_UPS[fingerprint % FOLLOW_UPS.length] ?? FOLLOW_UPS[0];
    const marker = fingerprint.toString(16).slice(0, 6);

    return Promise.resolve({
      text: `${phrase} ${followUp} [mock-${marker}]`,
      model: 'deterministic-mock-v1',
      provider: 'mock',
    });
  }
}

const extractOpenAiOutputText = (payload: OpenAiResponsePayload): string => {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload.output)) {
    return '';
  }

  const textParts = payload.output.flatMap((item) => {
    if (!Array.isArray(item.content)) {
      return [];
    }

    return item.content
      .filter((content) => content.type === 'output_text' && typeof content.text === 'string')
      .map((content) => content.text?.trim() ?? '')
      .filter(Boolean);
  });

  return textParts.join('\n').trim();
};

class OpenAiLlmTool implements LlmTool {
  public constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_OPENAI_MODEL,
  ) {}

  public async generateChatCompletion(
    input: GenerateChatCompletionInput,
  ): Promise<GenerateChatCompletionOutput> {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: input.systemPrompt }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: input.userPrompt }],
          },
        ],
        temperature: input.temperature ?? 0.35,
        max_output_tokens: input.maxTokens ?? 220,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI request failed (${response.status}): ${errorBody.slice(0, 500)}`,
      );
    }

    const payload = (await response.json()) as OpenAiResponsePayload;
    const text = extractOpenAiOutputText(payload);

    return {
      text:
        text ||
        'I can continue, but no text was returned from the language model for this turn.',
      model: this.model,
      provider: 'openai',
    };
  }
}

export const createLlmTool = (apiKey?: string, model = DEFAULT_OPENAI_MODEL): LlmTool => {
  if (!apiKey) {
    return new DeterministicMockLlmTool();
  }

  return new OpenAiLlmTool(apiKey, model);
};
