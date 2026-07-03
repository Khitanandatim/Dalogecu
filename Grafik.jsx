import { useState, useEffect, useRef, useCallback } from 'react'
import { initializeApp, getApps }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getDatabase, ref, onValue }      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'

const firebaseConfig = {
  apiKey:      "AIzaSyBAaslSPUuviuQYy80FbuP9V6C9Gtcn_0g",
  databaseURL: "https://dalogecu-default-rtdb.firebaseio.com/"
}
const _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const _db  = getDatabase(_app)

const FB_PATH     = '/ecu/live'
const HISTORY_LEN = 120

const C = {
  rpm: '#0077ff',
  afr: '#e07b00',
  bat: '#00a85a',
  eot: '#d95f00',
  iat: '#2d6fd4',
  red: '#d9263d',
  dim: 'rgba(0,50,120,0.08)',
}

// ════════════════════════════════════════════════════════════
//  HOOK DATA HISTORIS REAL-TIME
// ════════════════════════════════════════════════════════════
function useHistory() {
  const bufRef = useRef({
    rpm: [], bat: [], eot: [], iat: [], afr: [], timestamps: []
  })

  const [hist,      setHist]      = useState({ rpm: [], bat: [], eot: [], iat: [], afr: [], timestamps: [] })
  const [connected, setConnected] = useState(false)
  const [lastVal,   setLastVal]   = useState(null)

  useEffect(() => {
    const liveRef = ref(_db, FB_PATH)

    const flushTimer = setInterval(() => {
      const b = bufRef.current
      setHist({
        rpm:        [...b.rpm],
        bat:        [...b.bat],
        eot:        [...b.eot],
        iat:        [...b.iat],
        afr:        [...b.afr],
        timestamps: [...b.timestamps],
      })
    }, 1000)

    const unsub = onValue(
      liveRef,
      (snap) => {
        if (!snap.exists()) return
        const d   = snap.val()
        const now = new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        })
        const point = {
          rpm: Number(d.rpm ?? 0),
          bat: Number(d.bat ?? 12.8),
          eot: Number(d.eot ?? 75),
          iat: Number(d.iat ?? 35),
          afr: Number(d.afr ?? 14.7),
        }

        const b    = bufRef.current
        const push = (arr, v) => { arr.push(v); if (arr.length > HISTORY_LEN) arr.shift() }
        push(b.rpm,        point.rpm)
        push(b.bat,        point.bat)
        push(b.eot,        point.eot)
        push(b.iat,        point.iat)
        push(b.afr,        point.afr)
        push(b.timestamps, now)

        setConnected(true)
        setLastVal(point)
      },
      (err) => {
        console.error('[Firebase] Grafik error:', err)
        setConnected(false)
      }
    )

    return () => {
      unsub()
      clearInterval(flushTimer)
    }
  }, [])

  return { hist, connected, lastVal }
}

// ════════════════════════════════════════════════════════════
//  CANVAS CHART RENDERER — dengan label sumbu X dan Y
// ════════════════════════════════════════════════════════════
function SensorChart({ label, datasets, height = 180, showRefLines, timestamps, yAxisConfig }) {
  const canvasRef    = useRef(null)
  const pendingRaf   = useRef(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    const container = canvas.parentElement
    const W = container ? container.clientWidth : canvas.offsetWidth
    if (W === 0) return
    const H = height

    const targetW = Math.round(W * dpr)
    const targetH = Math.round(H * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width  = targetW
      canvas.height = targetH
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    // ── Margin untuk label sumbu ──────────────────────────
    const PAD_L  = 46   // ruang Y-axis label kiri
    const PAD_R  = 8
    const PAD_T  = 8
    const PAD_B  = 28   // ruang X-axis label bawah
    const chartW = W - PAD_L - PAD_R
    const chartH = H - PAD_T - PAD_B

    if (!datasets || datasets.every(d => d.data.length < 2)) {
      ctx.fillStyle = 'rgba(0,50,120,0.35)'
      ctx.font      = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Menunggu data…', W / 2, H / 2)
      return
    }

    // Tentukan range Y dari dataset pertama (atau pakai yAxisConfig)
    const primary  = datasets[0]
    const yMin     = yAxisConfig ? yAxisConfig.min : primary.min
    const yMax     = yAxisConfig ? yAxisConfig.max : primary.max
    const yLabel   = yAxisConfig ? yAxisConfig.label : null
    const yFormat  = yAxisConfig ? yAxisConfig.format : (v => v % 1 === 0 ? v : v.toFixed(1))
    const ySpan    = yMax - yMin || 1

    // ── Gambar grid horizontal + label Y-axis ─────────────
    const Y_STEPS = 4
    ctx.font      = `${Math.round(8 * dpr) / dpr}px monospace`
    ctx.textAlign = 'right'

    for (let i = 0; i <= Y_STEPS; i++) {
      const frac = i / Y_STEPS
      const yPx  = PAD_T + chartH * (1 - frac)
      const yVal = yMin + frac * ySpan

      // Grid line
      ctx.strokeStyle = 'rgba(0,85,204,0.1)'
      ctx.lineWidth   = 0.5
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(PAD_L, yPx)
      ctx.lineTo(PAD_L + chartW, yPx)
      ctx.stroke()

      // Label Y
      ctx.fillStyle = 'rgba(0,50,120,0.45)'
      ctx.fillText(yFormat(yVal), PAD_L - 4, yPx + 3.5)
    }

    // Label satuan Y di pojok kiri atas
    if (yLabel) {
      ctx.save()
      ctx.font      = '8px monospace'
      ctx.fillStyle = 'rgba(0,50,120,0.35)'
      ctx.textAlign = 'left'
      ctx.fillText(yLabel, 0, PAD_T + 7)
      ctx.restore()
    }

    // ── Gambar label X-axis (timestamps) ─────────────────
    if (timestamps && timestamps.length >= 2) {
      const N = timestamps.length
      // Tampilkan 4–5 label X agar tidak terlalu padat
      const xStepCount = Math.min(4, N - 1)
      ctx.font      = '8px monospace'
      ctx.fillStyle = 'rgba(0,50,120,0.40)'

      for (let i = 0; i <= xStepCount; i++) {
        const idx  = Math.round((i / xStepCount) * (N - 1))
        const xPx  = PAD_L + (idx / (N - 1)) * chartW
        const ts   = timestamps[idx]
        // Ambil hanya jam:menit:detik, persingkat jadi mm:ss saja agar muat
        const parts = ts ? ts.split(':') : []
        const label = parts.length >= 3 ? `${parts[1]}:${parts[2]}` : ts || ''

        ctx.textAlign = i === 0 ? 'left' : i === xStepCount ? 'right' : 'center'
        ctx.fillText(label, xPx, H - 6)

        // Tick mark kecil
        ctx.strokeStyle = 'rgba(0,85,204,0.15)'
        ctx.lineWidth   = 0.6
        ctx.beginPath()
        ctx.moveTo(xPx, PAD_T + chartH)
        ctx.lineTo(xPx, PAD_T + chartH + 4)
        ctx.stroke()
      }
    }

    // ── Render setiap dataset ─────────────────────────────
    datasets.forEach(({ data, color, min: dMin, max: dMax, refLines }, dsIdx) => {
      if (data.length < 2) return

      // Dataset ke-2 dst pakai skala normalnya sendiri (sudah di-remap sebelum dikirim)
      // tapi kita render di area yang sama menggunakan yMin/yMax chart
      const span  = ySpan
      const N     = data.length
      const step  = chartW / (N - 1)
      const yOf   = v => PAD_T + chartH - ((Math.min(yMax, Math.max(yMin, v)) - yMin) / span) * chartH

      if (refLines && showRefLines) {
        refLines.forEach(({ val, color: rc, dash }) => {
          const y = yOf(val)
          ctx.save()
          ctx.strokeStyle = rc || 'rgba(0,85,204,0.2)'
          ctx.lineWidth   = 0.8
          ctx.setLineDash(dash || [])
          ctx.beginPath()
          ctx.moveTo(PAD_L, y)
          ctx.lineTo(PAD_L + chartW, y)
          ctx.stroke()
          ctx.restore()
        })
      }

      const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + chartH)
      grad.addColorStop(0, color + '30')
      grad.addColorStop(1, 'transparent')
      ctx.beginPath()
      data.forEach((v, i) => {
        const x = PAD_L + i * step
        const y = yOf(v)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.lineTo(PAD_L + (N - 1) * step, PAD_T + chartH)
      ctx.lineTo(PAD_L, PAD_T + chartH)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()

      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth   = 1.8
      ctx.lineJoin    = 'round'
      ctx.lineCap     = 'round'
      ctx.setLineDash([])
      data.forEach((v, i) => {
        const x = PAD_L + i * step
        const y = yOf(v)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Titik terkini + nilai terkini di ujung garis
      const lastX = PAD_L + (N - 1) * step
      const lastY = yOf(data[N - 1])
      ctx.beginPath()
      ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()

      // Label nilai terkini di ujung (hanya untuk dataset utama / dsIdx===0)
      if (dsIdx === 0 && yAxisConfig && yAxisConfig.showLiveLabel !== false) {
        const liveVal  = data[N - 1]
        const liveText = yFormat(liveVal)
        ctx.save()
        ctx.font      = 'bold 9px monospace'
        ctx.fillStyle = color
        ctx.textAlign = lastX > PAD_L + chartW - 30 ? 'right' : 'left'
        const lx = lastX > PAD_L + chartW - 30 ? lastX - 6 : lastX + 6
        const ly = lastY < PAD_T + 14 ? lastY + 13 : lastY - 5
        ctx.fillText(liveText, lx, ly)
        ctx.restore()
      }
    })

    // ── Border kanan sumbu Y ──────────────────────────────
    ctx.strokeStyle = 'rgba(0,85,204,0.15)'
    ctx.lineWidth   = 0.8
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(PAD_L, PAD_T)
    ctx.lineTo(PAD_L, PAD_T + chartH)
    ctx.stroke()

  }, [datasets, height, showRefLines, timestamps, yAxisConfig])

  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(pendingRaf.current)
    pendingRaf.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => {
    scheduleDraw()
    return () => cancelAnimationFrame(pendingRaf.current)
  }, [scheduleDraw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !window.ResizeObserver) return
    const target = canvas.parentElement || canvas
    const ro = new ResizeObserver(() => scheduleDraw())
    ro.observe(target)
    return () => ro.disconnect()
  }, [scheduleDraw])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px`, display: 'block', borderRadius: '4px' }}
    />
  )
}

// ════════════════════════════════════════════════════════════
//  KOMPONEN PANEL HISTORI
// ════════════════════════════════════════════════════════════
function HistoryPanel({ columns, timestamps }) {
  const n = timestamps.length
  if (n === 0) return (
    <div style={{
      fontSize: '10px', color: 'rgba(0,50,120,0.35)', fontStyle: 'italic',
      textAlign: 'center', padding: '8px 0'
    }}>
      Belum ada data histori
    </div>
  )

  const gridCols = `50px ${columns.map(() => '1fr').join(' ')}`

  return (
    <div style={{
      borderTop: '1px solid rgba(0,85,204,0.1)',
      paddingTop: '8px',
      marginTop: '6px',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gap: '4px',
        marginBottom: '4px',
        paddingBottom: '4px',
        borderBottom: '1px solid rgba(0,85,204,0.08)',
      }}>
        <span style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(0,50,120,0.4)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
          Waktu
        </span>
        {columns.map((col) => (
          <span key={col.label} style={{
            fontSize: '9px', fontWeight: 800, letterSpacing: '0.8px',
            color: col.color, textTransform: 'uppercase', textAlign: 'right'
          }}>
            {col.label}
          </span>
        ))}
      </div>

      <div style={{
        maxHeight: '96px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(0,119,255,0.2) transparent',
      }}>
        {Array.from({ length: n }, (_, i) => n - 1 - i).map((idx) => {
          const isLatest = idx === n - 1
          const hasAlert = columns.some(col => col.isAlert && col.isAlert(col.values[idx]))

          return (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                gap: '4px',
                padding: '3px 4px',
                borderRadius: '4px',
                background: isLatest
                  ? 'rgba(0,119,255,0.06)'
                  : hasAlert
                  ? 'rgba(217,38,61,0.04)'
                  : 'transparent',
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                fontSize: '10px',
                color: isLatest ? 'rgba(0,50,120,0.7)' : 'rgba(0,50,120,0.4)',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: isLatest ? 700 : 400,
              }}>
                {timestamps[idx]}
              </span>
              {columns.map((col) => {
                const val   = col.values[idx]
                const alert = col.isAlert && col.isAlert(val)
                return (
                  <span
                    key={col.label}
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: alert ? C.red : col.color,
                      opacity: isLatest ? 1 : 0.7,
                    }}
                  >
                    {col.format ? col.format(val) : val}
                    {col.unit || ''}
                    {alert ? ' ⚠' : ''}
                  </span>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  KOMPONEN CHART CARD
// ════════════════════════════════════════════════════════════
function ChartCard({ title, children, badge, badgeColor, historyPanel }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.92)',
      border: '1.5px solid rgba(0,85,204,0.18)',
      borderRadius: '14px', padding: '12px 14px',
      boxShadow: '0 2px 12px rgba(0,85,204,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{
          fontSize: '10px', fontWeight: 800, letterSpacing: '1.2px',
          color: 'rgba(0,40,110,0.65)', textTransform: 'uppercase'
        }}>
          {title}
        </span>
        {badge && (
          <span style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px',
            padding: '2px 8px', borderRadius: '5px',
            background: `${badgeColor}22`, border: `1px solid ${badgeColor}44`,
            color: badgeColor, transition: 'all 0.3s'
          }}>{badge}</span>
        )}
      </div>
      {children}
      {historyPanel}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  ANALISIS TREN
// ════════════════════════════════════════════════════════════
function analyzeTrend(hist) {
  if (!hist.afr.length) return []
  const n       = hist.afr.length
  const avg     = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const results = []

  if (n >= 5) {
    const rw = hist.rpm.slice(-5), aw = hist.afr.slice(-5)
    const rD = rw[4] - rw[0], aD = aw[4] - aw[0]
    if (avg(rw) > 3000 && rD > 500 && aD > -0.3)
      results.push({ level: 'warn', icon: '⚡', text: `RPM naik ${Math.round(rD)} rpm dalam 5 sample terakhir, AFR tidak turun signifikan (${aD >= 0 ? '+' : ''}${aD.toFixed(2)}) — injektor mungkin tidak enrichment saat akselerasi` })
  }
  if (n >= 8) {
    const es = hist.eot.slice(-8)
    if (es.every((v, i) => i === 0 || v >= es[i - 1] - 0.5) && es[7] > 85)
      results.push({ level: es[7] > 100 ? 'danger' : 'warn', icon: '🌡', text: `EOT terus naik selama 8 sample (${es[0].toFixed(1)}°C → ${es[7].toFixed(1)}°C) — awasi overheating` })
  }
  if (n >= 3) {
    const bA = avg(hist.bat.slice(-3)), rA = avg(hist.rpm.slice(-3))
    if (rA > 1000 && bA < 13.4)
      results.push({ level: 'danger', icon: '🔋', text: `Rata-rata BAT ${bA.toFixed(2)}V saat RPM ${Math.round(rA)} — alternator tidak charging (normal: 13.5–14.8V)` })
  }
  if (n >= 3) {
    const iA = avg(hist.iat.slice(-3)), aA = avg(hist.afr.slice(-3))
    if (iA > 45 && aA > 15.2)
      results.push({ level: 'warn', icon: '💨', text: `Rata-rata IAT ${iA.toFixed(1)}°C + AFR ${aA.toFixed(2)} lean — ECU tidak kompensasi udara panas` })
  }
  if (!results.length)
    results.push({ level: 'ok', icon: '✦', text: 'Tidak ada anomali tren terdeteksi — semua korelasi sensor dalam batas normal' })

  return results
}

// ════════════════════════════════════════════════════════════
//  KOMPONEN PEMBANTU
// ════════════════════════════════════════════════════════════
function LegendItem({ color, label, value, unit = '' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <div style={{ width: '12px', height: '2.5px', borderRadius: '2px', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '10px', color: 'rgba(0,50,120,0.55)', fontWeight: 700, fontStyle: 'italic' }}>
        {label}
        {value !== undefined && (
          <span style={{ color, marginLeft: '4px', transition: 'color 0.3s' }}>{value}{unit}</span>
        )}
      </span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  KOMPONEN UTAMA
// ════════════════════════════════════════════════════════════
function Grafik() {
  const { hist, connected, lastVal } = useHistory()
  const [showRef, setShowRef]        = useState(true)

  const trends    = analyzeTrend(hist)
  const hasDanger = trends.some(t => t.level === 'danger')

  const trendLevelStyle = {
    danger: { bg: 'rgba(217,38,61,0.07)',  border: 'rgba(217,38,61,0.25)'  },
    warn:   { bg: 'rgba(224,123,0,0.07)',  border: 'rgba(224,123,0,0.25)'  },
    ok:     { bg: 'rgba(0,168,90,0.06)',   border: 'rgba(0,168,90,0.2)'    },
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden'
    }}>
      <div className="checker-board"><div className="checker-grid"></div></div>

      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div style={{
        zIndex: 2, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: '1px solid rgba(0,85,204,0.12)',
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(6px)',
      }}>
        {/* Kiri: status + pts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '6px',
            background: connected ? 'rgba(0,168,90,0.08)' : 'rgba(217,38,61,0.08)',
            border: `1px solid ${connected ? 'rgba(0,168,90,0.25)' : 'rgba(217,38,61,0.25)'}`,
          }}>
            <span style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px',
              color: connected ? C.bat : C.red
            }}>
              {connected ? '● LIVE' : '○ OFFLINE'}
            </span>
            <span style={{ fontSize: '10px', color: 'rgba(0,50,120,0.45)' }}>
              {hist.rpm.length} pts
            </span>
          </div>
          {hasDanger && (
            <div style={{
              padding: '4px 10px', borderRadius: '6px',
              background: 'rgba(217,38,61,0.08)', border: '1px solid rgba(217,38,61,0.3)',
              fontSize: '10px', fontWeight: 800, color: C.red, letterSpacing: '0.5px'
            }}>
              ⚠ ANOMALI TERDETEKSI
            </div>
          )}
        </div>

        {/* Tengah: nilai terkini inline */}
        {lastVal && (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            {[
              { label: 'RPM', val: lastVal.rpm.toLocaleString(), unit: '',    color: C.rpm },
              { label: 'AFR', val: lastVal.afr.toFixed(2),       unit: '',    color: C.afr },
              { label: 'BAT', val: lastVal.bat.toFixed(2),       unit: 'V',  color: C.bat },
              { label: 'EOT', val: lastVal.eot.toFixed(1),       unit: '°C', color: C.eot },
              { label: 'IAT', val: lastVal.iat.toFixed(1),       unit: '°C', color: C.iat },
            ].map(r => (
              <div key={r.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'rgba(0,50,120,0.45)', letterSpacing: '0.8px', fontWeight: 700 }}>{r.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: r.color, transition: 'color 0.3s', lineHeight: 1.1 }}>
                  {r.val}{r.unit}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Kanan: toggle REF */}
        <button
          onClick={() => setShowRef(v => !v)}
          style={{
            padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
            background: showRef ? 'rgba(0,119,255,0.1)' : 'rgba(0,85,204,0.05)',
            border: `1px solid ${showRef ? 'rgba(0,119,255,0.35)' : 'rgba(0,85,204,0.15)'}`,
            color: showRef ? '#0077ff' : 'rgba(0,50,120,0.45)',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px',
            fontFamily: "'Exo 2', sans-serif", transition: 'all 0.2s'
          }}>
          {showRef ? 'REF ON' : 'REF OFF'}
        </button>
      </div>

      {/* ── Area Chart ──────────────────────────────────────── */}
      <div style={{
        flex: 1, zIndex: 1,
        display: 'flex', flexDirection: 'column', gap: '10px',
        overflowY: 'auto', overflowX: 'hidden',
        padding: '10px 16px 16px 16px',
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,119,255,0.3) transparent',
      }}>

        {/* Grid 2 kolom: Chart 1 + Chart 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>

          {/* CHART 1: RPM + AFR */}
          <ChartCard
            title="RPM vs AFR — Korelasi Akselerasi"
            badge={lastVal ? `${lastVal.rpm.toLocaleString()} rpm` : '—'}
            badgeColor={C.rpm}
            historyPanel={
              <HistoryPanel
                timestamps={hist.timestamps}
                columns={[
                  {
                    label: 'RPM',
                    values: hist.rpm,
                    color: C.rpm,
                    format: v => v.toLocaleString(),
                    unit: '',
                    isAlert: v => v > 6500,
                  },
                  {
                    label: 'AFR',
                    values: hist.afr,
                    color: C.afr,
                    format: v => v.toFixed(2),
                    unit: '',
                    isAlert: v => v > 16 || v < 12,
                  },
                ]}
              />
            }
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <LegendItem color={C.rpm} label="RPM" value={lastVal?.rpm.toLocaleString()} />
              <LegendItem color={C.afr} label="AFR (ternorm.)" value={lastVal?.afr.toFixed(2)} />
            </div>
            <SensorChart
              label="RPM-AFR"
              height={180}
              showRefLines={showRef}
              timestamps={hist.timestamps}
              yAxisConfig={{
                min: 0, max: 8500,
                label: 'rpm',
                format: v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`,
                showLiveLabel: true,
              }}
              datasets={[
                {
                  data: hist.rpm, color: C.rpm, min: 0, max: 8500,
                  refLines: [
                    { val: 900,  color: 'rgba(0,119,255,0.25)', dash: [4, 4] },
                    { val: 4000, color: 'rgba(224,123,0,0.2)',  dash: [3, 3] },
                  ]
                },
                {
                  data: hist.afr.map(v => ((v - 9) / 11) * 8500),
                  color: C.afr, min: 0, max: 8500,
                  refLines: [{ val: ((14.7 - 9) / 11) * 8500, color: 'rgba(224,123,0,0.35)', dash: [5, 3] }]
                }
              ]}
            />
            <div style={{ fontSize: '10px', color: 'rgba(0,50,120,0.38)', marginTop: '5px', fontStyle: 'italic' }}>
              AFR dinormalisasi ke skala RPM • garis putus = stoich 14.7
            </div>
          </ChartCard>

          {/* CHART 2: BAT vs RPM */}
          <ChartCard
            title="BAT vs RPM — Monitoring Alternator"
            badge={lastVal ? `${lastVal.bat.toFixed(2)}V` : '—'}
            badgeColor={lastVal && lastVal.bat >= 13.5 ? C.bat : lastVal && lastVal.bat < 12.5 ? C.red : '#e07b00'}
            historyPanel={
              <HistoryPanel
                timestamps={hist.timestamps}
                columns={[
                  {
                    label: 'BAT',
                    values: hist.bat,
                    color: C.bat,
                    format: v => v.toFixed(2),
                    unit: 'V',
                    isAlert: v => v < 12.5,
                  },
                  {
                    label: 'RPM',
                    values: hist.rpm,
                    color: C.rpm,
                    format: v => v.toLocaleString(),
                    unit: '',
                    isAlert: v => v > 6500,
                  },
                ]}
              />
            }
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <LegendItem color={C.bat} label="BAT" value={lastVal?.bat.toFixed(2)} unit="V" />
              <LegendItem color={C.rpm} label="RPM (skala kanan)" value={lastVal?.rpm.toLocaleString()} unit=" rpm" />
            </div>
            <SensorChart
              label="BAT-RPM"
              height={180}
              showRefLines={showRef}
              timestamps={hist.timestamps}
              yAxisConfig={{
               min: 10.5, max: 15.5,
                label: 'Volt / RPM (norm)',   
                format: v => v.toFixed(1),
                showLiveLabel: true,
                }}
              datasets={[
                {
                  data: hist.bat, color: C.bat, min: 10.5, max: 15.5,
                  refLines: [
                    { val: 13.5, color: 'rgba(0,168,90,0.4)',   dash: [5, 3] },
                    { val: 12.5, color: 'rgba(217,38,61,0.35)', dash: [3, 3] },
                  ]
                },
                {
                  data: hist.rpm.map(v => 10.5 + (v / 8500) * 5),
                  color: C.rpm,        // ← hapus '80', pakai warna penuh
                  min: 10.5, max: 15.5,
}
              ]}
            />
            <div style={{ fontSize: '10px', color: 'rgba(0,50,120,0.38)', marginTop: '5px', fontStyle: 'italic' }}>
              Hijau = 13.5V batas charging • merah = 12.5V batas low
            </div>
          </ChartCard>
        </div>

        {/* Grid 2 kolom: Chart 3 + Chart 4 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>

          {/* CHART 3: EOT + IAT */}
          <ChartCard
            title="EOT vs IAT — Manajemen Suhu"
            badge={lastVal ? `EOT ${lastVal.eot.toFixed(1)}°C` : '—'}
            badgeColor={lastVal && lastVal.eot > 100 ? C.red : lastVal && lastVal.eot > 85 ? '#e07b00' : C.eot}
            historyPanel={
              <HistoryPanel
                timestamps={hist.timestamps}
                columns={[
                  {
                    label: 'EOT',
                    values: hist.eot,
                    color: C.eot,
                    format: v => v.toFixed(1),
                    unit: '°C',
                    isAlert: v => v > 110,
                  },
                  {
                    label: 'IAT',
                    values: hist.iat,
                    color: C.iat,
                    format: v => v.toFixed(1),
                    unit: '°C',
                    isAlert: v => v > 50,
                  },
                ]}
              />
            }
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <LegendItem color={C.eot} label="EOT" value={lastVal?.eot.toFixed(1)} unit="°C" />
              <LegendItem color={C.iat} label="IAT" value={lastVal?.iat.toFixed(1)} unit="°C" />
            </div>
            <SensorChart
              label="EOT-IAT"
              height={180}
              showRefLines={showRef}
              timestamps={hist.timestamps}
              yAxisConfig={{
                min: 30, max: 130,
                label: '°C',
                format: v => `${v}°`,
                showLiveLabel: true,
              }}
              datasets={[
                {
                  data: hist.eot, color: C.eot, min: 30, max: 130,
                  refLines: [
                    { val: 70,  color: 'rgba(217,95,0,0.3)',  dash: [5, 3] },
                    { val: 110, color: 'rgba(217,38,61,0.4)', dash: [3, 3] },
                  ]
                },
                {
                  data: hist.iat, color: C.iat, min: 30, max: 130,
                  refLines: [{ val: 45, color: 'rgba(45,111,212,0.3)', dash: [4, 4] }]
                }
              ]}
            />
            <div style={{ fontSize: '10px', color: 'rgba(0,50,120,0.38)', marginTop: '5px', fontStyle: 'italic' }}>
              EOT ideal 70–110°C • IAT tinggi &gt;45°C = udara kurang padat
            </div>
          </ChartCard>

          {/* CHART 4: AFR Detail */}
          <ChartCard
            title="AFR — Air Fuel Ratio Detail"
            badge={(() => {
              if (!lastVal) return '—'
              const v = lastVal.afr
              return v < 12 ? 'KAYA' : v < 13.5 ? 'RICH' : v >= 14.5 && v <= 14.9 ? 'STOICH' : v < 14.5 ? '~STOICH' : v <= 16 ? 'LEAN' : 'MISKIN'
            })()}
            badgeColor={(() => {
              if (!lastVal) return '#555'
              const v = lastVal.afr
              return v >= 14.4 && v <= 15.0 ? C.bat : v > 16 || v < 12 ? C.red : '#e07b00'
            })()}
            historyPanel={
              <HistoryPanel
                timestamps={hist.timestamps}
                columns={[
                  {
                    label: 'AFR',
                    values: hist.afr,
                    color: C.afr,
                    format: v => v.toFixed(2),
                    unit: '',
                    isAlert: v => v > 16 || v < 12,
                  },
                  {
                    label: 'STATUS',
                    values: hist.afr,
                    color: 'rgba(0,50,120,0.55)',
                    format: v => v < 12 ? 'KAYA' : v < 13.5 ? 'RICH' : v >= 14.4 && v <= 15.0 ? 'STOICH' : v < 14.5 ? '~STOICH' : v <= 16 ? 'LEAN' : 'MISKIN',
                    unit: '',
                    isAlert: v => v > 16 || v < 12,
                  },
                ]}
              />
            }
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <LegendItem color={C.afr} label="AFR" value={lastVal?.afr.toFixed(2)} />
            </div>
            <SensorChart
              label="AFR"
              height={180}
              showRefLines={showRef}
              timestamps={hist.timestamps}
              yAxisConfig={{
                min: 9, max: 20,
                label: 'λ AFR',
                format: v => v.toFixed(1),
                showLiveLabel: true,
              }}
              datasets={[
                {
                  data: hist.afr, color: C.afr, min: 9, max: 20,
                  refLines: [
                    { val: 14.7, color: 'rgba(0,168,90,0.5)',  dash: [5, 3] },
                    { val: 16.0, color: 'rgba(217,38,61,0.4)', dash: [3, 3] },
                    { val: 12.0, color: 'rgba(217,95,0,0.35)', dash: [4, 3] },
                  ]
                }
              ]}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              {['9', 'KAYA 12', 'STOICH 14.7', 'LEAN 16', '20'].map(l => (
                <span key={l} style={{ fontSize: '9px', color: 'rgba(0,50,120,0.35)', fontStyle: 'italic' }}>{l}</span>
              ))}
            </div>
          </ChartCard>
        </div>

        {/* Analisis Tren — full width */}
        <div style={{
          fontSize: '11px', color: 'rgba(0,55,140,0.5)',
          letterSpacing: '0.12em', fontWeight: 800, textTransform: 'uppercase',
          paddingLeft: '2px', paddingTop: '4px'
        }}>
          Analisis Tren ({hist.rpm.length} sample)
        </div>

        {trends.map((t, i) => {
          const s = trendLevelStyle[t.level] || trendLevelStyle.ok
          return (
            <div key={i} style={{
              background: s.bg, border: `1.5px solid ${s.border}`,
              borderRadius: '12px', padding: '10px 14px',
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              opacity: 1, transition: 'opacity 0.3s ease'
            }}>
              <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>{t.icon}</span>
              <div style={{
                fontSize: 'clamp(11px,1.2vw,13px)', color: 'rgba(0,40,100,0.82)',
                fontWeight: 700, fontStyle: 'italic', lineHeight: 1.5
              }}>
                {t.text}
              </div>
            </div>
          )
        })}

        {!connected && hist.rpm.length === 0 && (
          <div style={{
            padding: '16px 18px', borderRadius: '12px',
            background: 'rgba(224,123,0,0.06)', border: '1px solid rgba(224,123,0,0.2)',
            fontSize: '12px', color: 'rgba(0,50,120,0.65)', fontStyle: 'italic', lineHeight: 1.7
          }}>
            ⚠ Tidak terhubung Firebase.<br />
            Pastikan ESP32 aktif dan mengirim data ke <code style={{ color: '#e07b00' }}>{FB_PATH}</code>
          </div>
        )}
      </div>
    </div>
  )
}

export default Grafik