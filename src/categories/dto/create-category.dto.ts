import { IsEnum, IsInt, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { CategoryType } from '@prisma/client';

export class CreateCategoryDto {
    @IsString()
    @MinLength(2)
    name: string;

    // Requerido solo si no se provee parentId (las subcategorías heredan el tipo del padre)
    @ValidateIf((o) => !o.parentId)
    @IsEnum(CategoryType)
    type?: CategoryType;

    @IsOptional()
    @IsInt()
    parentId?: number;
}
