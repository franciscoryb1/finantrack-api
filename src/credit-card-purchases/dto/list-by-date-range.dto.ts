import { IsDateString } from 'class-validator';

export class ListByDateRangeDto {
    @IsDateString()
    fromDate: string;

    @IsDateString()
    toDate: string;
}
