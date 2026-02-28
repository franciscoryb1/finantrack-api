import { IsInt, Max, Min } from 'class-validator';

export class GetDashboardActivityDto {
    @IsInt()
    @Min(2000)
    year: number;

    @IsInt()
    @Min(1)
    @Max(12)
    month: number;
}
