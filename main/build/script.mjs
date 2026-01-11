import child_process from 'child_process'
import electron from 'electron'
import esbuild from 'esbuild'

const isDev = !process.argv.includes('--prod')

const electronRunner = (() => {
  let handle = null
  return {
    restart () {
      console.info('Restarting Electron process.')

      if (handle) handle.kill()
      // On Linux, run with X11 mode for overlay compatibility
      const isLinux = process.platform === 'linux'
      const args = isLinux ? ['.', '--no-sandbox', '--ozone-platform=x11'] : ['.']
      const env = isLinux ? { ...process.env, XDG_SESSION_TYPE: 'x11' } : process.env
      handle = child_process.spawn(electron, args, {
        stdio: 'inherit',
        env
      })
    }
  }
})()

const visionBuild = await esbuild.build({
  entryPoints: ['src/vision/link-worker.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/vision.js'
})

const mainContext = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: !isDev,
  platform: 'node',
  external: ['electron', 'uiohook-napi', 'electron-overlay-window'],
  outfile: 'dist/main.js',
  define: {
    'process.env.STATIC': (isDev) ? '"../build/icons"' : '"."',
    'process.env.VITE_DEV_SERVER_URL': (isDev) ? '"http://localhost:5173"' : 'null'
  },
  plugins: (isDev) ? [{
    name: 'electron-runner',
    setup (build) {
      build.onEnd((result) => {
        if (!result.errors.length) electronRunner.restart()
      })
    }
  }] : []
})

if (isDev) {
  await mainContext.watch()
} else {
  await mainContext.rebuild()
  mainContext.dispose()
}
