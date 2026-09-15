import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  // Contract-first, continued: Sprint 7 wrote the OpenAPI spec BEFORE the
  // code (Module 5). Here the spec is generated FROM the code instead -
  // the two approaches meet at the same destination, a real OpenAPI
  // document at /api-json, with a browsable UI at /api.
  const config = new DocumentBuilder()
    .setTitle("Sprint 8 Auth Service")
    .setDescription("Registration, login, and JWT issuance for the mission service")
    .setVersion("1.0")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  await app.listen(3000);
  console.log("Listening on http://localhost:3000");
  console.log("OpenAPI docs at http://localhost:3000/api");
}

bootstrap();
