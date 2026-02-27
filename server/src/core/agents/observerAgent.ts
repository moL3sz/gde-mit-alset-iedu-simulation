import type { AgentProfile, SessionMetrics, Turn } from '../@types';
import { buildObserverPrompt } from '../shared/prompts';
import type { Agent, AgentRunContext, AgentRunInput, AgentRunResult } from './Agent';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const countMisconceptions = (turns: Turn[]): number => {
  return turns.reduce((count, turn) => {
    if (/not sure|confused|wrong|misunderstand/i.test(turn.content)) {
      return count + 1;
    }

    return count;
  }, 0);
};

const calculateStudentStateAverages = (
  agents: AgentRunInput['session']['agents'],
): NonNullable<SessionMetrics['studentStateAverages']> => {
  const students = agents.filter((agent) => agent.kind.startsWith('student_'));

  if (students.length === 0) {
    return {
      attention: 0,
      boredom: 0,
      fatigue: 0,
      knowledgeRetention: 0,
    };
  }

  const sums = students.reduce(
    (acc, student) => {
      return {
        attention: acc.attention + student.state.attention,
        boredom: acc.boredom + student.state.boredom,
        fatigue: acc.fatigue + student.state.fatigue,
        knowledgeRetention: acc.knowledgeRetention + student.state.knowledgeRetention,
      };
    },
    {
      attention: 0,
      boredom: 0,
      fatigue: 0,
      knowledgeRetention: 0,
    },
  );

  return {
    attention: Number((sums.attention / students.length).toFixed(2)),
    boredom: Number((sums.boredom / students.length).toFixed(2)),
    fatigue: Number((sums.fatigue / students.length).toFixed(2)),
    knowledgeRetention: Number((sums.knowledgeRetention / students.length).toFixed(2)),
  };
};

export class ObserverAgent implements Agent {
  public readonly id: string;
  public readonly kind = 'observer' as const;
  public readonly name: string;

  public constructor(profile: AgentProfile) {
    this.id = profile.id;
    this.name = profile.name;
  }

  public async run(input: AgentRunInput, context: AgentRunContext): Promise<AgentRunResult> {
    const systemPrompt = buildObserverPrompt(context.topic);
    const llmResult = await context.llm.generateChatCompletion({
      systemPrompt,
      userPrompt: input.teacherOrUserMessage,
      temperature: 0.2,
    });

    const studentTurns = input.recentTurns.filter((turn) => turn.role === 'agent');
    const respondingAgents = new Set(studentTurns.map((turn) => turn.agentId).filter(Boolean));
    const engagement = clamp(40 + respondingAgents.size * 15, 0, 100);
    const clarity = clamp(55 + Math.min(studentTurns.length, 3) * 10, 0, 100);
    const misconceptionsDetected = countMisconceptions(studentTurns);
    const studentStateAverages = calculateStudentStateAverages(input.session.agents);

    const message = `Observer feedback: ${llmResult.text} Engagement=${engagement}, Clarity=${clarity}, Misconceptions=${misconceptionsDetected}, AvgBoredom=${studentStateAverages.boredom}, AvgFatigue=${studentStateAverages.fatigue}, AvgRetention=${studentStateAverages.knowledgeRetention}.`;

    return {
      message,
      metricsPatch: {
        engagement,
        clarity,
        misconceptionsDetected,
        studentStateAverages,
      },
      metadata: {
        model: llmResult.model,
        provider: llmResult.provider,
      },
    };
  }
}
