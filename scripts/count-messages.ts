// Prints stored-message counts per thread (used to size C2/C3's recent-message window).
import { readdirSync, readFileSync } from 'node:fs'
import { Case } from '../src/schema.js'
import { sessionMessages } from '../src/seed.js'

const n: number[] = []
const per: number[] = []
for (const f of readdirSync('cases')) {
  const s = await sessionMessages(Case.parse(JSON.parse(readFileSync(`cases/${f}`, 'utf8'))))
  n.push(s.flat().length)
  per.push(...s.map(x => x.length))
}
n.sort((a, b) => a - b)
console.log(`messages/thread: min ${n[0]} median ${n[Math.floor(n.length / 2)]} max ${n.at(-1)}; messages/session ${Math.min(...per)}-${Math.max(...per)}`)
