import { Injectable, Logger } from '@nestjs/common';
import { Ollama } from 'ollama';

@Injectable()
export class AiSummaryService {
  private readonly ollama: Ollama;
  private readonly logger = new Logger(AiSummaryService.name);

  constructor() {
    this.ollama = new Ollama({ host: 'http://localhost:11434' });
  }

  formatLogForAI(messages: Array<{ date: Date; message: string }>): string {
    return messages
      .map((msg) => `[${msg.date.toISOString()}] ${msg.message}`)
      .join('\n');
  }

  async generatePsychologicalSummary(logContent: string): Promise<string> {
    try {
      const prompt = `Ensure response in format of {response:response} only. You are an expert psychologist. Analyze the following log and provide a psychological summary.\nFocus on emotional patterns, potential stressors, and overall mental well-being. Be concise but insightful.\n\nLog:\n${logContent}\n\nAnalysis:`;

      const response = await this.ollama.generate({
        model: 'gemma3:12b',
        prompt,
        format: 'json',
        stream: false,
      });

      this.logger.log('Psychological analysis response:', response['response']);

      return response.response.trim();
    } catch (error) {
      this.logger.error('Error generating psychological summary:', error);
      throw new Error('Failed to generate psychological analysis');
    }
  }
}
