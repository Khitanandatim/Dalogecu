import { useState, useEffect, useRef } from 'react'
import { initializeApp, getApps }         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getDatabase, ref, onValue }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'

// ── Firebase init (singleton — aman untuk React StrictMode) ──
const firebaseConfig = {
  apiKey:      "AIzaSyBAaslSPUuviuQYy80FbuP9V6C9Gtcn_0g",
  databaseURL: "https://dalogecu-default-rtdb.firebaseio.com/"
}
const _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const _db  = getDatabase(_app)

// ── Path Firebase — harus sama dengan yang dikirim ESP32 ──────
const FB_PATH = '/ecu/live'

// ═══════════════════════════════════════════════════════════
//  Hooks & Komponen pembantu
// ═══════════════════════════════════════════════════════════
function useSmoothed(target, speed = 0.25) {
  const [display, setDisplay] = useState(target)
  const current = useRef(target)
  const raf     = useRef(null)

  useEffect(() => {
    const animate = () => {
      const diff = target - current.current
      if (Math.abs(diff) < 0.5) {
        current.current = target
        setDisplay(target)
        return
      }
      current.current += diff * speed
      setDisplay(current.current)
      raf.current = requestAnimationFrame(animate)
    }
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf.current)
  }, [target])

  return display
}

function PulseBar({ value, max, color = 'var(--accent-cyan)' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{
      width: '100%', height: '5px', borderRadius: '4px',
      background: 'rgba(255,255,255,0.1)', marginTop: '6px', overflow: 'hidden'
    }}>
      <div style={{
        height: '100%', width: `${pct}%`, borderRadius: '4px',
        background: color, boxShadow: `0 0 8px ${color}`,
        transition: 'width 0.15s ease-out'
      }} />
    </div>
  )
}

function StatusDot({ status }) {
  const color = status === 'OK'       ? '#00e676'
              : status === 'FAIL'     ? '#ff4d6d'
              : status === 'COLD'     ? '#40c4ff'
              : status === 'HOT'      ? '#ff4d6d'
              : status === 'LOW'      ? '#ffb703'
              : status === 'HIGH'     ? '#ff4d6d'
              : status === 'OVERHEAT' ? '#ff4d6d'
              : status === 'LOW_VOLT' ? '#ffb703'
              : '#555'
  return (
    <span style={{
      display: 'inline-block', width: '8px', height: '8px',
      borderRadius: '50%', background: color,
      boxShadow: `0 0 5px ${color}`,
      marginLeft: '8px', verticalAlign: 'middle',
      transition: 'background 0.3s, box-shadow 0.3s'
    }} />
  )
}

function LiveNumber({ value, decimals = 0, suffix = '', style = {} }) {
  const smooth  = useSmoothed(value, 0.3)
  const display = decimals > 0
    ? smooth.toFixed(decimals)
    : Math.round(smooth).toLocaleString()
  return (
    <span style={{ transition: 'color 0.3s', ...style }}>
      {display}
      {suffix && <span style={{ fontSize: '0.45em', opacity: 0.7, marginLeft: '4px' }}>{suffix}</span>}
    </span>
  )
}

function AfrBadge({ afr }) {
  const color = afr < 12.0              ? '#ff4d6d'
              : afr < 13.5              ? '#ff8c42'
              : afr >= 14.5 && afr <= 14.9 ? '#00e676'
              : afr < 14.5              ? '#ffb703'
              : afr <= 16.0             ? '#ffb703'
              :                           '#ff4d6d'
  const label = afr < 12.0              ? 'KAYA'
              : afr < 13.5              ? 'RICH'
              : afr >= 14.5 && afr <= 14.9 ? 'STOICH'
              : afr < 14.5              ? '~STOICH'
              : afr <= 16.0             ? 'LEAN'
              :                           'MISKIN'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
      <span style={{
        fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px',
        padding: '2px 8px', borderRadius: '4px',
        background: `${color}22`, border: `1px solid ${color}55`, color,
        transition: 'all 0.3s'
      }}>{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
//  Komponen Dashboard utama
// ═══════════════════════════════════════════════════════════
function Dashboard() {
  const [connected,   setConnected]   = useState(false)
  const [lastUpdate,  setLastUpdate]  = useState('--')
  const [updateCount, setUpdateCount] = useState(0)

  // ── State sensor — field sesuai yang dikirim ESP32 ─────────
  // ESP32 mengirim: rpm, bat, eot, iat, afr, ts
  const [rpm,   setRpm]   = useState(0)
  const [bat,   setBat]   = useState(0)
  const [eot,   setEot]   = useState(0)
  const [iat,   setIat]   = useState(0)
  const [afr,   setAfr]   = useState(14.7)

  // ── Field tambahan (opsional, dikirim jika ESP32 mendukung) ─
  // Jika ESP32 belum kirim field ini, nilai default dipakai
  const [ckp,   setCkp]   = useState('OK')
  const [batSt, setBatSt] = useState('--')
  const [eotSt, setEotSt] = useState('--')
  const [iatSt, setIatSt] = useState('--')
  const [inj,   setInj]   = useState('--')

  useEffect(() => {
    // ── Subscribe ke /ecu/live (path sama dengan ESP32) ──────
    const liveRef = ref(_db, FB_PATH)
    const unsub   = onValue(
      liveRef,
      (snap) => {
        if (!snap.exists()) return
        const d = snap.val()

        // Field wajib dari ESP32
        setRpm(Number(d.rpm ?? 0))
        setBat(Number(d.bat ?? 0))
        setEot(Number(d.eot ?? 0))
        setIat(Number(d.iat ?? 0))
        setAfr(Number(d.afr ?? 14.7))

        // Field opsional — tampilkan jika ada, default jika tidak
        setCkp(  d.ckp    ?? 'OK')
        setBatSt(d.bat_st ?? '--')
        setEotSt(d.eot_st ?? '--')
        setIatSt(d.iat_st ?? '--')
        setInj(  d.inj    ?? '--')

        setConnected(true)
        setLastUpdate(new Date().toLocaleTimeString('id-ID'))
        setUpdateCount(c => c + 1)
      },
      (err) => {
        console.error('[Firebase] Dashboard error:', err)
        setConnected(false)
      }
    )
    return () => unsub()
  }, [])

  const battColor = bat < 12.0 ? '#ff4d6d' : bat < 12.8 ? '#ffb703' : '#00e676'
  const eotColor  = eot > 100  ? '#ff4d6d' : eot > 85   ? '#ffb703' : 'var(--accent-cyan, #00e5ff)'
  const rpmColor  = ckp === 'OK' ? 'var(--accent-cyan, #00e5ff)' : '#ff4d6d'
  const injColor  = inj === 'OK' ? '#00e676' : inj === 'OVERHEAT' ? '#ff4d6d' : '#ffb703'
  const afrColor  = afr < 12.0 ? '#ff4d6d'
                  : afr >= 14.5 && afr <= 14.9 ? '#00e676'
                  : '#ffb703'

  return (
    <div className="page-container">
      <div className="checker-board"><div className="checker-grid"></div></div>

      {/* ── Panel Kiri ──────────────────────────────────────── */}
      <div className="left-section">
        <div className="brand-title">TI TECH.</div>

        {/* Status Koneksi Firebase */}
        <div style={{
          marginTop: '16px', padding: '10px 12px', borderRadius: '8px',
          background: connected ? 'rgba(0,230,118,0.08)' : 'rgba(255,77,109,0.08)',
          border: `1px solid ${connected ? 'rgba(0,230,118,0.25)' : 'rgba(255,77,109,0.25)'}`,
          transition: 'all 0.3s'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px',
            color: connected ? '#00e676' : '#ff4d6d' }}>
            {connected ? '● LIVE' : '○ OFFLINE'}
          </div>
          {connected && (
            <>
              <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '3px', color: 'white' }}>
                {lastUpdate}
              </div>
              <div style={{ fontSize: '10px', opacity: 0.4, color: 'white' }}>
                #{updateCount} updates
              </div>
            </>
          )}
          {!connected && (
            <div style={{ fontSize: '10px', opacity: 0.55, marginTop: '4px', color: '#ff4d6d' }}>
              Cek koneksi ESP32
            </div>
          )}
        </div>

        {/* INJ Status */}
        <div style={{
          marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)'
        }}>
          <div style={{ fontSize: '10px', opacity: 0.45, color: 'white', letterSpacing: '1px', marginBottom: '4px' }}>
            INJECTOR
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: injColor,
            letterSpacing: '1px', transition: 'color 0.3s' }}>
            {inj === '--' ? '—' : inj}
          </div>
        </div>

        {/* CKP Status */}
        <div style={{
          marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)'
        }}>
          <div style={{ fontSize: '10px', opacity: 0.45, color: 'white', letterSpacing: '1px', marginBottom: '4px' }}>
            CKP SENSOR
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700,
            color: ckp === 'OK' ? '#00e676' : '#ff4d6d',
            letterSpacing: '1px', transition: 'color 0.3s' }}>
            {ckp}
          </div>
        </div>

        {/* RPM Load Status Kiri */}
        <div style={{
          marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)'
        }}>
          <div style={{ fontSize: '10px', opacity: 0.45, color: 'white', letterSpacing: '1px', marginBottom: '4px' }}>
            RPM LOAD
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-cyan, #00e5ff)',
            letterSpacing: '1px', transition: 'color 0.3s' }}>
            {Math.round(rpm / 8500 * 100)}%
          </div>
        </div>

        {/* Info path Firebase (debug kecil) */}
        <div style={{
          marginTop: '10px', padding: '6px 10px', borderRadius: '6px',
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', lineHeight: 1.5 }}>
            db: {FB_PATH}
          </div>
        </div>
      </div>

      {/* ── Panel Kanan ─────────────────────────────────────── */}
      <div className="right-section">

        {/* RPM Utama */}
        <div className="card card-rpm">
          <span className="card-label">
            RPM ENGINE <StatusDot status={ckp} />
          </span>
          <span className="card-value rpm-value">
            <LiveNumber value={rpm} decimals={0} style={{ color: rpmColor }} />
            <span style={{ fontSize: '0.4em', opacity: 0.6, marginLeft: '6px' }}>RPM</span>
          </span>
          <PulseBar value={rpm} max={8500} color={rpmColor} />
        </div>

        {/* Baris 2: Battery + EOT */}
        <div className="cards-row">
          <div className="card">
            <span className="card-label">
              Battery Voltage <StatusDot status={batSt} />
            </span>
            <span className="card-value"
              style={{ fontSize: 'clamp(22px,3.5vw,46px)', transition: 'color 0.3s', color: battColor }}>
              <LiveNumber value={bat} decimals={2} />
              <span style={{ fontSize: '0.5em', opacity: 0.8, marginLeft: '4px' }}>V</span>
            </span>
            <PulseBar value={bat - 10} max={5.5} color={battColor} />
          </div>

          <div className="card">
            <span className="card-label">
              Engine Oil Temp <StatusDot status={eotSt} />
            </span>
            <span className="card-value"
              style={{ fontSize: 'clamp(22px,3.5vw,46px)', color: eotColor, transition: 'color 0.3s' }}>
              <LiveNumber value={eot} decimals={1} />
              <sup style={{ fontSize: '0.45em' }}>°C</sup>
            </span>
            <PulseBar value={eot} max={120} color={eotColor} />
          </div>
        </div>

        {/* Baris 3: IAT + RPM Load */}
        <div className="cards-row">
          <div className="card">
            <span className="card-label">
              Intake Air Temp <StatusDot status={iatSt} />
            </span>
            <span className="card-value" style={{ fontSize: 'clamp(22px,3.5vw,46px)' }}>
              <LiveNumber value={iat} decimals={1} />
              <sup style={{ fontSize: '0.45em' }}>°C</sup>
            </span>
            <PulseBar value={iat} max={65} color="var(--blue-pale, #82b4ff)" />
          </div>

          <div className="card">
            <span className="card-label">
              Air Fuel Ratio
            </span>
            <span className="card-value"
              style={{ fontSize: 'clamp(22px,3.5vw,46px)', color: afrColor, transition: 'color 0.3s' }}>
              <LiveNumber value={afr} decimals={2} />
            </span>
            <AfrBadge afr={afr} />
            <PulseBar value={afr - 9} max={11} color={afrColor} />
          </div>
        </div>

      </div>
    </div>
  )
}

export default Dashboard