import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CompanyProfile,
  CompanyProfileDocument,
} from '../../audits/company-profile.schema';
import { RivalData, StageLogger, noopStageLogger } from '../../audits/audit.types';
import { ScraperService } from '../../scraper/scraper.service';
import { describeSignals, pageToRef } from './company-research.service';

/** Rival sites get a smaller scrape budget than the lead's own company. */
const RIVAL_PAGE_BUDGET = 3;

/**
 * Competitor evidence collection. Discovery itself costs no extra model call —
 * rivals arrive with the company brief (see CompanyResearchService) already
 * validated and cached per domain. This service scrapes each rival's site for
 * comparable evidence and writes the enriched list back to the shared cache,
 * so the next lead at the same company skips the scraping too.
 */
@Injectable()
export class RivalsService {
  constructor(
    @InjectModel(CompanyProfile.name)
    private readonly profileModel: Model<CompanyProfileDocument>,
    private readonly scraper: ScraperService,
  ) {}

  /** Rivals already discovered for this domain (by the research brief). */
  async getCachedRivals(domain: string): Promise<RivalData[]> {
    if (!domain) return [];
    const doc = await this.profileModel
      .findOne({ domain })
      .select('rivals')
      .lean()
      .exec();
    return doc?.rivals ?? [];
  }

  /** Scrape each rival's site and attach summary + signals + page evidence. */
  async scrapeRivals(
    companyDomain: string,
    rivals: RivalData[],
    log: StageLogger = noopStageLogger,
  ): Promise<RivalData[]> {
    const scraped: RivalData[] = [];
    for (const rival of rivals) {
      if (rival.pages.length > 0) {
        log('success', `${rival.name}: reusing ${rival.pages.length} cached page${rival.pages.length === 1 ? '' : 's'}`);
        scraped.push(rival);
        continue;
      }
      if (!rival.website) {
        log('warn', `${rival.name}: no website known — nothing to scrape`);
        scraped.push(rival);
        continue;
      }
      log('info', `${rival.name}: scraping ${rival.website} (up to ${RIVAL_PAGE_BUDGET} pages)`);
      const site = await this.scraper.scrapeSite(rival.website, rival.domain, log);
      const home = site.pages[0];
      if (site.pages.length > 0) {
        log(
          'success',
          `${rival.name}: ${site.pages.length} page${site.pages.length === 1 ? '' : 's'} read`,
          describeSignals(site.signals),
        );
      } else {
        log('warn', `${rival.name}: site could not be read`, site.error ?? undefined);
      }
      scraped.push({
        ...rival,
        summary:
          home?.description ||
          home?.title ||
          (site.error ? `Site could not be read (${site.error}).` : ''),
        signals: site.pages.length > 0 ? site.signals : null,
        pages: site.pages.slice(0, RIVAL_PAGE_BUDGET).map(pageToRef),
      });
    }
    await this.profileModel
      .updateOne({ domain: companyDomain }, { $set: { rivals: scraped } })
      .exec()
      .catch(() => undefined);
    return scraped;
  }
}
