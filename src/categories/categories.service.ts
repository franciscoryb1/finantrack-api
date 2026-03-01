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
        const activeFilter = includeInactive ? {} : { isActive: true };

        return this.prisma.category.findMany({
            where: {
                OR: [{ userId: null }, { userId }],
                parentId: null,
                ...activeFilter,
            },
            include: {
                children: {
                    where: {
                        OR: [{ userId: null }, { userId }],
                        ...activeFilter,
                    },
                    orderBy: { name: 'asc' },
                },
            },
            orderBy: [{ userId: 'asc' }, { name: 'asc' }],
        });
    }

    async createCategory(userId: number, dto: CreateCategoryDto) {
        const { name, parentId } = dto;
        let { type } = dto;

        if (parentId) {
            const parent = await this.prisma.category.findFirst({
                where: {
                    id: parentId,
                    OR: [{ userId }, { userId: null }],
                    isActive: true,
                },
            });

            if (!parent) {
                throw new BadRequestException('Parent category not found or not accessible');
            }

            if (parent.parentId !== null) {
                throw new BadRequestException('Cannot create subcategory of a subcategory (max 2 levels)');
            }

            type = parent.type;
        }

        if (!type) {
            throw new BadRequestException('type is required for root categories');
        }

        const exists = await this.prisma.category.findFirst({
            where: { name, userId, parentId: parentId ?? null },
        });

        if (exists) {
            throw new BadRequestException('Category already exists at this level');
        }

        return this.prisma.category.create({
            data: { name, type, userId, parentId: parentId ?? null },
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
            data: { name: dto.name },
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

        await this.prisma.$transaction([
            this.prisma.category.update({
                where: { id: categoryId },
                data: { isActive },
            }),
            // Cascada a subcategorías del usuario
            this.prisma.category.updateMany({
                where: { parentId: categoryId, userId },
                data: { isActive },
            }),
        ]);

        return this.prisma.category.findUnique({
            where: { id: categoryId },
            include: {
                children: { where: { userId } },
            },
        });
    }
}
