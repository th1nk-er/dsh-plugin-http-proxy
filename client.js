window.__ModuleLoader__.load({
  id: '@local/http-proxy',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /**
     * 核心代理可视化配置表单页面
     */
    function ProxyConfigForm() {
      const [data, setData] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [saving, setSaving] = React.useState(false)
      const [message, setMessage] = React.useState('')

      const [useSystemProxy, setUseSystemProxy] = React.useState(true)
      const [url, setUrl] = React.useState('')
      const [noProxy, setNoProxy] = React.useState('')
      const [syncEnv, setSyncEnv] = React.useState(true)

      const fetchConfig = () => {
        setLoading(true)
        fetch('/api/proxy/config')
          .then(res => res.json())
          .then(res => {
            setData(res)
            setUseSystemProxy(res.useSystemProxy !== false)
            setUrl(res.url || '')
            setNoProxy(res.noProxy || '')
            setSyncEnv(res.syncEnv !== false)
            setLoading(false)
          })
          .catch(err => {
            console.error('[http-proxy] 读取配置失败:', err)
            setLoading(false)
          })
      }

      React.useEffect(() => {
        fetchConfig()
      }, [])

      const handleSave = () => {
        setSaving(true)
        setMessage('')
        fetch('/api/proxy/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            useSystemProxy,
            url,
            noProxy,
            syncEnv,
          }),
        })
          .then(res => res.json())
          .then(res => {
            setSaving(false)
            if (res.ok) {
              setMessage('✅ 代理配置已保存并立即生效！')
              fetchConfig()
              setTimeout(() => setMessage(''), 4000)
            } else {
              setMessage('❌ 保存失败: ' + (res.error || '未知错误'))
            }
          })
          .catch(err => {
            setSaving(false)
            setMessage('❌ 请求失败: ' + err.message)
          })
      }

      if (loading && !data) {
        return h('div', { style: { padding: '24px', opacity: 0.6 } }, '正在读取代理状态...')
      }

      const activeUrl = data?.activeUrl
      const source = data?.source === 'system' ? '系统自动检测' : data?.source === 'manual' ? '手动配置' : '直连'

      return h('div', {
        style: {
          padding: '24px',
          maxWidth: '680px',
          fontFamily: 'inherit',
          fontSize: '13px',
          color: 'inherit',
        }
      }, [
        // 页面大标题
        h('div', { key: 'header', style: { marginBottom: '24px' } }, [
          h('h2', {
            key: 'title',
            style: { margin: '0 0 8px 0', fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }
          }, [
            h('span', { key: 'icon' }, '🌐'),
            h('span', { key: 'text' }, '网络代理设置')
          ]),
          h('div', { key: 'desc', style: { opacity: 0.7, fontSize: '13px', lineHeight: '1.5' } },
            '配置全局 HTTP 请求代理，支持一键读取 Windows/macOS 系统代理，并可自动将代理注入到执行的每个脚本与命令中。'
          ),
        ]),

        // 当前运行状态指示卡片
        h('div', {
          key: 'status-card',
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            marginBottom: '24px',
            borderRadius: '10px',
            backgroundColor: activeUrl ? 'rgba(16, 185, 129, 0.08)' : 'rgba(127, 127, 127, 0.08)',
            border: `1px solid ${activeUrl ? 'rgba(16, 185, 129, 0.3)' : 'rgba(127, 127, 127, 0.2)'}`,
          }
        }, [
          h('div', { key: 'status-info', style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
            h('div', {
              key: 'dot',
              style: {
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: activeUrl ? '#10B981' : '#9CA3AF',
                boxShadow: activeUrl ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
              }
            }),
            h('div', { key: 'label' }, [
              h('div', { style: { fontWeight: 600, fontSize: '14px', color: activeUrl ? '#10B981' : 'inherit' } },
                activeUrl ? `当前代理运行中` : '当前处于直连模式（未走代理）'
              ),
              activeUrl && h('div', { style: { fontSize: '12px', opacity: 0.75, marginTop: '2px' } },
                `目标地址: ${activeUrl} · 生效来源: ${source}`
              ),
            ])
          ]),
          h('button', {
            key: 'refresh-btn',
            onClick: fetchConfig,
            disabled: loading,
            style: {
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: 'inherit',
              border: '1px solid rgba(127, 127, 127, 0.3)',
              cursor: 'pointer',
              fontSize: '12px',
            }
          }, '重新探测系统代理')
        ]),

        // 表单区
        h('div', {
          key: 'form',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            padding: '20px',
            borderRadius: '10px',
            border: '1px solid rgba(127, 127, 127, 0.2)',
            backgroundColor: 'rgba(127, 127, 127, 0.03)',
          }
        }, [
          // 选项1: 自动读取系统代理
          h('label', {
            key: 'opt-sys',
            style: { display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }
          }, [
            h('input', {
              type: 'checkbox',
              checked: useSystemProxy,
              onChange: e => setUseSystemProxy(e.target.checked),
              style: { marginTop: '3px', cursor: 'pointer' }
            }),
            h('div', { key: 'label' }, [
              h('div', { style: { fontWeight: 600, fontSize: '14px' } }, '自动检测系统代理（推荐）'),
              h('div', { style: { fontSize: '12px', opacity: 0.7, marginTop: '3px', lineHeight: '1.4' } },
                '一键免配置同步当前操作系统的系统代理。只要操作系统开启了代理软件（如 Clash、v2ray 等）就自动生效；未开则自动直连。'
              )
            ])
          ]),

          // 分隔线
          h('hr', { key: 'hr1', style: { border: 'none', borderTop: '1px solid rgba(127, 127, 127, 0.15)', margin: 0 } }),

          // 选项2: 手动代理地址
          h('div', {
            key: 'opt-manual',
            style: {
              opacity: useSystemProxy ? 0.65 : 1,
              transition: 'opacity 0.2s',
            }
          }, [
            h('div', { style: { fontWeight: 600, marginBottom: '6px', fontSize: '13px' } },
              '手动代理地址' + (useSystemProxy ? ' (作为系统未开启代理时的备选)' : '')
            ),
            h('input', {
              type: 'text',
              value: url,
              placeholder: '例如: http://127.0.0.1:7890',
              onChange: e => setUrl(e.target.value),
              style: {
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(127, 127, 127, 0.3)',
                backgroundColor: 'rgba(127, 127, 127, 0.08)',
                color: 'inherit',
                fontSize: '13px',
                boxSizing: 'border-box',
              }
            })
          ]),

          // 选项3: 旁路白名单
          h('div', { key: 'opt-bypass' }, [
            h('div', { style: { fontWeight: 600, marginBottom: '6px', fontSize: '13px' } }, '自定义旁路名单 (不走代理的目标)'),
            h('input', {
              type: 'text',
              value: noProxy,
              placeholder: '例如: my-domain.com, 192.168.1.* (多个用逗号隔开，本地 localhost 已自动内置)',
              onChange: e => setNoProxy(e.target.value),
              style: {
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(127, 127, 127, 0.3)',
                backgroundColor: 'rgba(127, 127, 127, 0.08)',
                color: 'inherit',
                fontSize: '13px',
                boxSizing: 'border-box',
              }
            })
          ]),

          // 分隔线
          h('hr', { key: 'hr2', style: { border: 'none', borderTop: '1px solid rgba(127, 127, 127, 0.15)', margin: 0 } }),

          // 选项4: 命令环境注入
          h('label', {
            key: 'opt-env',
            style: { display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }
          }, [
            h('input', {
              type: 'checkbox',
              checked: syncEnv,
              onChange: e => setSyncEnv(e.target.checked),
              style: { marginTop: '3px', cursor: 'pointer' }
            }),
            h('div', { key: 'label' }, [
              h('div', { style: { fontWeight: 600, fontSize: '14px' } }, '自动注入到执行的命令与脚本环境中'),
              h('div', { style: { fontSize: '12px', opacity: 0.7, marginTop: '3px', lineHeight: '1.4' } },
                '在所有子进程命令（PowerShell、Bash）、Python/Node 脚本中自动注入 http_proxy 与 https_proxy 环境变量，使脚本请求自动走代理。'
              )
            ])
          ]),
        ]),

        // 保存操作条
        h('div', {
          key: 'footer-actions',
          style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px' }
        }, [
          h('button', {
            key: 'btn-save',
            onClick: handleSave,
            disabled: saving,
            style: {
              padding: '8px 20px',
              borderRadius: '6px',
              backgroundColor: '#0284C7',
              color: '#ffffff',
              border: 'none',
              cursor: saving ? 'wait' : 'pointer',
              fontWeight: 600,
              fontSize: '13px',
            }
          }, saving ? '正在保存...' : '保存并立即生效'),
          message && h('span', {
            key: 'msg',
            style: {
              fontSize: '13px',
              fontWeight: 500,
              color: message.startsWith('✅') ? '#10B981' : '#EF4444'
            }
          }, message)
        ])
      ])
    }

    /**
     * 位于输入框下方的常驻状态小组件 (Composer Dock Badge)
     */
    function ProxyDockIndicator() {
      const [proxy, setProxy] = React.useState(null)

      React.useEffect(() => {
        fetch('/api/proxy/config')
          .then(res => res.json())
          .then(res => setProxy(res.activeUrl))
          .catch(() => {})
      }, [])

      if (!proxy) return null

      return h('div', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 8px',
          fontSize: '11px',
          borderRadius: '10px',
          backgroundColor: 'rgba(2, 132, 199, 0.1)',
          color: '#0284C7',
          border: '1px solid rgba(2, 132, 199, 0.25)',
          marginLeft: '4px',
        },
        title: `所有外部请求及脚本命令已通过此代理转发: ${proxy}`
      }, [
        h('span', { key: 'icon' }, '🌐'),
        h('span', { key: 'text' }, `代理: ${proxy.replace(/^https?:\/\//, '')}`)
      ])
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // 1. 在设置左侧栏中注册独立的顶级设置页面【网络代理】
        ctx.slots.inject('settings.section', () => {
          return ctx.slots.register({
            name: 'settings.section',
            id: 'network-proxy',
            order: 12,
            label: () => '网络代理',
          }, ProxyConfigForm)
        })

        // 2. 在输入框下方显示常驻小徽章
        ctx.slots.inject('conversation.composer.dock', () => {
          return ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'http-proxy-dock',
            order: 2,
          }, ProxyDockIndicator)
        })
      },
    }
  },
})
