import { ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from 'src/prisma.service';
import type { EncryptionService } from '../common/services/encryption.service';
import { CreateUserDto, UserRole } from './dto/create-user.dto';
import type { TokenService } from './token.service';
import { UserService } from './user.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

describe('UserService.createNewUser', () => {
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let service: UserService;

  const dto: CreateUserDto = {
    fullName: '  Asha Menon ',
    email: 'asha@example.com',
    contactNo: '+91 98765 43210',
    password: 'password123',
    role: UserRole.JOB_SEEKER,
  };

  const uniqueViolation = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new-user' }),
      },
    };
    service = new UserService(
      prisma as unknown as PrismaService,
      {} as TokenService,
      {} as EncryptionService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates the user with a hashed password and trimmed name', async () => {
    await expect(service.createNewUser(dto)).resolves.toEqual({
      id: 'new-user',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fullName: 'Asha Menon',
          email: dto.email,
          contactNo: dto.contactNo,
          passwordHash: 'hashed-password',
          role: UserRole.JOB_SEEKER,
        },
      }),
    );
  });

  it('rejects a taken email with 409', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' });

    await expect(service.createNewUser(dto)).rejects.toThrow(
      new ConflictException(
        'Account already exists with this email: asha@example.com',
      ),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects a taken contact number with 409', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null) // email is free
      .mockResolvedValueOnce({ id: 'existing' }); // contact number is not

    await expect(service.createNewUser(dto)).rejects.toThrow(
      new ConflictException('Account already exists with this contact number'),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('skips the contact number check when none is given', async () => {
    await service.createNewUser({ ...dto, contactNo: undefined });

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: dto.email } }),
    );
  });

  it('turns a concurrent duplicate signup into 409, not 500', async () => {
    prisma.user.create.mockRejectedValue(uniqueViolation());

    await expect(service.createNewUser(dto)).rejects.toThrow(
      new ConflictException(
        'Account already exists with this email or contact number',
      ),
    );
  });

  it('rethrows unexpected database errors', async () => {
    prisma.user.create.mockRejectedValue(new Error('connection lost'));

    await expect(service.createNewUser(dto)).rejects.toThrow('connection lost');
  });
});
