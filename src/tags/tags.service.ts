import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';

@Injectable()
export class TagsService {
    constructor(private readonly prisma: PrismaService) {}

    listTags(userId: number) {
        return this.prisma.tag.findMany({
            where: { userId },
            orderBy: { name: 'asc' },
        });
    }

    createTag(userId: number, dto: CreateTagDto) {
        return this.prisma.tag.upsert({
            where: { name_userId: { name: dto.name, userId } },
            create: { userId, name: dto.name, color: dto.color },
            update: { color: dto.color },
        });
    }

    async deleteTag(userId: number, id: number) {
        const tag = await this.prisma.tag.findFirst({ where: { id, userId } });
        if (!tag) throw new NotFoundException('Tag not found');
        await this.prisma.tag.delete({ where: { id } });
        return { success: true };
    }
}
