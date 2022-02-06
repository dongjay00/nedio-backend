import {
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Body,
  Put,
  UseGuards,
  Request,
  Res,
  Query,
} from '@nestjs/common';
import { Gallery } from './schema/gallery.schema';
import { GalleryService } from './gallery.service';
import { CreateGalleryDto } from './dto/create-gallery.dto';
import { UpdateGalleryDto } from './dto/update-gallery.dto';
import { HallService } from '../hall/hall.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserService } from '../user/user.service';

// 현재 hallMoudle은 appModule이 아닌 galleryModule에 붙어있는 형태(hall에 관한 모든 서비스가 gallery controller에서 실행되기 때문).
@Controller('galleries')
export class GalleryController {
  constructor(
    private readonly galleryService: GalleryService,
    private readonly hallService: HallService,
    private readonly userService: UserService,
  ) {}

  @Get() // 모든 Gallery 데이터 조회
  async getAllGalleries(): Promise<Gallery[]> {
    return await this.galleryService.getAllGalleries();
  }

  @Get('filtering') // 검색조건에 해당하는 갤러리 조회
  async getFilteredGalleries(
    @Res() res: any,
    @Query('page') page: number,
    @Query('perPage') perPage: number,
    @Query('category') category: string,
    @Query('title') title: string,
    @Query('nickname') nickname: string,
  ) {
    try {
      const galleries = await this.galleryService.getFilteredGalleries(
        page,
        perPage,
        category,
        title,
        nickname,
      );
      return res.status(200).json({
        success: true,
        message: 'get galleries success',
        data: galleries,
      });
    } catch (e) {
      console.log(e);
      return res.status(400).json({
        success: false,
        message: 'failed Get Gallery',
      });
    }
  }

  @Get('preview/:code') // code로 전시 예정, 오픈 중인 갤러리 가져오는 것이 달라짐
  async getUpcomingGallery(@Res() res: any, @Param('code') code: string) {
    try {
      let galleries;
      if (code === 'upcoming')
        galleries = await this.galleryService.getUpcomingGallery();
      else if (code === 'todays')
        galleries = await this.galleryService.getTodaysGallery();

      const results: {
        title: string;
        author: { nickname: string; contact: string; email: string };
        objectId: string;
        posterUrl: string;
        description: string;
        startDate: string;
        endDate: string;
      }[] = [];

      for (let i = 0; i < galleries.length; i++) {
        const {
          title,
          authorId,
          _id,
          posterUrl,
          description,
          startDate,
          endDate,
        } = galleries[i];

        const { nickname, contact, email } = await (
          await galleries[i].populate('authorId')
        ).authorId;

        const parsedStartDate = startDate
          .toISOString()
          .replace('T', ' ')
          .substring(0, 10);
        const parsedEndDate = endDate
          .toISOString()
          .replace('T', ' ')
          .substring(0, 10);

        results.push({
          title: title,
          author: { nickname, contact, email },
          objectId: _id,
          posterUrl: posterUrl,
          description: description,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'get galleries success',
        data: results,
      });
    } catch (e) {
      console.log(e);
      return res.status(400).json({
        success: false,
        message: 'failed Get Gallery',
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('myGallery')
  async getMyGallery(@Request() req, @Res() res) {
    try {
      const authorId = req.user.id;
      const galleries = await this.galleryService.getUserOwnGalleries(authorId);
      return res.status(200).json({
        success: true,
        message: 'sucess get Gallery',
        data: galleries,
      });
    } catch (e) {
      console.log(e);
      return res.status(400).json({
        success: false,
        message: 'failed get Gallery',
      });
    }
  }

  @Get(':id') // 특정 Gallery 데이터 조회
  async getGalleryById(@Res() res: any, @Param('id') galleryObjectId: string) {
    try {
      const newHallsData: Array<{
        hallId: any;
        hallName: string;
      }> = [];
      const gallery = await this.galleryService.getGalleryById(galleryObjectId);
      const halls = await this.hallService.getHallByGalleryId(galleryObjectId);
      const user = await this.userService.getUserByObjectId(
        String(gallery.authorId),
      );

      for (let i = 0; i < halls.length; i++) {
        const { _id, hallName } = halls[i];
        newHallsData.push({ hallId: _id, hallName: hallName });
      }

      return res.status(200).json({
        success: true,
        message: 'Get Gallery',
        data: {
          authorId: String(gallery.authorId),
          author: {
            email: user.email,
            nickname: user.nickname,
            contact: user.contact,
          },
          title: gallery.title,
          category: gallery.category,
          startDate: gallery.startDate,
          endDate: gallery.endDate,
          description: gallery.description,
          posterUrl: gallery.posterUrl,
          halls: newHallsData,
        },
      });
    } catch (e) {
      console.log(e);
      return res.status(400).json({
        success: false,
        message: 'failed Get Gallery',
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post() // Gallery 데이터 생성
  async createGallery(
    @Request() req,
    @Body() galleryData: any,
    @Res() res: any,
  ) {
    // 현재 api 목록을 보면 hall 데이터가 gallery 생성 api에 필요한 데이터에 포함되어 있음. 이를 분리해서 hall을 생성
    const authorId = req.user.id;
    const nickname = req.user.nickname;
    const {
      title,
      category,
      startDate,
      endDate,
      description,
      posterUrl,
      halls,
    } = galleryData;

    const newGallery = {
      authorId,
      nickname,
      title,
      category,
      startDate,
      endDate,
      description,
      posterUrl,
    };
    try {
      // return으로 생성한 정보를 줌. _id도 같이. (result._id로 galleryId 접근, result.authorId로 author 접근)
      const result = await this.galleryService.createGallery({
        ...newGallery,
        gallery: newGallery,
      });

      // gallery를 만들며 hall도 같이 생성(api 문서에선 gallery생성시 hall도 같이 생성하게 되어있음)
      for (let i = 0; i < halls.length; i++) {
        const { hallName, imagesData } = halls[i];
        const newHall = { galleryId: result._id, hallName, imagesData };
        await this.hallService.createHall({ ...newHall, hall: newHall });
      }

      res.status(200).json({
        success: true,
        message: 'Created Gallery',
      });
    } catch (e) {
      console.log(e);
      res.status(400).json({
        success: false,
        message: 'failed Creating Gallery',
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id') // Gallery 데이터 수정
  async updateGalleryById(
    @Request() req,
    @Param('id') galleryObjectId: string,
    @Body() updateGalleryData: any,
    @Res() res: any,
  ) {
    try {
      const authorId = await this.galleryService.getAuthorId(galleryObjectId); // author의 objectId. string 형태가 아님

      if (req.user.id === String(authorId)) {
        const {
          title,
          category,
          startDate,
          endDate,
          description,
          posterUrl,
          halls,
        } = updateGalleryData;

        const newGallery = {
          title,
          category,
          startDate,
          endDate,
          description,
          posterUrl,
        };

        await this.galleryService.updateGalleryById(galleryObjectId, {
          ...newGallery,
        });

        for (let i = 0; i < halls.length; i++) {
          const { hallName, hallObjectId, imagesData } = halls[i];
          const newHall = { galleryId: galleryObjectId, hallName, imagesData };
          await this.hallService.updateHallById(hallObjectId, {
            ...newHall,
          });
        }

        res.status(200).json({
          success: true,
          message: 'Updated Gallery',
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'Forbidden',
        });
      }
    } catch (e) {
      console.log(e);
      res.status(400).json({
        success: false,
        message: 'failed Updating Gallery',
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id') // Gallery 데이터 삭제
  async deleteGalleryById(
    @Request() req,
    @Param('id') galleryObjectId: string,
    @Res() res: any,
  ) {
    try {
      const authorId = await this.galleryService.getAuthorId(galleryObjectId);

      if (req.user.id === String(authorId)) {
        await this.hallService.deleteHallByGalleryId(galleryObjectId); // hall 부터 삭제
        await this.galleryService.deleteGalleryById(galleryObjectId);

        res.status(200).json({
          success: true,
          message: 'delete gallery success.',
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'Forbidden',
        });
      }
    } catch (e) {
      console.log(e);
      res.status(400).json({
        success: false,
        message: 'failed Updating Gallery',
      });
    }
    //return this.galleryService.deleteGalleryById(galleryObjectId);
  }
}
