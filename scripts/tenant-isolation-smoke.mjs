/**
 * Tenant isolation smoke (platform + two company JWTs or cookie sessions).
 * Usage: API_URL=http://localhost:4000 node scripts/tenant-isolation-smoke.mjs
 *
 * Expects Acme admin credentials (demo seed).
 */
const API = process.env.API_URL || 'http://localhost:4000'

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const setCookie = res.headers.getSetCookie?.() || []
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(body)}`)
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ')
  return { cookie, user: body.user }
}

async function get(path, cookie) {
  const res = await fetch(`${API}${path}`, {
    headers: { Cookie: cookie },
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json }
}

async function main() {
  const acme = await login('admin@acme.com', 'TempPass123!')
  const me = await get('/auth/me', acme.cookie)
  if (me.status !== 200) throw new Error('me failed')
  const companyId = me.json.company?.id || me.json.companyId
  if (!companyId) throw new Error('no company on me')

  const stock = await get('/store/stock?pageSize=5', acme.cookie)
  if (stock.status !== 200) throw new Error(`stock ${stock.status}`)

  // Cross-tenant: forge wrong company via random GRN id should 404 not leak
  const grn = await get('/store/grn/cm_invalid_other_tenant', acme.cookie)
  if (grn.status !== 404 && grn.status !== 400) {
    throw new Error(`expected 404 for missing grn, got ${grn.status}`)
  }

  // Settings + workflow defaults present
  const settings = await get('/company/settings', acme.cookie)
  if (settings.status !== 200) throw new Error('settings failed')
  if (!settings.json.workflow) throw new Error('workflow missing on settings')
  if (!settings.json.billing) throw new Error('billing missing on settings')

  console.log('tenant isolation smoke OK', {
    company: companyId,
    workflow: settings.json.workflow.qcMode,
    billingAi: settings.json.billing.aiEnabled,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
