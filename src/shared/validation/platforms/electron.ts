import { z } from 'zod';

const ElectronCDPConnectionSchema = z.object({
  type: z.literal('cdp'),
  cdpUrl: z.string()
    .url("Must be a valid URL (e.g., http://localhost:9222)")
    .refine(url => url.startsWith('http://') || url.startsWith('https://'), {
      message: "CDP URL must use HTTP protocol"
    }),
  windowTitle: z.string().optional(),
});

const ElectronExecutableConnectionSchema = z.object({
  type: z.literal('executable'),
  executablePath: z.string()
    .min(1, "Executable path is required")
    .refine(path => {
      return /\.(exe|app)$/i.test(path) || !path.includes('.');
    }, {
      message: "Must be a valid executable (.exe, .app, or no extension)"
    }),
  launchArgs: z.array(z.string()).optional(),
  windowTitle: z.string().optional(),
});

const ElectronConnectionSchema = z.discriminatedUnion('type', [
  ElectronCDPConnectionSchema,
  ElectronExecutableConnectionSchema,
]);

export const ElectronConfigSchema = z.object({
  platform: z.literal('electron'),
  connection: ElectronConnectionSchema,
});


