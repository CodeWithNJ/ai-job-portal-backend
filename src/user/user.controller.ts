import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('User account created successfully')
  async createNewUser(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.createNewUser(createUserDto);
    return user;
  }
}
