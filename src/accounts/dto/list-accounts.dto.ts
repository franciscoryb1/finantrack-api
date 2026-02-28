import { IsIn, IsOptional } from 'class-validator';
import { AccountType } from '@prisma/client';

export class ListAccountsDto {
    @IsOptional()
    @IsIn(['all', 'active', 'inactive'])
    status?: 'all' | 'active' | 'inactive';

    @IsOptional()
    @IsIn(['CASH', 'BANK', 'CREDIT_CARD', 'WALLET'] as AccountType[])
    type?: AccountType;
}
