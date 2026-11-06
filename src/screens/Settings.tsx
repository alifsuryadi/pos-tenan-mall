import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import * as repo from '../data/repo'
import { monthKey } from '../domain/calc'
import type { Backup, Tenant } from '../domain/schemas'
import { reportError, useToast } from '../store'
import { Button, Field, Input, Modal, PageTitle, Select, dateTime, downloadFile, monthLabel, pickJsonFile } from '../ui/kit'

const MAX_QRIS_BYTES = 1_000_000

export function Settings({ ctx, tenant }: { ctx: repo.Ctx; tenant: Tenant }) {
  const settings = useLiveQuery(() => repo.getSettings(ctx), [ctx.tenantId])
  const users = useLiveQuery(() => repo.listUsers(ctx.tenantId), [ctx.tenantId]) ?? []
  const [tax, setTax] = useState('')
  const [footer, setFooter] = useState('')
  const [paper, setPaper] = useState<58 | 80>(58)
  const [restoring, setRestoring] = useState<Backup | null>(null)
  const [pinFor, setPinFor] = useState<string | null>(null)
  const [newPin, setNewPin] = useState('')

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    return monthKey(new Date(d.getFullYear(), d.getMonth() - i, 1))
  })
  const [month, setMonth] = useState(months[1])

  useEffect(() => {
    if (!settings) return
    setTax(String(settings.taxRate))
    setFooter(settings.receiptFooter)
    setPaper(settings.paperWidth)
  }, [settings?.taxRate, settings?.receiptFooter, settings?.paperWidth]) // eslint-disable-line

  if (!settings) return null

  const ok = (message: string) => useToast.getState().show(message)

  const backup = async () => {
    try {
      const data = await repo.exportBackup(ctx)
      downloadFile(`backup-${tenant.unit}-${data.exportedAt.slice(0, 10)}.json`, JSON.stringify(data))
      ok('File backup diunduh. Simpan di flashdisk atau tempat lain di luar perangkat ini.')
    } catch (err) {
      reportError(err)
    }
  }

  const rekap = async () => {
    try {
      const data = await repo.exportRekap(ctx, month)
      downloadFile(`rekap-${tenant.unit}-${month}.json`, JSON.stringify(data))
      ok('File rekap diunduh. Kirimkan ke pengelola mall.')
    } catch (err) {
      reportError(err)
    }
  }

  const uploadQris = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      if (file.size > MAX_QRIS_BYTES) return reportError(new Error('Gambar QRIS maksimal 1 MB.'))
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          await repo.saveSettings(ctx, { qrisImage: String(reader.result) })
          ok('Gambar QRIS disimpan.')
        } catch (err) {
          reportError(err)
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      <PageTitle title="Pengaturan" />

      <section>
        <h2 className="font-sign text-2xl font-semibold">Backup data</h2>
        <p className="mt-1 mb-3 max-w-prose text-muted">
          Data toko hanya ada di perangkat ini. Kalau perangkat rusak atau data browser terhapus, data hanya bisa kembali dari file backup.
          {settings.lastBackupAt ? ` Backup terakhir ${dateTime(settings.lastBackupAt)}.` : ' Belum pernah dibackup.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button tone="primary" onClick={backup}>
            Unduh backup
          </Button>
          <Button
            onClick={() =>
              pickJsonFile(
                (raw) => {
                  try {
                    const parsed = repo.parseBackup(raw)
                    if (parsed.tenant.id !== ctx.tenantId) throw new repo.UserError(`File ini milik ${parsed.tenant.name}, bukan toko ini.`)
                    setRestoring(parsed)
                  } catch (err) {
                    reportError(err)
                  }
                },
                reportError,
              )
            }
          >
            Pulihkan dari file
          </Button>
        </div>
      </section>

      <section>
        <h2 className="font-sign text-2xl font-semibold">Rekap untuk pengelola mall</h2>
        <p className="mt-1 mb-3 max-w-prose text-muted">File rekap hanya berisi total per bulan, tanpa daftar produk dan transaksi.</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Bulan">
            <Select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={rekap}>Unduh file rekap</Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-sign text-2xl font-semibold">Struk dan pajak</h2>
        <form
          className="grid max-w-xl gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await repo.saveSettings(ctx, { taxRate: Number(tax), receiptFooter: footer, paperWidth: paper })
              ok('Pengaturan disimpan.')
            } catch (err) {
              reportError(err)
            }
          }}
        >
          <Field label="Pajak (%)">
            <Input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
          </Field>
          <Field label="Lebar kertas struk">
            <Select value={paper} onChange={(e) => setPaper(Number(e.target.value) as 58 | 80)}>
              <option value={58}>58 mm</option>
              <option value={80}>80 mm</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Catatan di bawah struk">
              <Input value={footer} onChange={(e) => setFooter(e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Button tone="primary" type="submit">
              Simpan pengaturan
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-1 font-sign text-2xl font-semibold">QRIS toko</h2>
        <p className="mb-3 max-w-prose text-muted">Gambar ini tampil saat kasir memilih pembayaran QRIS.</p>
        {settings.qrisImage && <img src={settings.qrisImage} alt="Kode QRIS toko" className="mb-3 max-h-48" />}
        <Button onClick={uploadQris}>{settings.qrisImage ? 'Ganti gambar QRIS' : 'Pasang gambar QRIS'}</Button>
      </section>

      <section>
        <h2 className="mb-3 font-sign text-2xl font-semibold">PIN akun</h2>
        <ul className="max-w-xl divide-y divide-line bg-surface">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-4 py-2">
              <span className="font-medium">{u.name}</span>
              <Button
                onClick={() => {
                  setNewPin('')
                  setPinFor(u.id)
                }}
              >
                Ganti PIN
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {pinFor && (
        <Modal title="Ganti PIN" onClose={() => setPinFor(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await repo.changePin(ctx, pinFor, newPin)
                ok('PIN diganti.')
                setPinFor(null)
              } catch (err) {
                reportError(err)
              }
            }}
          >
            <Field label="PIN baru" hint="4 sampai 6 angka">
              <Input autoFocus type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value)} />
            </Field>
            <Button tone="primary" type="submit" className="mt-3 w-full">
              Simpan PIN
            </Button>
          </form>
        </Modal>
      )}

      {restoring && (
        <Modal title="Pulihkan backup?" onClose={() => setRestoring(null)}>
          <p>
            Semua data {tenant.name} di perangkat ini akan diganti dengan isi file dari {dateTime(restoring.exportedAt)} ({restoring.sales.length} transaksi). Transaksi yang lebih baru dari file itu akan hilang.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setRestoring(null)}>Jangan pulihkan</Button>
            <Button
              tone="danger"
              onClick={async () => {
                try {
                  await repo.restoreBackup(ctx, restoring)
                  ok('Data dipulihkan.')
                  setRestoring(null)
                } catch (err) {
                  reportError(err)
                }
              }}
            >
              Ganti dan pulihkan
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
