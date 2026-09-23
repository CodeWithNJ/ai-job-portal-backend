import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto, UserRole } from './create-user.dto';

describe('CreateUserDto role', () => {
  const base = {
    fullName: 'Test User',
    email: 'test@example.com',
    password: 'password123',
  };

  const roleErrors = async (role: unknown) => {
    const dto = plainToInstance(CreateUserDto, { ...base, role });
    const errors = await validate(dto);
    return errors.filter((e) => e.property === 'role');
  };

  it.each([UserRole.JOB_SEEKER, UserRole.RECRUITER])(
    'accepts %s',
    async (role) => {
      expect(await roleErrors(role)).toHaveLength(0);
    },
  );

  it('rejects admin so self-signup cannot create privileged accounts', async () => {
    const errors = await roleErrors(UserRole.ADMIN);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isIn');
  });

  it.each([undefined, '', 'superuser'])('rejects %p', async (role) => {
    expect(await roleErrors(role)).not.toHaveLength(0);
  });
});
