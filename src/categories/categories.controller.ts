import {
    Body,
    Controller,
    Get,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
    Param,
    ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
    constructor(private readonly service: CategoriesService) { }

    @Get()
    list(
        @Req() req: any,
        @Query('includeInactive') includeInactive?: string,
    ) {
        return this.service.listCategories(
            req.user.userId,
            includeInactive === 'true',
        );
    }

    @Post()
    create(@Req() req: any, @Body() dto: CreateCategoryDto) {
        return this.service.createCategory(req.user.userId, dto);
    }

    @Patch(':id')
    update(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCategoryDto,
    ) {
        return this.service.updateCategory(req.user.userId, id, dto);
    }

    @Patch(':id/deactivate')
    deactivate(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.deactivateCategory(req.user.userId, id);
    }

    @Patch(':id/activate')
    activate(
        @Req() req: any,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.activateCategory(req.user.userId, id);
    }
}
