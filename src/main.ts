import { SamoAiApp } from '@little-samo/samo-ai/app/app';

export { SamoAiApp };

if (require.main === module) {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  void new SamoAiApp().bootstrap();
}
