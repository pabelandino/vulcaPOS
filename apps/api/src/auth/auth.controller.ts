import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Auth, CurrentUser } from './guards';
import { AuthUser } from './auth.types';

class LoginDto {
  @IsString()
  @MinLength(1, { message: 'Escriba el usuario' })
  username!: string;

  @IsString()
  @MinLength(1, { message: 'Escriba la contraseña' })
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Get('me')
  @Auth()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user.sub);
  }
}
