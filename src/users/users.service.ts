import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async create(email: string,
    passwordHash: string,
    phoneNumber?: string) {

    const userCreated = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        phoneNumber: phoneNumber || '',
      },
    });

    if (!userCreated) {
      throw new NotFoundException('Failed to create user');
    }

    return {
      id: userCreated.id,
      email: userCreated.email,
      phoneNumber: userCreated.phoneNumber,
    }
  }

  async findByPhone(phoneNumber: string) {
    return this.prisma.user.findUnique({
      where: { phoneNumber },
    });
  }





  async getProfile(userId: number) {
    const user = await this.findById(userId);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== userId) {
        throw new BadRequestException('El email ya está en uso');
      }
    }

    if (dto.phoneNumber) {
      const existing = await this.prisma.user.findUnique({ where: { phoneNumber: dto.phoneNumber } });
      if (existing && existing.id !== userId) {
        throw new BadRequestException('El teléfono ya está en uso');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName || null }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName || null }),
        ...(dto.email && { email: dto.email }),
        ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
      },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt,
    };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.findById(userId);

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  async updateRefreshToken(userId: number, hash: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }

}
