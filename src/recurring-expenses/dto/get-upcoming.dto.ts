import { IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetUpcomingDto {
    @Type(() => Number)
    @IsInt()
    year: number;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(12)
    month: number;
}
