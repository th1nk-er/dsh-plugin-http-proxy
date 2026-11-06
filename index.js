import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import Schema from '@deepseek-ai/schemastery'

export const name = 'http-proxy'
export const inject = ['webServer']

export const Config = Schema.object({
  useSystemProxy: Schema.boolean()
    .default(true)
    .description('自动检测系统代理：一键同步当前操作系统的代理配置（免手动配置）'),
  url: Schema.string()
    .description('手动代理地址：当未开启系统代理或关闭自动检测时生效，如 http://127.0.0.1:7890'),
  noProxy: Schema.string()
    .description('自定义旁路名单：不走代理的目标主机或 IP，多个用逗号隔开'),
  syncEnv: Schema.boolean()
    .default(true)
    .description('自动注入命令环境：将 http_proxy / https_proxy 自动注入到执行的每个脚本与命令行中'),
})

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']

const PROXY_ENV_KEYS = [
  'HTTP_PROXY', 'http_proxy',
  'HTTPS_PROXY', 'https_proxy',
  'ALL_PROXY', 'all_proxy',
  'NO_PROXY', 'no_proxy',
  'NODE_USE_ENV_PROXY',
]

function getWindowsProxy() {
  const tmpPath = path.join(os.tmpdir(), `dsh_reg_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`)
  let fd
  try {
    fd = fs.openSync(tmpPath, 'w')
    spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], {
      stdio: ['ignore', fd, 'ignore'],
      windowsHide: true,
    })
  } catch {
    return null
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd) } catch {}
    }
  }

  let out = ''
  try {
    out = fs.readFileSync(tmpPath, 'utf8')
  } catch {
    return null
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }

  const enabledMatch = out.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-fA-F]+)/)
  const enabled = enabledMatch ? parseInt(enabledMatch[1], 16) === 1 : false
  if (!enabled) return null

  const serverMatch = out.match(/ProxyServer\s+REG_SZ\s+(\S+)/)
  if (!serverMatch) return null
  const rawServer = serverMatch[1]

  let selected = rawServer
  if (rawServer.includes('=')) {
    const parts = rawServer.split(';')
    const map = {}
    for (const part of parts) {
      const [k, v] = part.split('=')
      if (k && v) map[k.trim().toLowerCase()] = v.trim()
    }
    selected = map.https || map.http || Object.values(map)[0]
  }
  if (!selected) return null

  const url = selected.startsWith('http://') || selected.startsWith('https://')
    ? selected
    : `http://${selected}`

  const overrideMatch = out.match(/ProxyOverride\s+REG_SZ\s+(\S+)/)
  const override = overrideMatch ? overrideMatch[1] : ''
  const noProxyList = override
    .split(';')
    .map(s => s.trim())
    .filter(s => s && s.toLowerCase() !== '<local>')

  return {
    url,
    noProxy: noProxyList.join(','),
  }
}

function getMacProxy() {
  const tmpPath = path.join(os.tmpdir(), `dsh_scutil_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`)
  let fd
  try {
    fd = fs.openSync(tmpPath, 'w')
    spawnSync('scutil', ['--proxy'], {
      stdio: ['ignore', fd, 'ignore'],
    })
  } catch {
    return null
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd) } catch {}
    }
  }

  let out = ''
  try {
    out = fs.readFileSync(tmpPath, 'utf8')
  } catch {
    return null
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }

  const httpEnabled = /HTTPEnable\s*:\s*1/.test(out)
  const httpsEnabled = /HTTPSEnable\s*:\s*1/.test(out)
  if (!httpEnabled && !httpsEnabled) return null

  let host = null
  let port = null
  if (httpsEnabled) {
    host = out.match(/HTTPSProxy\s*:\s*(\S+)/)?.[1]
    port = out.match(/HTTPSPort\s*:\s*(\d+)/)?.[1]
  }
  if (!host && httpEnabled) {
    host = out.match(/HTTPProxy\s*:\s*(\S+)/)?.[1]
    port = out.match(/HTTPPort\s*:\s*(\d+)/)?.[1]
  }
  if (!host) return null

  const url = `http://${host}${port ? `:${port}` : ''}`
  return { url, noProxy: '' }
}

function detectSystemProxy() {
  const platform = os.platform()
  if (platform === 'win32') return getWindowsProxy()
  if (platform === 'darwin') return getMacProxy()

  const envProxy = process.env.http_proxy || process.env.HTTP_PROXY || process.env.all_proxy || process.env.ALL_PROXY
  if (envProxy) {
    return {
      url: envProxy.startsWith('http') ? envProxy : `http://${envProxy}`,
      noProxy: process.env.no_proxy || process.env.NO_PROXY || '',
    }
  }
  return null
}

function mergeNoProxy(...parts) {
  const set = new Set(LOOPBACK_HOSTS)
  for (const part of parts) {
    if (!part) continue
    const items = typeof part === 'string' ? part.split(/[,;\s]+/) : part
    for (const item of items) {
      const trimmed = item.trim().toLowerCase()
      if (trimmed) set.add(trimmed)
    }
  }
  return Array.from(set).join(',')
}

export async function apply(ctx, initialConfig = {}) {
  let currentConfig = { ...initialConfig }
  let activeUrl = null
  let source = 'none'
  let effectiveNoProxy = ''
  let currentProxyAgent = null

  const { getGlobalDispatcher, setGlobalDispatcher, ProxyAgent } = await import('undici')
  const prevDispatcher = getGlobalDispatcher()
  const prevEnv = {}
  for (const k of PROXY_ENV_KEYS) {
    prevEnv[k] = process.env[k]
  }

  async function applyProxyState(cfg) {
    let targetUrl = null
    let src = 'none'
    let sysNoProxy = ''

    if (cfg.useSystemProxy !== false) {
      const sys = detectSystemProxy()
      if (sys?.url) {
        targetUrl = sys.url
        sysNoProxy = sys.noProxy || ''
        src = 'system'
      }
    }

    if (!targetUrl && cfg.url) {
      targetUrl = cfg.url.startsWith('http') ? cfg.url : `http://${cfg.url}`
      src = 'manual'
    }

    activeUrl = targetUrl
    source = src
    effectiveNoProxy = mergeNoProxy(sysNoProxy, cfg.noProxy)

    if (currentProxyAgent) {
      try { await currentProxyAgent.close() } catch {}
      currentProxyAgent = null
    }

    if (activeUrl) {
      currentProxyAgent = new ProxyAgent({
        uri: activeUrl,
        noProxy: effectiveNoProxy,
      })
      setGlobalDispatcher(currentProxyAgent)

      if (cfg.syncEnv !== false) {
        process.env.HTTP_PROXY = activeUrl
        process.env.http_proxy = activeUrl
        process.env.HTTPS_PROXY = activeUrl
        process.env.https_proxy = activeUrl
        process.env.ALL_PROXY = activeUrl
        process.env.all_proxy = activeUrl
        process.env.NO_PROXY = effectiveNoProxy
        process.env.no_proxy = effectiveNoProxy
        process.env.NODE_USE_ENV_PROXY = '1'
      }
      ctx.logger.info(`[http-proxy] 代理已生效: ${activeUrl} (${src})`)
    } else {
      setGlobalDispatcher(prevDispatcher)
      for (const k of PROXY_ENV_KEYS) {
        if (prevEnv[k] === undefined) delete process.env[k]
        else process.env[k] = prevEnv[k]
      }
      ctx.logger.info('[http-proxy] 代理已切换为直连')
    }
  }

  await applyProxyState(currentConfig)

  // 注册 HTTP API 路由，供前端 UI 读写配置
  const webServer = ctx.get('webServer')
  if (webServer) {
    try {
      webServer.register({
        kind: 'exact',
        path: '/api/proxy/config',
        async handler(req, res) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          if (req.method === 'GET') {
            res.writeHead(200)
            res.end(JSON.stringify({
              activeUrl,
              source,
              effectiveNoProxy,
              useSystemProxy: currentConfig.useSystemProxy !== false,
              url: currentConfig.url || '',
              noProxy: currentConfig.noProxy || '',
              syncEnv: currentConfig.syncEnv !== false,
            }))
            return
          }

          if (req.method === 'POST') {
            let bodyStr = ''
            req.on('data', chunk => { bodyStr += chunk })
            req.on('end', async () => {
              try {
                const body = JSON.parse(bodyStr || '{}')
                currentConfig = {
                  ...currentConfig,
                  ...body,
                }
                await applyProxyState(currentConfig)

                // 尝试写入配置文件持久化
                try {
                  const editor = ctx.get('configEditor')
                  const entry = ctx.fiber?.entry
                  if (editor && entry) {
                    await editor.edit(entry, current => ({ ...current, ...currentConfig }))
                  }
                } catch (e) {
                  ctx.logger.warn('写入持久化配置跳过:', e.message)
                }

                res.writeHead(200)
                res.end(JSON.stringify({ ok: true, activeUrl, source }))
              } catch (err) {
                res.writeHead(400)
                res.end(JSON.stringify({ ok: false, error: err.message }))
              }
            })
            return
          }

          res.writeHead(405)
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
        }
      })
    } catch (e) {
      // 路由已存在时复用现有路由
      ctx.logger.info('[http-proxy] webServer 路由已存在，复用现有路由')
    }
  }

  ctx.on('dispose', async () => {
    setGlobalDispatcher(prevDispatcher)
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    if (currentProxyAgent) {
      try { await currentProxyAgent.close() } catch {}
    }
    ctx.logger.info('[http-proxy] HTTP 代理已卸载。')
  })
}
