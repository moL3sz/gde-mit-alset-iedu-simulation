import type { AgentProfile } from '../@types';
import { buildTeacherSystemPrompt } from '../shared/prompts';
import { limitToSentences } from '../shared/text';
import type { Agent, AgentRunContext, AgentRunInput, AgentRunResult } from './Agent';

export class TeacherAgent implements Agent {
  public readonly id: string;
  public readonly kind = 'teacher' as const;
  public readonly name: string;

  public constructor(profile: AgentProfile) {
    this.id = profile.id;
    this.name = profile.name;
  }

  public async run(input: AgentRunInput, context: AgentRunContext): Promise<AgentRunResult> {
    const systemPrompt = buildTeacherSystemPrompt(context.topic, input.session.mode);
    const llmResult = await context.llm.generateChatCompletion({
      systemPrompt,
      userPrompt: input.teacherOrUserMessage,
      temperature: 0.35,
    });
    const message =
      limitToSentences(llmResult.text, 10) ||
      'Let us reset with one concise step, then check understanding.';

    context.emitToken(message.split(/\s+/).slice(0, 8).join(' '));

    return {
      message,
      metadata: {
        model: llmResult.model,
        provider: llmResult.provider,
        persona: this.kind,
      },
    };
  }
}
