import { IsString, MinLength } from 'class-validator';

export class UpdateAccountDto {
    @IsString()
    @MinLength(1)
    name: string;
}
