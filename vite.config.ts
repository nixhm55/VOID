import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type PluginOption, type UserConfig } from 'vite';
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

function resolvePort(
  raw: string | undefined,
): { port: number; explicit: boolean } {
  const trimmed = raw?.trim() ?? '';
  const parsed = trimmed ? Number.parseInt(trimmed, 10) : Number.NaN;
  const valid =
    Number.isInteger(parsed) && parsed > 0 && parsed <= 65535;

  return valid
    ? { port: parsed, explicit: true }
    : { port: 3010, explicit: false };
}

function resolveBase(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? '';

  if (!trimmed) return '/';

  if (/^[a-z][a-z0-9+.-]*:\/\/?/i.test(trimmed)) {
    return trimmed;
  }

  const withLeadingSlash = trimmed.startsWith('/')
    ? trimmed
    : `/${trimmed}`;

  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

const { port, explicit } = resolvePort(process.env.PORT);
const base = resolveBase(process.env.BASE_PATH);

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const plugins: PluginOption[] = [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
  ];

  if (command === 'serve' && process.env.REPL_ID !== undefined) {
    try {
      const { cartographer } = await import(
        '@replit/vite-plugin-cartographer'
      );
      const { devBanner } = await import(
        '@replit/vite-plugin-dev-banner'
      );

      plugins.push(
        cartographer({ root: projectRoot }),
        devBanner(),
      );
    } catch (error) {
      console.warn(
        '[vite] Replit dev plugins unavailable, continuing without them:',
        error,
      );
    }
  }

  return {
    root: projectRoot,
    base,

    plugins,

    resolve: {
      alias: {
        '@': path.resolve(projectRoot, 'src'),
        '@assets': path.resolve(projectRoot, 'attached_assets'),
      },
      dedupe: ['react', 'react-dom'],
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },

    server: {
      port,
      strictPort: explicit,
      host: '0.0.0.0',
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },

    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});