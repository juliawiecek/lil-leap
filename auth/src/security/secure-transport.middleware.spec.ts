import { SecureTransportMiddleware } from './secure-transport.middleware';

describe('SecureTransportMiddleware', () => {
  const middleware = new SecureTransportMiddleware();

  function run(req: Partial<{ secure: boolean; headers: Record<string, string> }>) {
    const res = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
    };
    const next = jest.fn();
    middleware.use({ headers: {}, ...req } as any, res as any, next);
    return { res, next };
  }

  it('passes an HTTPS request through untouched', () => {
    const { res, next } = run({ secure: true });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('rejects plain HTTP with 403 HTTPS_REQUIRED as JSON', () => {
    const { res, next } = run({ secure: false });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.type).toHaveBeenCalledWith('application/json');
    expect(res.send).toHaveBeenCalledWith({ error: 'HTTPS_REQUIRED', message: 'HTTPS is required.' });
  });

  it('never redirects a plaintext request, since it may carry credentials', () => {
    const { res } = run({ secure: false });

    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('ignores X-Forwarded-Proto: https on a plaintext connection, because TLS terminates here', () => {
    const { res, next } = run({ secure: false, headers: { 'x-forwarded-proto': 'https' } });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('treats a request with no secure flag at all as plaintext', () => {
    const { res, next } = run({});

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
