export const toJid = (phone) => {
  let p = phone.trim().replace(/[^\d+]/g, '')
  if (p.startsWith('0')) p = '62' + p.slice(1)
  if (p.startsWith('+')) p = p.slice(1)
  return p + '@s.whatsapp.net'
}

export const isAdmin = async (sock, groupJid, userJid) => {
  const md = await sock.groupMetadata(groupJid)
  const me = md.participants.find(p => p.id === userJid)
  return !!me?.admin
}

export const nowWIBTime = () => {
  try {
    const d = new Date()
    return d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false })
  } catch { return '00:00:00' }
}
