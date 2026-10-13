import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  database: string;
  uptimeSeconds: number;
}

// Mongoose connection states: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
const CONNECTED = 1;

@Injectable()
export class AppService {
  // @InjectConnection gives us the MongoDB connection created by MongooseModule.forRootAsync
  constructor(@InjectConnection() private readonly connection: Connection) {}

  getHealth(): HealthStatus {
    const connected = this.connection.readyState === CONNECTED;

    return {
      status: connected ? 'ok' : 'degraded',
      database: connected ? 'connected' : 'disconnected',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
