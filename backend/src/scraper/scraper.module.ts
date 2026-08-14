import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScrapedPage, ScrapedPageSchema } from './scraped-page.schema';
import { ScraperService } from './scraper.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScrapedPage.name, schema: ScrapedPageSchema },
    ]),
  ],
  providers: [ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
