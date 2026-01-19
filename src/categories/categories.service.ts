import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
    constructor(private readonly prisma: PrismaService) { }

    async listCategories(userId: number, includeInactive = false) {
        return this.prisma.category.findMany({
            where: {
                OR: [
                    { userId: null },       // globales
                    { userId },             // del usuario
                ],
                ...(includeInactive ? {} : { isActive: true }),
            },
            orderBy: [{ userId: 'asc' }, { name: 'asc' }],
        });
    }

    async createCategory(userId: number, dto: CreateCategoryDto) {
        const { name, type } = dto;

        // Verificar duplicado por usuario
        const exists = await this.prisma.category.findFirst({
            where: {
                name,
                userId,
            },
        });

        if (exists) {
            throw new BadRequestException('Category already exists');
        }

        return this.prisma.category.create({
            data: {
                name,
                type,
                userId,
            },
        });
    }

    async updateCategory(userId: number, categoryId: number, dto: UpdateCategoryDto) {
        const category = await this.prisma.category.findUnique({
            where: { id: categoryId },
        });

        if (!category) {
            throw new NotFoundException('Category not found');
        }

        if (category.userId === null) {
            throw new ForbiddenException('Global categories cannot be modified');
        }

        if (category.userId !== userId) {
            throw new ForbiddenException('You do not own this category');
        }

        return this.prisma.category.update({
            where: { id: categoryId },
            data: {
                name: dto.name,
            },
        });
    }

    async deactivateCategory(userId: number, categoryId: number) {
        return this.setActive(userId, categoryId, false);
    }

    async activateCategory(userId: number, categoryId: number) {
        return this.setActive(userId, categoryId, true);
    }

    private async setActive(userId: number, categoryId: number, isActive: boolean) {
        const category = await this.prisma.category.findUnique({
            where: { id: categoryId },
        });

        if (!category) {
            throw new NotFoundException('Category not found');
        }

        if (category.userId === null) {
            throw new ForbiddenException('Global categories cannot be modified');
        }

        if (category.userId !== userId) {
            throw new ForbiddenException('You do not own this category');
        }

        return this.prisma.category.update({
            where: { id: categoryId },
            data: { isActive },
        });
    }
}
