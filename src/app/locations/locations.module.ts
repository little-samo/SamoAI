import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LocationState,
  LocationStateSchema,
} from '@little-samo/samo-ai/models/locations/states/location.state';
import {
  LocationMessagesState,
  LocationMessagesStateSchema,
} from '@little-samo/samo-ai/models/locations/states/location.messages-state';
import { LocationEntityStateSchema } from '@little-samo/samo-ai/models/locations/states/location.entity-state';
import { LocationEntityState } from '@little-samo/samo-ai/models/locations/states/location.entity-state';

import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LocationState.name, schema: LocationStateSchema },
      { name: LocationMessagesState.name, schema: LocationMessagesStateSchema },
      {
        name: LocationEntityState.name,
        schema: LocationEntityStateSchema,
      },
    ]),
  ],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
