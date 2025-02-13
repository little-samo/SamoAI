import { SamoAiApp } from '@app/app';

export { SamoAiApp };

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  new SamoAiApp().bootstrap();
}
