import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramService } from './service/telegram.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Make config available throughout the application
      envFilePath: '.env', // Default .env file path
    }),
  ],
  controllers: [AppController],
  providers: [AppService, TelegramService],
})
export class AppModule {}
