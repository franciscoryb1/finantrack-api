import { IsEnum, IsString, MinLength } from 'class-validator';
import { CategoryType } from '@prisma/client';

export class CreateCategoryDto {
    @IsString()
    @MinLength(2)
    name: string;

    @IsEnum(CategoryType)
    type: CategoryType;
}
