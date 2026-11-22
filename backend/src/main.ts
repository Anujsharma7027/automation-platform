import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { processRole } from './workflows/process-role';

async function bootstrap() {
  if (processRole() === 'worker') {
    // Background workers only (trigger polling + workflow execution), no HTTP server.
    const context = await NestFactory.createApplicationContext(AppModule);
    context.enableShutdownHooks();
    return;
  }
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // Lets BullMQ workers finish their current job on SIGTERM.
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}
void bootstrap();
