import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../user/decorators/current-user.decorator';
import { UserRole } from '../user/dto/create-user.dto';
import { AccessTokenGuard } from '../user/guards/access-token.guard';
import type { AuthJwtPayload } from '../user/token.service';
import { CreateResumeUploadUrlDto } from './dto/create-resume-upload-url.dto';
import { ProfileService } from './profile.service';

@Controller('profiles')
@UseGuards(AccessTokenGuard, RolesGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ResponseMessage('Profile fetched successfully')
  async getMyProfile(@CurrentUser() currentUser: AuthJwtPayload) {
    return this.profileService.getMyProfile(currentUser);
  }

  /**
   * The body shape depends on the caller's role (job seeker vs recruiter), so
   * it is validated inside the service against the role-specific DTO rather
   * than by the global pipe.
   */
  @Patch('me')
  @ResponseMessage('Profile updated successfully')
  async updateMyProfile(
    @CurrentUser() currentUser: AuthJwtPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.profileService.updateMyProfile(currentUser, body);
  }

  @Post('me/resume/upload-url')
  @Roles(UserRole.JOB_SEEKER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Resume upload URL created')
  createResumeUploadUrl(
    @CurrentUser() currentUser: AuthJwtPayload,
    @Body() dto: CreateResumeUploadUrlDto,
  ) {
    return this.profileService.createResumeUploadUrl(currentUser.sub, dto);
  }
}
