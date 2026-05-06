import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
try { require('win-ca/api').inject('+') } catch {}

const SITE_ID = '74c770d1-1bb8-4d8f-ab22-7b1ba0cc9c0d'

function readAuthToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN
  const candidates = [
    path.join(process.env.APPDATA || '', 'netlify', 'Config', 'config.json'),
    path.join(os.homedir(), '.netlify', 'config.json'),
    path.join(os.homedir(), '.config', 'netlify', 'config.json'),
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
      const userId = cfg.userId
      const token = cfg.users?.[userId]?.auth?.token
      if (token) return token
    }
  }
  return null
}

const token = readAuthToken()
const headers = { Authorization: `Bearer ${token}` }

const ACCOUNT_ID = '69aeacad292be924fecfbc21'
const entry = {
  key: 'ANTHROPIC_MODEL',
  scopes: ['builds', 'functions'],
  values: [{ context: 'all', value: 'claude-haiku-4-5' }],
}
const url = `https://api.netlify.com/api/v1/accounts/${ACCOUNT_ID}/env/${entry.key}?site_id=${SITE_ID}`
const res = await fetch(url, {
  method: 'PUT',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(entry),
})
console.log(res.status, await res.text())
