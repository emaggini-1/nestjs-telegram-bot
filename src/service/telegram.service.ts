import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Ollama } from 'ollama';

// Encryption configuration
const IV_LENGTH = 16; // For AES, this is always 16
const KEY_LENGTH = 32; // 256 bits for AES-256

// Generate a secure key from the passphrase
function getKey(encryptionKey: string): Buffer {
  return crypto.scryptSync(encryptionKey, 'salt', KEY_LENGTH);
}

// Encryption/Decryption utilities
function encrypt(text: string, encryptionKey: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey(encryptionKey);

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(text: string, encryptionKey: string): string {
  const [ivString, encryptedText] = text.split(':');
  if (!ivString || !encryptedText || ivString.length !== IV_LENGTH * 2) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(ivString, 'hex');
  const encrypted = Buffer.from(encryptedText, 'hex');
  const key = getKey(encryptionKey);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly bot: TelegramBot;
  private readonly ollama: Ollama;
  private readonly logger = new Logger(TelegramService.name);
  private readonly encryptionKey: string;

  constructor(private readonly configService: ConfigService) {
    // Initialize the bot with the token from environment variable
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
    }
    this.bot = new TelegramBot(botToken, { polling: true });

    this.encryptionKey =
      this.configService.get<string>('ENCRYPTION_KEY') ||
      'default-encryption-key-32-char-long!';

    // Initialize Ollama
    this.ollama = new Ollama({ host: 'http://localhost:11434' });
    this.logger.log('Telegram bot service initialized');
    this.logger.log('Encryption key:', this.encryptionKey);
  }

  onModuleInit() {
    // Set up message handler when module initializes
    this.setupMessageHandler();
    this.logger.log('Telegram bot message handler set up');
  }

  private async readEncryptedFile<T>(filePath: string): Promise<T | null> {
    try {
      const encryptedContent = await fs.readFile(filePath, 'utf-8');
      const decryptedContent = decrypt(encryptedContent, this.encryptionKey);
      return JSON.parse(decryptedContent) as T;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code !== 'ENOENT'
      ) {
        this.logger.error('Error reading encrypted file:', error);
      }
      return null;
    }
  }

  private async writeEncryptedFile(
    filePath: string,
    data: unknown,
  ): Promise<void> {
    try {
      const jsonContent = JSON.stringify(data, null, 2);
      const encryptedContent = encrypt(jsonContent, this.encryptionKey);
      await fs.writeFile(filePath, encryptedContent, 'utf-8');
    } catch (error) {
      this.logger.error('Error writing encrypted file:', error);
      throw error;
    }
  }

  private async readMessages(): Promise<
    Array<{ date: Date; message: string }>
  > {
    const messagesPath = path.join(process.cwd(), 'messages.json');
    const messages =
      await this.readEncryptedFile<Array<{ date: string; message: string }>>(
        messagesPath,
      );
    return (
      messages?.map((msg) => ({
        date: new Date(msg.date),
        message: msg.message,
      })) || []
    );
  }

  private async appendMessageToFile(msg: TelegramBot.Message) {
    try {
      const messagesPath = path.join(process.cwd(), 'messages.json');
      const messages = await this.readMessages();

      // Add new message
      messages.push({
        date: new Date(msg.date * 1000), // Convert from Unix timestamp to Date
        message: msg.text || 'No text content',
      });

      // Write back to file
      await this.writeEncryptedFile(messagesPath, messages);
      this.logger.log('Message saved to file');
    } catch (error) {
      this.logger.error('Error saving message to file:', error);
    }
  }

  private formatLogForAI(
    messages: Array<{ date: Date; message: string }>,
  ): string {
    return messages
      .map((msg) => `[${msg.date.toISOString()}] ${msg.message}`)
      .join('\n');
  }

  private async generatePsychologicalSummary(
    logContent: string,
  ): Promise<string> {
    try {
      const prompt = `You are an expert psychologist. Analyze the following log and provide a psychological summary. 
Focus on emotional patterns, potential stressors, and overall mental well-being. Be concise but insightful.

Log:\n${logContent}\n\nAnalysis:`;

      const response = await this.ollama.generate({
        model: 'llama3.3',
        prompt: prompt,
        format: 'json',
        stream: false,
      });

      this.logger.log('Psychological analysis response:', response);

      return response.response.trim();
    } catch (error) {
      this.logger.error('Error generating psychological summary:', error);
      throw new Error('Failed to generate psychological analysis');
    }
  }

  async summarizeCaptainLog(chatId: number): Promise<void> {
    try {
      await this.bot.sendChatAction(chatId, 'typing');
      const messages = await this.readMessages();

      if (messages.length === 0) {
        await this.bot.sendMessage(chatId, "Captain's log is empty.");
        return;
      }

      const logContent = this.formatLogForAI(messages);

      // Send initial message
      const processingMessage = await this.bot.sendMessage(
        chatId,
        '🔍 Analyzing the log with psychological expertise...',
        { parse_mode: 'Markdown' },
      );

      try {
        // Generate the psychological summary
        const summary = await this.generatePsychologicalSummary(logContent);

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
      await this.appendMessageToFile(msg);

      // Echo the message back
      await this.bot.sendMessage(chatId, `Echo: ${messageText}`);
    });
  }
}
