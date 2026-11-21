import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

describe('ConnectionsController', () => {
  const service = {
    beginGmailConnect: jest.fn(),
    handleGmailCallback: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    refresh: jest.fn(),
    disconnect: jest.fn(),
  };
  const controller = new ConnectionsController(service as unknown as ConnectionsService);

  it('keeps callback unauthenticated while protecting user connection operations', () => {
    expect(Reflect.getMetadata('__guards__', controller.beginGmailConnect)).toBeDefined();
    expect(Reflect.getMetadata('__guards__', controller.list)).toBeDefined();
    expect(Reflect.getMetadata('__guards__', controller.get)).toBeDefined();
    expect(Reflect.getMetadata('__guards__', controller.refresh)).toBeDefined();
    expect(Reflect.getMetadata('__guards__', controller.disconnect)).toBeDefined();
    expect(Reflect.getMetadata('__guards__', controller.gmailCallback)).toBeUndefined();
  });

  it('applies stricter throttling to connect, callback, refresh and disconnect endpoints', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', controller.beginGmailConnect)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', controller.gmailCallback)).toBe(10);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', controller.refresh)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', controller.disconnect)).toBe(5);
  });
});
