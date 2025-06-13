import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramService } from './service/telegram.service';
import { CryptoService } from './service/crypto.service';
import { MessageLogService } from './service/message-log.service';
import { AiSummaryService } from './service/ai-summary.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Make config available throughout the application
      envFilePath: '.env', // Default .env file path
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    CryptoService,
    MessageLogService,
    AiSummaryService,
    TelegramService,
  ],
})
export class AppModule {}
