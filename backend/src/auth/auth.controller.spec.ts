import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const auth = { signinWithGoogle: jest.fn().mockResolvedValue({ accessToken: 'access' }) };
  const users = {};
  const controller = new AuthController(auth as never, users as never);

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the Google ID token to the existing auth service', async () => {
    await expect(controller.google({ idToken: 'verified-id-token' })).resolves.toEqual({ accessToken: 'access' });
    expect(auth.signinWithGoogle).toHaveBeenCalledWith('verified-id-token');
  });
});
