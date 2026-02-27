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
  provider: 'mock' | 'azure_openai';
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

const DEFAULT_COMPLETION_TOKENS = 300;
const MIN_COMPLETION_TOKENS = 64;
const MAX_COMPLETION_TOKENS = 1200;
const RECOVERY_COMPLETION_TOKENS = 220;

const stableHash = (value: string): number => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
};

const clampCompletionTokens = (requested?: number): number => {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return DEFAULT_COMPLETION_TOKENS;
  }

  return Math.max(
    MIN_COMPLETION_TOKENS,
    Math.min(MAX_COMPLETION_TOKENS, Math.floor(requested)),
  );
};

const calculateRetryTokens = (baseMaxTokens: number): number => {
  return Math.max(
    baseMaxTokens,
    Math.min(
      MAX_COMPLETION_TOKENS,
      Math.max(baseMaxTokens + 120, Math.floor(baseMaxTokens * 1.5)),
    ),
  );
};

const toSingleLine = (value: string): string => {
  return value.replace(/\s+/g, ' ').trim();
};

const truncateText = (value: string, maxLength: number): string => {
  const normalized = toSingleLine(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
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

const normalizeAzureBaseUrl = (endpoint: string): string => {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (/\/openai\/v1$/i.test(trimmed)) {
    return `${trimmed}/`;
  }

  return `${trimmed}/openai/v1/`;
};

interface OpenAiChatCompletionContentPart {
  type?: string;
  text?: string;
}

interface OpenAiChatCompletionResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | OpenAiChatCompletionContentPart[] | null;
    };
  }>;
}

interface OpenAiClient {
  chat: {
    completions: {
      create(input: {
        model: string;
        max_completion_tokens?: number;
        reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
        messages: Array<{
          role: 'system' | 'user' | 'developer';
          content: string;
        }>;
      }): Promise<OpenAiChatCompletionResponse>;
    };
  };
}

interface OpenAiCtor {
  new (config: { apiKey: string; baseURL: string; timeout?: number }): OpenAiClient;
}

const loadOpenAiCtor = (): OpenAiCtor | undefined => {
  try {
    const moduleValue = require('openai') as OpenAiCtor | { default?: OpenAiCtor };
    const ctor =
      typeof moduleValue === 'function' ? moduleValue : moduleValue.default;

    if (typeof ctor === 'function') {
      return ctor;
    }

    return undefined;
  } catch (error: unknown) {
    logger.warn('openai_sdk_unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
};

const extractAzureOpenAiText = (
  completion: OpenAiChatCompletionResponse,
): string => {
  const content = completion.choices?.[0]?.message?.content;

  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const chunks = content
    .map((part) => {
      if ('type' in part && part.type === 'text' && typeof part.text === 'string') {
        return part.text.trim();
      }
      return '';
    })
    .filter(Boolean);

  return chunks.join('\n').trim();
};

class AzureOpenAiLlmTool implements LlmTool {
  private readonly baseUrl: string;
  private readonly client: OpenAiClient | undefined;

  public constructor(
    private readonly apiKey: string,
    endpoint: string,
    private readonly deployment: string,
    private readonly model: string,
    private readonly fallback: LlmTool,
  ) {
    this.baseUrl = normalizeAzureBaseUrl(endpoint);
    const openAiCtor = loadOpenAiCtor();
    this.client = openAiCtor
      ? new openAiCtor({
          apiKey,
          baseURL: this.baseUrl,
          timeout: 30_000,
        })
      : undefined;
  }

  public async generateChatCompletion(
    input: GenerateChatCompletionInput,
  ): Promise<GenerateChatCompletionOutput> {
    if (!this.client) {
      return this.generateWithFetch(input);
    }

    const baseMaxTokens = clampCompletionTokens(input.maxTokens);

    try {
      let completion = await this.client.chat.completions.create(
        this.buildCompletionRequest(input, baseMaxTokens, false),
      );
      let text = extractAzureOpenAiText(completion);

      const wasLengthTruncated = completion.choices?.[0]?.finish_reason === 'length';
      if (!text && wasLengthTruncated) {
        const retryMaxTokens = calculateRetryTokens(baseMaxTokens);
        logger.warn('azure_openai_completion_truncated_retry', {
          deployment: this.deployment,
          transport: 'openai_sdk',
          baseMaxTokens,
          retryMaxTokens,
        });

        completion = await this.client.chat.completions.create(
          this.buildCompletionRequest(input, retryMaxTokens, false),
        );
        text = extractAzureOpenAiText(completion);
      }

      const stillLengthTruncated = completion.choices?.[0]?.finish_reason === 'length';
      if (!text && stillLengthTruncated) {
        logger.warn('azure_openai_completion_recovery_attempt', {
          deployment: this.deployment,
          transport: 'openai_sdk',
          recoveryMaxTokens: RECOVERY_COMPLETION_TOKENS,
        });
        completion = await this.client.chat.completions.create(
          this.buildCompletionRequest(input, RECOVERY_COMPLETION_TOKENS, true),
        );
        text = extractAzureOpenAiText(completion);
      }

      if (!text) {
        logger.warn('azure_openai_completion_empty', {
          deployment: this.deployment,
          finishReason: completion.choices?.[0]?.finish_reason ?? null,
        });
        return this.fallback.generateChatCompletion(input);
      }

      return {
        text,
        model: completion.model?.trim() || this.model,
        provider: 'azure_openai',
      };
    } catch (error: unknown) {
      const maybeStatus =
        typeof (error as { status?: unknown })?.status === 'number'
          ? (error as { status: number }).status
          : undefined;
      logger.warn('azure_openai_completion_failed', {
        status: maybeStatus,
        error: error instanceof Error ? error.message : String(error),
        deployment: this.deployment,
        transport: 'openai_sdk',
      });
      return this.generateWithFetch(input);
    }
  }

  private async generateWithFetch(
    input: GenerateChatCompletionInput,
  ): Promise<GenerateChatCompletionOutput> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    const baseMaxTokens = clampCompletionTokens(input.maxTokens);

    try {
      let response = await fetch(`${this.baseUrl}chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildCompletionRequest(input, baseMaxTokens, false)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        logger.warn('azure_openai_completion_failed', {
          status: response.status,
          statusText: response.statusText,
          body: body.slice(0, 500),
          deployment: this.deployment,
          transport: 'fetch',
        });
        return this.fallback.generateChatCompletion(input);
      }

      let completion = (await response.json()) as OpenAiChatCompletionResponse;
      let text = extractAzureOpenAiText(completion);
      const wasLengthTruncated = completion.choices?.[0]?.finish_reason === 'length';

      if (!text && wasLengthTruncated) {
        const retryMaxTokens = calculateRetryTokens(baseMaxTokens);
        logger.warn('azure_openai_completion_truncated_retry', {
          deployment: this.deployment,
          transport: 'fetch',
          baseMaxTokens,
          retryMaxTokens,
        });

        response = await fetch(`${this.baseUrl}chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(this.buildCompletionRequest(input, retryMaxTokens, false)),
          signal: controller.signal,
        });

        if (response.ok) {
          completion = (await response.json()) as OpenAiChatCompletionResponse;
          text = extractAzureOpenAiText(completion);
        } else {
          const body = await response.text();
          logger.warn('azure_openai_completion_retry_failed', {
            status: response.status,
            statusText: response.statusText,
            body: body.slice(0, 500),
            deployment: this.deployment,
            transport: 'fetch',
          });
        }
      }

      const stillLengthTruncated = completion.choices?.[0]?.finish_reason === 'length';
      if (!text && stillLengthTruncated) {
        logger.warn('azure_openai_completion_recovery_attempt', {
          deployment: this.deployment,
          transport: 'fetch',
          recoveryMaxTokens: RECOVERY_COMPLETION_TOKENS,
        });

        response = await fetch(`${this.baseUrl}chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(
            this.buildCompletionRequest(input, RECOVERY_COMPLETION_TOKENS, true),
          ),
          signal: controller.signal,
        });

        if (response.ok) {
          completion = (await response.json()) as OpenAiChatCompletionResponse;
          text = extractAzureOpenAiText(completion);
        } else {
          const body = await response.text();
          logger.warn('azure_openai_completion_recovery_failed', {
            status: response.status,
            statusText: response.statusText,
            body: body.slice(0, 500),
            deployment: this.deployment,
            transport: 'fetch',
          });
        }
      }

      if (!text) {
        logger.warn('azure_openai_completion_empty', {
          deployment: this.deployment,
          transport: 'fetch',
          finishReason: completion.choices?.[0]?.finish_reason ?? null,
        });
        return this.fallback.generateChatCompletion(input);
      }

      return {
        text,
        model: completion.model?.trim() || this.model,
        provider: 'azure_openai',
      };
    } catch (error: unknown) {
      logger.warn('azure_openai_completion_failed', {
        error: error instanceof Error ? error.message : String(error),
        deployment: this.deployment,
        transport: 'fetch',
      });
      return this.fallback.generateChatCompletion(input);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildCompletionRequest(
    input: GenerateChatCompletionInput,
    maxTokens: number,
    recoveryMode: boolean,
  ): {
    model: string;
    max_completion_tokens: number;
    reasoning_effort?: 'minimal';
    messages: Array<{
      role: 'system' | 'user' | 'developer';
      content: string;
    }>;
  } {
    const messages = recoveryMode
      ? [
          {
            role: 'developer' as const,
            content: 'Return plain text only, maximum 2 short sentences.',
          },
          {
            role: 'system' as const,
            content: truncateText(input.systemPrompt, 700),
          },
          {
            role: 'user' as const,
            content: truncateText(input.userPrompt, 900),
          },
        ]
      : [
          {
            role: 'system' as const,
            content: input.systemPrompt,
          },
          {
            role: 'user' as const,
            content: input.userPrompt,
          },
        ];

    const request: {
      model: string;
      max_completion_tokens: number;
      reasoning_effort?: 'minimal';
      messages: Array<{
        role: 'system' | 'user' | 'developer';
        content: string;
      }>;
    } = {
      model: this.deployment,
      max_completion_tokens: clampCompletionTokens(maxTokens),
      messages,
    };

    if (/gpt-5/i.test(this.deployment)) {
      request.reasoning_effort = 'minimal';
    }

    return request;
  }
}

export interface CreateLlmToolInput {
  azureApiKey?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  model?: string;
}

export const createLlmTool = (input: CreateLlmToolInput): LlmTool => {
  const fallback = new DeterministicMockLlmTool();

  if (!input.azureApiKey || !input.azureEndpoint || !input.azureDeployment) {
    return fallback;
  }

  return new AzureOpenAiLlmTool(
    input.azureApiKey,
    input.azureEndpoint,
    input.azureDeployment,
    input.model ?? 'gpt-5-mini',
    fallback,
  );
};

export const createDeterministicMockLlmTool = (): LlmTool => {
  return new DeterministicMockLlmTool();
};

export const createAzureOpenAiLlmTool = (
  azureApiKey: string,
  azureEndpoint: string,
  azureDeployment: string,
  options?: {
    model?: string;
  },
): LlmTool => {
  return new AzureOpenAiLlmTool(
    azureApiKey,
    azureEndpoint,
    azureDeployment,
    options?.model ?? 'gpt-5-mini',
    new DeterministicMockLlmTool(),
  );
};
