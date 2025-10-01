import 'dotenv/config'
import http from 'http'
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, getContentType } from '@adiwajshing/baileys'
import Pino from 'pino'
import qrcode from 'qrcode-terminal'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pushOrder, db } from './lib/db.js'
import { toJid, isAdmin, nowWIBTime } from './lib/helpers.js'
import { welcomeList, vidioCatalogue, paymentCaption } from './lib/replies.js'
import { nanoid } from 'nanoid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OWNER_JID = toJid(process.env.OWNER_PHONE || '085790631070')

// Tiny keepalive HTTP server for Replit/Railway
const port = process.env.PORT || 3000
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type': 'application/json'})
    res.end(JSON.stringify({ ok: true, orders: db.data.orders.length }))
  } else {
    res.writeHead(200, {'Content-Type': 'text/plain'})
    res.end('WA bot is running')
  }
}).listen(port, () => console.log('HTTP keepalive on :' + port))

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(process.env.SESSION_DIR || '.wawa_session')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
    logger: Pino({ level: 'silent' })
  })

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) start()
    } else if (connection === 'open') {
      console.log('✅ Bot connected.')
    }
  })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages?.[0]
    if (!msg || msg.key?.remoteJid === 'status@broadcast') return

    const from = msg.key.remoteJid
    const isGroup = from.endsWith('@g.us')
    const sender = jidNormalizedUser(msg.key.participant || msg.key.remoteJid)
    const contentType = getContentType(msg.message) || 'textMessage'
    const bodyText = extractText(msg)

    if (!isGroup) return

    const text = (bodyText || '').trim()
    const lower = text.toLowerCase()

    if (lower === 'list' || lower === '.list') {
      const timeWIB = nowWIBTime()
      await sock.sendMessage(from, { text: welcomeList(timeWIB) }, { quoted: msg })
      return
    }

    if (lower === 'vidio') {
      await sock.sendMessage(from, { text: vidioCatalogue }, { quoted: msg })
      return
    }

    if (lower === 'payment') {
      const qrisPath = path.join(__dirname, 'assets', 'qris.jpg')
      const exists = fs.existsSync(qrisPath)
      if (!exists) {
        await sock.sendMessage(from, { text: 'QRIS belum diunggah. Taruh gambar di assets/qris.jpg' }, { quoted: msg })
      } else {
        await sock.sendMessage(from, { image: fs.readFileSync(qrisPath), caption: paymentCaption }, { quoted: msg })
      }
      return
    }

    if (contentType === 'imageMessage' && msg.message.imageMessage?.caption) {
      const cap = msg.message.imageMessage.caption.trim()
      if (/^pay\s+/i.test(cap)) {
        await handlePaymentProof(sock, from, msg, sender, cap, 'image')
        return
      }
    }
    if (/^pay\s+/i.test(lower)) {
      await handlePaymentProof(sock, from, msg, sender, text, 'text')
      return
    }

    if (lower === '.tutup') {
      if (!(await isAdmin(sock, from, sender))) return
      await sock.groupSettingUpdate(from, 'announcement')
      await sock.sendMessage(from, { text: '🔒 Grup ditutup (hanya admin yang bisa kirim pesan).' })
      return
    }
    if (lower === '.buka') {
      if (!(await isAdmin(sock, from, sender))) return
      await sock.groupSettingUpdate(from, 'not_announcement')
      await sock.sendMessage(from, { text: '🔓 Grup dibuka (semua anggota bisa kirim pesan).' })
      return
    }
    if (lower.startsWith('.add ')) {
      if (!(await isAdmin(sock, from, sender))) return
      const phone = text.split(' ')[1]
      if (phone) await sock.groupParticipantsUpdate(from, [toJid(phone)], 'add')
      return
    }
    if (lower.startsWith('.kick')) {
      if (!(await isAdmin(sock, from, sender))) return
      const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      if (mentions.length) await sock.groupParticipantsUpdate(from, mentions, 'remove')
      return
    }

    if (lower === 'done' && msg.message?.extendedTextMessage?.contextInfo?.stanzaId) {
      if (!(await isAdmin(sock, from, sender))) return
      const repliedId = msg.message.extendedTextMessage.contextInfo.stanzaId
      const found = db.data.orders.find(o => o.messageId === repliedId)
      if (found) {
        found.status = 'DONE'
        found.doneAt = new Date().toISOString()
        await db.write()
        await sock.sendMessage(from, { text: `✅ Order *${found.orderText}* dari *${found.senderName || found.senderJid}* ditandai Selesai.` }, { quoted: msg })
      }
      return
    }
  })

  function extractText(m) {
    const mObj = m.message || {}
    if (mObj.conversation) return mObj.conversation
    if (mObj.extendedTextMessage?.text) return mObj.extendedTextMessage.text
    if (mObj.imageMessage?.caption) return mObj.imageMessage.caption
    if (mObj.videoMessage?.caption) return mObj.videoMessage.caption
    if (mObj.documentMessage?.caption) return mObj.documentMessage.caption
    return ''
  }

  async function handlePaymentProof(sock, groupJid, msg, senderJid, orderText, proofType) {
    const pushName = msg.pushName || ''
    const order = {
      id: nanoid(10),
      groupId: groupJid,
      messageId: msg.key.id,
      senderJid,
      senderName: pushName,
      orderText,
      proofType,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      doneAt: null
    }
    pushOrder(order)
    await db.write()

    const note = `🧾 ORDER MASUK\nDari: ${pushName || senderJid}\nOrder: ${orderText}\nCatatan: reply "done" (balas ke bukti) untuk Selesai.`
    await sock.sendMessage(OWNER_JID, { text: note })
    await sock.sendMessage(groupJid, { text: `Terima kasih, bukti pembayaran/format *${orderText}* sudah dicatat.\nAdmin akan proses ya.` }, { quoted: msg })
  }
}

start()
