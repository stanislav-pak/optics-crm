import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'

function getAppVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return String(Date.now());
  }
}

const appVersion = getAppVersion();

// Пишет dist/version.json при каждом билде — сверяется в рантайме с __APP_VERSION__,
// зашитой в бандл, чтобы показать баннер "доступно обновление". Не кладём файл в
// public/ — там он закоммитился бы и протухал между деплоями.
function writeVersionFile(): Plugin {
  return {
    name: 'write-version-file',
    apply: 'build',
    closeBundle() {
      writeFileSync(
        path.resolve(__dirname, 'dist/version.json'),
        JSON.stringify({ version: appVersion })
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), writeVersionFile()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
