import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateTagDto {
    @IsString()
    @MaxLength(50)
    name: string;

    @IsOptional()
    @IsString()
    @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a valid hex color (e.g. #ff0000)' })
    color?: string;
}
