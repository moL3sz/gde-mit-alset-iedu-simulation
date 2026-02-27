export interface GenerateChatCompletionInput {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateChatCompletionOutput {
  text: string;
  model: string;
  provider: 'mock' | 'stub-keyed';
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

class KeyedStubLlmTool implements LlmTool {
  private readonly fallback = new DeterministicMockLlmTool();

  public constructor(private readonly apiKey: string) {}

  public async generateChatCompletion(
    input: GenerateChatCompletionInput,
  ): Promise<GenerateChatCompletionOutput> {
    const result = await this.fallback.generateChatCompletion(input);

    return {
      ...result,
      text: `${result.text} [keyed:${this.apiKey.slice(0, 4)}]`,
      model: 'stub-keyed-v1',
      provider: 'stub-keyed',
    };
  }
}

export const createLlmTool = (apiKey?: string): LlmTool => {
  if (!apiKey) {
    return new DeterministicMockLlmTool();
  }

  return new KeyedStubLlmTool(apiKey);
};
