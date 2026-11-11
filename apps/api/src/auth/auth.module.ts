import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessGuard, JwtAuthGuard, RolesGuard } from './guards';
import { JwtStrategy } from './jwt.strategy';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'vulcapos-dev-secret',
      signOptions: { expiresIn: 60 * 60 * 12 },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard, AccessGuard],
  exports: [AuthService, AccessGuard],
})
export class AuthModule {}
