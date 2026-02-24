import { t } from './shared';

export const desktopRouter = t.router({
    getSources: t.procedure.query(async () => {
        const { desktopCapturer } = require('electron');
        const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
        return sources.map((source: Electron.DesktopCapturerSource) => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL()
        }));
    })
});
