import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma.service';

/**
 * Company ownership rules for PATCH/GET /profiles/me, run against the real
 * database in DATABASE_URL. Every row this suite creates is tagged with a
 * per-run id and removed in afterAll, so it can share a dev database.
 */

interface CompanyBody {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  [key: string]: unknown;
}

interface ProfileBody {
  success: boolean;
  message: string;
  data: {
    role: string;
    canEditCompany: boolean;
    profile: { company: CompanyBody | null };
  };
}

const bodyOf = (res: Response) => res.body as ProfileBody;

describe('Company ownership (e2e)', () => {
  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'e2e-password-123';
  const email = (who: string) => `e2e-${who}-${runId}@example.test`;
  const companyName = (base: string) => `E2E ${base} ${runId}`;

  const ACME = companyName('Acme');
  const GLOBEX = companyName('Globex');

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerCookie: string;
  let otherCookie: string;
  let thirdCookie: string;

  const createRecruiter = async (who: string): Promise<string> => {
    await request(app.getHttpServer())
      .post('/users/signup')
      .send({
        fullName: `E2E ${who}`,
        email: email(who),
        password: PASSWORD,
        role: 'recruiter',
      })
      .expect(201);

    const signin = await request(app.getHttpServer())
      .post('/users/signin')
      .send({ email: email(who), password: PASSWORD })
      .expect(200);

    // Forward cookies by hand rather than via an agent, so the suite works
    // whether or not COOKIE_SECURE marks them https-only.
    const setCookie = signin.headers['set-cookie'] as unknown as string[];
    return setCookie.map((cookie) => cookie.split(';')[0]).join('; ');
  };

  const patchProfile = (cookie: string, body: object) =>
    request(app.getHttpServer())
      .patch('/profiles/me')
      .set('Cookie', cookie)
      .send(body);

  const getProfile = (cookie: string) =>
    request(app.getHttpServer()).get('/profiles/me').set('Cookie', cookie);

  const userId = async (who: string) =>
    (
      await prisma.user.findUniqueOrThrow({
        where: { email: email(who) },
        select: { id: true },
      })
    ).id;

  const acme = () =>
    prisma.company.findUniqueOrThrow({ where: { name: ACME } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService, { strict: false });

    ownerCookie = await createRecruiter('owner');
    otherCookie = await createRecruiter('other');
    thirdCookie = await createRecruiter('third');
  });

  afterAll(async () => {
    if (prisma) {
      // Deleting users cascades to their recruiter profiles.
      await prisma.user.deleteMany({
        where: { email: { in: ['owner', 'other', 'third'].map(email) } },
      });
      await prisma.company.deleteMany({
        where: { name: { in: [ACME, GLOBEX] } },
      });
    }
    await app?.close();
  });

  it('creates a new company with the caller as owner', async () => {
    const res = await patchProfile(ownerCookie, {
      company: { name: ACME, industry: 'Software' },
    }).expect(200);

    const { data } = bodyOf(res);
    expect(data.canEditCompany).toBe(true);
    expect(data.profile.company).toMatchObject({
      name: ACME,
      industry: 'Software',
    });
    expect(data.profile.company).not.toHaveProperty('ownerUserId');
    expect((await acme()).ownerUserId).toBe(await userId('owner'));
  });

  it('lets the owner edit the company details', async () => {
    const res = await patchProfile(ownerCookie, {
      company: { name: ACME, description: 'Rockets and anvils' },
    }).expect(200);

    expect(bodyOf(res).data.profile.company?.description).toBe(
      'Rockets and anvils',
    );
  });

  it('rejects another recruiter joining it, regardless of case', async () => {
    const res = await patchProfile(otherCookie, {
      company: { name: ACME.toUpperCase(), description: 'Hijacked' },
    }).expect(409);

    expect(bodyOf(res).message).toBe('This company is already registered');
    expect((await acme()).description).toBe('Rockets and anvils');

    const profile = await getProfile(otherCookie).expect(200);
    expect(bodyOf(profile).data.profile.company).toBeNull();
    expect(bodyOf(profile).data.canEditCompany).toBe(true);
  });

  describe('a non-owner already linked to the company', () => {
    beforeAll(async () => {
      // Only reachable through data that predates ownership, so set it up
      // directly in the database.
      await prisma.recruiterProfile.upsert({
        where: { userId: await userId('other') },
        create: { userId: await userId('other'), companyId: (await acme()).id },
        update: { companyId: (await acme()).id },
      });
    });

    it('sees canEditCompany false', async () => {
      const res = await getProfile(otherCookie).expect(200);

      expect(bodyOf(res).data.canEditCompany).toBe(false);
      expect(bodyOf(res).data.profile.company).not.toHaveProperty(
        'ownerUserId',
      );
    });

    it('gets 403 when changing company details', async () => {
      await patchProfile(otherCookie, {
        company: { name: ACME, description: 'Hijacked' },
      }).expect(403);

      expect((await acme()).description).toBe('Rockets and anvils');
    });

    it('can still save its profile with the company unchanged', async () => {
      const res = await patchProfile(otherCookie, {
        designation: 'Talent Lead',
        company: { name: ACME, description: 'Rockets and anvils' },
      }).expect(200);

      expect(bodyOf(res).data.profile.company?.name).toBe(ACME);
    });
  });

  it('keeps ownership of the old company when the owner switches', async () => {
    const res = await patchProfile(ownerCookie, {
      company: { name: GLOBEX },
    }).expect(200);

    expect(bodyOf(res).data.profile.company?.name).toBe(GLOBEX);
    expect((await acme()).ownerUserId).toBe(await userId('owner'));
  });

  describe('after the owner deletes their account', () => {
    beforeAll(async () => {
      await prisma.user.delete({ where: { email: email('owner') } });
    });

    it('leaves the company without an owner', async () => {
      expect((await acme()).ownerUserId).toBeNull();
    });

    it('locks the company for the remaining linked recruiter', async () => {
      const res = await getProfile(otherCookie).expect(200);
      expect(bodyOf(res).data.canEditCompany).toBe(false);
    });

    it('does not let anyone else claim it', async () => {
      await patchProfile(thirdCookie, { company: { name: ACME } }).expect(409);
    });
  });
});
