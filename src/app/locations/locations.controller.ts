import { Controller } from '@nestjs/common';

import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  public constructor(private readonly locationsService: LocationsService) {}
}
