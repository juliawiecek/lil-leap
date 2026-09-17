import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok with the service name and a timestamp, without touching any dependency', () => {
    const controller = new HealthController();
    const body = controller.check();

    expect(body.status).toBe('ok');
    expect(body.service).toBe('auth');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });
});
