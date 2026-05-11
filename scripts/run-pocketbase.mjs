/**
 * Startet PocketBase mit geladener Projekt-.env (u. a. APP_PUBLIC_URL für Einladungslinks im Hook invites.pb.js).
 */
import 'dotenv/config'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const pbExe = path.join(root, 'pocketbase-bin', 'pocketbase')
const args = [
  'serve',
  '--dev',
  '--dir',
  path.join(root, 'pb_data'),
  '--publicDir',
  path.join(root, 'pb_public'),
  '--migrationsDir',
  path.join(root, 'pb_migrations'),
  '--hooksDir',
  path.join(root, 'pocketbase-bin', 'pb_hooks'),
]

const child = spawn(pbExe, args, { stdio: 'inherit', cwd: root, env: process.env })
child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 0)
})
