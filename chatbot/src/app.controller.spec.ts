import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    // A testing module is a mini Nest app. We replace AppService with a fake
    // (useValue) so the test doesn't need a real database connection.
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHealth: () => ({ status: 'ok', database: 'connected', uptimeSeconds: 5 }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('GET /health returns the health status', () => {
    expect(appController.getHealth()).toEqual({
      status: 'ok',
      database: 'connected',
      uptimeSeconds: 5,
    });
  });
});
