import { SamoAiApp } from '@app/app';

export { SamoAiApp };

if (require.main === module) {
  new SamoAiApp().bootstrap();
}
