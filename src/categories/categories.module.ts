import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { InternalCategoriesController } from './internal-categories.controller';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [CategoriesController, InternalCategoriesController],
  providers: [CategoriesService, PrismaService],
})
export class CategoriesModule {}
