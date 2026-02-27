import type { AgentProfile } from '../@types';
import { buildDebateCoachPrompt } from '../shared/prompts';
import type { Agent, AgentRunContext, AgentRunInput, AgentRunResult } from './Agent';

export class DebateCoachAgent implements Agent {
  public readonly id: string;
  public readonly kind = 'debate_coach' as const;
  public readonly name: string;

  public constructor(profile: AgentProfile) {
    this.id = profile.id;
    this.name = profile.name;
  }

  public async run(input: AgentRunInput, context: AgentRunContext): Promise<AgentRunResult> {
    const systemPrompt = buildDebateCoachPrompt(context.topic);
    const llmResult = await context.llm.generateChatCompletion({
      systemPrompt,
      userPrompt: input.teacherOrUserMessage,
      temperature: 0.3,
    });

    const message = `Counterpoint: ${llmResult.text} What evidence best supports your strongest claim?`;
    context.emitToken(message.split(' ').slice(0, 7).join(' '));

    return {
      message,
      metadata: {
        model: llmResult.model,
        provider: llmResult.provider,
      },
    };
  }
}
