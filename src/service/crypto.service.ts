import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const IV_LENGTH = 16;
const KEY_LENGTH = 32;

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly encryptionKey: string;

  constructor(private readonly configService: ConfigService) {
    this.encryptionKey =
      this.configService.get<string>('ENCRYPTION_KEY') ||
      'default-encryption-key-32-char-long!';
    this.logger.log('Crypto service initialized');
  }

  private getKey(): Buffer {
    return crypto.scryptSync(this.encryptionKey, 'salt', KEY_LENGTH);
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = this.getKey();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  decrypt(text: string): string {
    const [ivString, encryptedText] = text.split(':');
    if (!ivString || !encryptedText || ivString.length !== IV_LENGTH * 2) {
      throw new Error('Invalid encrypted text format');
    }

    const iv = Buffer.from(ivString, 'hex');
    const encrypted = Buffer.from(encryptedText, 'hex');
    const key = this.getKey();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }
}
