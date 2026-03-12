import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagsController {
    constructor(private readonly service: TagsService) {}

    @Get()
    list(@Req() req: any) {
        return this.service.listTags(req.user.userId);
    }

    @Post()
    create(@Req() req: any, @Body() dto: CreateTagDto) {
        return this.service.createTag(req.user.userId, dto);
    }

    @Delete(':id')
    delete(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
        return this.service.deleteTag(req.user.userId, id);
    }
}
