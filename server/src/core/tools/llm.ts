import { logger } from '../shared/logger';

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

interface OpenAiResponsesSuccess {
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

const extractOpenAiText = (payload: unknown): string => {
  if (typeof payload !== 'object' || payload === null) {
    return '';
  }

  const response = payload as OpenAiResponsesSuccess;

  if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text.trim();
  }

  const chunks =
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => (typeof content.text === 'string' ? content.text.trim() : ''))
      .filter(Boolean) ?? [];

  return chunks.join('\n').trim();
};

const extractOpenAiModel = (payload: unknown): string | undefined => {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const response = payload as OpenAiResponsesSuccess;
  if (typeof response.model === 'string' && response.model.trim().length > 0) {
    return response.model.trim();
  }

  return undefined;
};

class OpenAiLlmTool implements LlmTool {
  private static readonly ENDPOINT = 'https://api.openai.com/v1/responses';

  public constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fallback: LlmTool,
  ) {}

  public async generateChatCompletion(
    input: GenerateChatCompletionInput,
  ): Promise<GenerateChatCompletionOutput> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(OpenAiLlmTool.ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: input.temperature ?? 0.4,
          max_output_tokens: input.maxTokens ?? 350,
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
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        logger.warn('openai_completion_failed', {
          status: response.status,
          statusText: response.statusText,
          body: body.slice(0, 500),
        });
        return this.fallback.generateChatCompletion(input);
      }

      const data = (await response.json()) as unknown;
      const text = extractOpenAiText(data);

      if (!text) {
        logger.warn('openai_completion_empty');
        return this.fallback.generateChatCompletion(input);
      }

      return {
        text,
        model: extractOpenAiModel(data) ?? this.model,
        provider: 'openai',
      };
    } catch (error: unknown) {
      logger.warn('openai_completion_exception', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.fallback.generateChatCompletion(input);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const createLlmTool = (
  apiKey?: string,
  model = 'gpt-4.1-mini',
): LlmTool => {
  const fallback = new DeterministicMockLlmTool();

  if (!apiKey) {
    return fallback;
  }

  return new OpenAiLlmTool(apiKey, model, fallback);
};

export const createDeterministicMockLlmTool = (): LlmTool => {
  return new DeterministicMockLlmTool();
};

export const createOpenAiLlmTool = (apiKey: string, model = 'gpt-4.1-mini'): LlmTool => {
  return new OpenAiLlmTool(apiKey, model, new DeterministicMockLlmTool());
};
