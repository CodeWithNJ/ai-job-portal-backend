import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/test' }),
      }),
    } as unknown as ArgumentsHost;
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  const sentBody = (): Record<string, unknown> =>
    (json.mock.calls as unknown[][])[0][0] as Record<string, unknown>;

  it('hides the message of unexpected errors from the client', () => {
    const leaky = new Error(
      'Invalid `prisma.user.create()` invocation: relation "users" does not exist',
    );

    filter.catch(leaky, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(sentBody().message).toBe('Internal server error');
    expect(JSON.stringify(sentBody())).not.toContain('prisma');
  });

  it('still logs the real cause server-side', () => {
    filter.catch(new Error('db connection refused'), host);

    const logged = String((errorSpy.mock.calls as unknown[][])[0][0]);
    expect(logged).toContain('db connection refused');
  });

  it('handles non-Error throwables', () => {
    filter.catch('something odd', host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(sentBody().message).toBe('Internal server error');
  });

  it('keeps intentional HttpException messages', () => {
    filter.catch(new BadRequestException('email is required'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(sentBody().message).toBe('email is required');
  });
});
