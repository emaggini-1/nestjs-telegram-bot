import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import TelegramBot from 'node-telegram-bot-api';
import { CryptoService } from './crypto.service';

@Injectable()
export class MessageLogService {
  private readonly logger = new Logger(MessageLogService.name);
  private readonly messagesPath = path.join(process.cwd(), 'messages.json');

  constructor(private readonly cryptoService: CryptoService) {}

  private async readEncryptedFile<T>(filePath: string): Promise<T | null> {
    try {
      const encryptedContent = await fs.readFile(filePath, 'utf-8');
      const decryptedContent = this.cryptoService.decrypt(encryptedContent);
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
      const encryptedContent = this.cryptoService.encrypt(jsonContent);
      await fs.writeFile(filePath, encryptedContent, 'utf-8');
    } catch (error) {
      this.logger.error('Error writing encrypted file:', error);
      throw error;
    }
  }

  async readMessages(): Promise<Array<{ date: Date; message: string }>> {
    const messages = await this.readEncryptedFile<
      Array<{ date: string; message: string }>
    >(this.messagesPath);
    return (
      messages?.map((msg) => ({
        date: new Date(msg.date),
        message: msg.message,
      })) || []
    );
  }

  async appendMessage(msg: TelegramBot.Message): Promise<void> {
    try {
      const messages = await this.readMessages();
      messages.push({
        date: new Date(msg.date * 1000),
        message: msg.text || 'No text content',
      });
      await this.writeEncryptedFile(this.messagesPath, messages);
      this.logger.log('Message saved to file');
    } catch (error) {
      this.logger.error('Error saving message to file:', error);
    }
  }
}
