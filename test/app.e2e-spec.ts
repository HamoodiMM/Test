import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// End-to-end tests: start the REAL app (real modules, real database connection from .env)
// and send real HTTP requests to it with supertest. No Gemini calls are made here.
describe('Chatbot API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public and reports the database', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.database).toBe('connected');
      });
  });

  it('POST /chat without a token is rejected with 401 AUTH_TOKEN_MISSING', () => {
    return request(app.getHttpServer()).post('/chat').send({ message: 'hi' }).expect(401);
  });

  it('GET /conversations with a fake token is rejected with 401', () => {
    return request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', 'Bearer not.a.real.token')
      .expect(401);
  });
});
