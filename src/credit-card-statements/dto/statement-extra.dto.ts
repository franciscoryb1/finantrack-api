import { IsInt, IsNotEmpty, IsString, NotEquals } from 'class-validator';

export class StatementExtraDto {
    @IsString()
    @IsNotEmpty()
    description: string;

    @IsInt()
    @NotEquals(0)
    amountCents: number;
}
