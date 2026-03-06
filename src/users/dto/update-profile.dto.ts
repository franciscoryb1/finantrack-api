import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phoneNumber?: string;
}
