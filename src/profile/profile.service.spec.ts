import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from 'src/prisma.service';
import type { FileStorageService } from '../storage/file-storage.service';
import type { UploadUrlService } from '../storage/upload-url.service';
import { UserRole } from '../user/dto/create-user.dto';
import type { AuthJwtPayload } from '../user/token.service';
import { ProfileService } from './profile.service';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';

const recruiter = (sub: string): AuthJwtPayload => ({
  sub,
  _id: sub,
  email: `${sub}@example.com`,
  role: UserRole.RECRUITER,
});

const storedCompany = (overrides: Record<string, unknown> = {}) => ({
  id: COMPANY_ID,
  name: 'Acme',
  website: 'https://acme.test',
  industry: 'Software',
  size: null,
  location: null,
  description: null,
  logoUrl: null,
  ownerUserId: OWNER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ProfileService recruiter company ownership', () => {
  let prisma: {
    company: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    recruiterProfile: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let service: ProfileService;

  beforeEach(() => {
    prisma = {
      company: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      recruiterProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'profile' }),
      },
    };
    service = new ProfileService(
      prisma as unknown as PrismaService,
      {} as ConfigService,
      {} as FileStorageService,
      {} as UploadUrlService,
    );
  });

  const linkedCompanyId = (): unknown =>
    (
      prisma.recruiterProfile.upsert.mock.calls as {
        update: { companyId?: string };
      }[][]
    )[0][0].update.companyId;

  it('creates an unknown company with the caller as owner', async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    prisma.company.create.mockResolvedValue({ id: COMPANY_ID });

    await service.updateMyProfile(recruiter(OWNER_ID), {
      company: { name: 'Acme', industry: 'Software' },
    });

    expect(prisma.company.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Acme', industry: 'Software', ownerUserId: OWNER_ID },
      }),
    );
    expect(linkedCompanyId()).toBe(COMPANY_ID);
  });

  it('lets the owner update only the details that changed', async () => {
    prisma.company.findUnique.mockResolvedValue(storedCompany());

    await service.updateMyProfile(recruiter(OWNER_ID), {
      company: { name: 'Acme', industry: 'Software', size: '11-50' },
    });

    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: COMPANY_ID },
      data: { size: '11-50' },
    });
  });

  it('skips the write when the owner resubmits unchanged details', async () => {
    prisma.company.findUnique.mockResolvedValue(storedCompany());

    await service.updateMyProfile(recruiter(OWNER_ID), {
      company: { name: 'Acme', website: 'https://acme.test' },
    });

    expect(prisma.company.update).not.toHaveBeenCalled();
    expect(linkedCompanyId()).toBe(COMPANY_ID);
  });

  it('rejects joining a company owned by someone else with 409', async () => {
    prisma.company.findUnique.mockResolvedValue(storedCompany());

    await expect(
      service.updateMyProfile(recruiter(OTHER_ID), {
        company: { name: 'acme' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.company.update).not.toHaveBeenCalled();
    expect(prisma.recruiterProfile.upsert).not.toHaveBeenCalled();
  });

  it('treats an ownerless company as owned by someone else', async () => {
    prisma.company.findUnique.mockResolvedValue(
      storedCompany({ ownerUserId: null }),
    );

    await expect(
      service.updateMyProfile(recruiter(OTHER_ID), {
        company: { name: 'Acme' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses edits from an already-linked non-owner with 403', async () => {
    prisma.company.findUnique.mockResolvedValue(storedCompany());
    prisma.recruiterProfile.findUnique.mockResolvedValue({
      companyId: COMPANY_ID,
    });

    await expect(
      service.updateMyProfile(recruiter(OTHER_ID), {
        company: { name: 'Acme', description: 'Hijacked' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('lets an already-linked non-owner save unchanged company details', async () => {
    prisma.company.findUnique.mockResolvedValue(storedCompany());
    prisma.recruiterProfile.findUnique.mockResolvedValue({
      companyId: COMPANY_ID,
    });

    await service.updateMyProfile(recruiter(OTHER_ID), {
      designation: 'Talent Lead',
      company: { name: 'Acme', industry: 'Software' },
    });

    expect(prisma.company.update).not.toHaveBeenCalled();
    expect(linkedCompanyId()).toBe(COMPANY_ID);
  });

  it('judges the loser of a concurrent create against the winner', async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    prisma.company.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.company.findUniqueOrThrow.mockResolvedValue(storedCompany());

    await expect(
      service.updateMyProfile(recruiter(OTHER_ID), {
        company: { name: 'Acme' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows unexpected errors from create', async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    prisma.company.create.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.updateMyProfile(recruiter(OWNER_ID), {
        company: { name: 'Acme' },
      }),
    ).rejects.toThrow('connection lost');
  });

  it('leaves the company alone when none is submitted', async () => {
    await service.updateMyProfile(recruiter(OWNER_ID), {
      designation: 'Founder',
    });

    expect(prisma.company.findUnique).not.toHaveBeenCalled();
    expect(linkedCompanyId()).toBeUndefined();
  });
});
