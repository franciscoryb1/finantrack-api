import { IsDateString, IsOptional } from 'class-validator';

export class UpdateStatementDatesDto {
    @IsOptional()
    @IsDateString()
    closingDate?: string;

    @IsOptional()
    @IsDateString()
    dueDate?: string;
}
