import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import { MessageLogService } from './message-log.service';
import { AiSummaryService } from './ai-summary.service';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly bot: TelegramBot;
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly messageLogService: MessageLogService,
    private readonly aiSummaryService: AiSummaryService,
  ) {
    // Initialize the bot with the token from environment variable
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
    }
    this.bot = new TelegramBot(botToken, { polling: true });

    this.logger.log('Telegram bot service initialized');
  }

  onModuleInit() {
    // Set up message handler when module initializes
    this.setupMessageHandler();
    this.logger.log('Telegram bot message handler set up');
  }

  async summarizeCaptainLog(chatId: number): Promise<void> {
    try {
      await this.bot.sendChatAction(chatId, 'typing');
      const messages = await this.messageLogService.readMessages();

      if (messages.length === 0) {
        await this.bot.sendMessage(chatId, "Captain's log is empty.");
        return;
      }

      const logContent = this.aiSummaryService.formatLogForAI(messages);

      // Send initial message
      const processingMessage = await this.bot.sendMessage(
        chatId,
        '🔍 Holodeck Dan is on the case, Captain!',
        { parse_mode: 'Markdown' },
      );

      try {
        // Generate the psychological summary
        const summary =
          await this.aiSummaryService.generatePsychologicalSummary(logContent);

        // Edit the original message with the summary
        await this.bot.editMessageText(
          `🧠 *Psychological Analysis*\n\n${summary}`,
          {
            chat_id: chatId,
            message_id: processingMessage.message_id,
            parse_mode: 'Markdown',
          },
        );
      } catch (error) {
        // If analysis fails, fall back to basic log display
        this.logger.error('Error in psychological analysis:', error);
        await this.bot.editMessageText(
          `⚠️ Couldn't generate analysis. Here's the raw log:\n\n${logContent}`,
          {
            chat_id: chatId,
            message_id: processingMessage.message_id,
            parse_mode: 'Markdown',
          },
        );
      }
    } catch (error) {
      this.logger.error('Error summarizing log:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Error processing your request. Please try again later.',
        { parse_mode: 'Markdown' },
      );
    }
  }

  private setupMessageHandler() {
    // Listen for any message
    this.bot.on('message', async (msg) => {
      this.logger.log('Received a message', msg);
      const chatId = msg.chat.id;
      const messageText = msg.text || 'No text content';

      this.logger.log(
        `Received message: ${messageText} from chat ID: ${chatId}`,
      );

      if (msg.text?.toLowerCase().includes(`summarize captain's log`)) {
        await this.summarizeCaptainLog(chatId);
        return;
      }

      // Save message to file
      await this.messageLogService.appendMessage(msg);

      // Echo the message back
      await this.bot.sendMessage(chatId, `Message received, captain!`);
    });
  }
}
