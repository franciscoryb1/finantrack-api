import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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





  async updateRefreshToken(userId: number, hash: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }

}
