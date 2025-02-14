import { SamoAiApp } from '@app/app';

export { SamoAiApp };

if (require.main === module) {
  void new SamoAiApp().bootstrap();
}
