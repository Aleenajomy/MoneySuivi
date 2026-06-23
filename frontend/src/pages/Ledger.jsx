import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Plus, ArrowLeft, Trash2, Pencil, X, ChevronRight,
  TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight,
  Phone, StickyNote, BarChart3, CheckCircle2, Clock, HandCoins
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { useLedger } from '../context/LedgerContext'
import { formatCurrency, formatDate } from '../utils/constants'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META = {
  LENT:               { label: 'You Lent',        color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: ArrowUpRight,   sign: '+' },
  REPAYMENT_RECEIVED: { label: 'Got Back',         color: 'text-sky-500',     bg: 'bg-sky-500/10',     icon: ArrowDownLeft, sign: '-' },
  BORROWED:           { label: 'You Borrowed',     color: 'text-rose-500',    bg: 'bg-rose-500/10',    icon: ArrowDownLeft, sign: '-' },
  REPAYMENT_MADE:     { label: 'You Paid Back',    color: 'text-amber-500',   bg: 'bg-amber-500/10',   icon: ArrowUpRight,  sign: '+' },
}

function BalanceChip({ balance }) {
  if (Math.abs(balance) < 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-dark-border text-[10px] font-bold text-gray-500 dark:text-gray-400">
        <CheckCircle2 size={10} /> Settled
      </span>
    )
  }
  if (balance > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
        <TrendingUp size={10} /> Gets {formatCurrency(balance)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-[10px] font-bold text-rose-600 dark:text-rose-400">
      <TrendingDown size={10} /> Owes {formatCurrency(Math.abs(balance))}
    </span>
  )
}

// ─── Contact Form Modal ───────────────────────────────────────────────────────
function ContactModal({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState({ name: '', phone: '', note: '', ...initial })
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-md rounded-3xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-black dark:text-white text-slate-800">
            {initial?.id ? 'Edit Contact' : 'Add Person'}
          </p>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-dark-border transition-colors">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold dark:text-gray-500 text-gray-400 uppercase tracking-wide">Name *</label>
            <input className="input text-sm" placeholder="e.g. Rahul Kumar" value={form.name} onChange={set('name')} required autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold dark:text-gray-500 text-gray-400 uppercase tracking-wide">Phone (optional)</label>
            <input className="input text-sm" placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold dark:text-gray-500 text-gray-400 uppercase tracking-wide">Note (optional)</label>
            <textarea className="input text-sm resize-none" rows={2} placeholder="College friend, neighbour…" value={form.note} onChange={set('note')} />
          </div>
          <button type="submit" disabled={saving || !form.name.trim()}
            className="gradient-blue w-full py-3 text-sm font-bold text-white rounded-2xl shadow-md active:scale-95 transition-all disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Entry Form Modal ─────────────────────────────────────────────────────────
function EntryModal({ contactName, initial, onSave, onClose, saving }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    type: 'LENT', amount: '', date: today, note: '', ...initial,
    date: initial?.date ? new Date(initial.date).toISOString().split('T')[0] : today,
  })
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-md rounded-3xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-sm font-black dark:text-white text-slate-800">
              {initial?.id ? 'Edit Entry' : 'Add Transaction'}
            </p>
            <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-0.5">with {contactName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-dark-border transition-colors">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* Type selector */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {Object.entries(TYPE_META).map(([key, meta]) => {
            const Icon = meta.icon
            const active = form.type === key
            return (
              <button key={key} type="button" onClick={() => setForm(p => ({ ...p, type: key }))}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                  active
                    ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                    : 'dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500 hover:border-sky-400'
                }`}>
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-sky-500 text-white' : meta.bg + ' ' + meta.color}`}>
                  <Icon size={12} />
                </span>
                <span className="text-[10px] font-bold leading-tight">{meta.label}</span>
              </button>
            )
          })}
        </div>

        <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold dark:text-gray-500 text-gray-400 uppercase tracking-wide">Amount (₹) *</label>
              <input className="input text-sm" type="number" min="1" step="1" placeholder="0" value={form.amount} onChange={set('amount')} required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold dark:text-gray-500 text-gray-400 uppercase tracking-wide">Date *</label>
              <input className="input text-sm" type="date" value={form.date} onChange={set('date')} required />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold dark:text-gray-500 text-gray-400 uppercase tracking-wide">Note (optional)</label>
            <input className="input text-sm" placeholder="What's this for?" value={form.note} onChange={set('note')} />
          </div>
          <button type="submit" disabled={saving || !form.amount}
            className="gradient-blue w-full py-3 text-sm font-bold text-white rounded-2xl shadow-md active:scale-95 transition-all disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Entry'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}

// ─── People List View ─────────────────────────────────────────────────────────
function PeopleView({ contacts, loading, onSelectContact, onAddContact }) {
  const totalLent     = contacts.reduce((s, c) => c.balance > 0 ? s + c.balance : s, 0)
  const totalBorrowed = contacts.reduce((s, c) => c.balance < 0 ? s + Math.abs(c.balance) : s, 0)

  return (
    <div className="space-y-5">
      {/* Summary Banner */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#059669 0%,#10b981 100%)' }}>
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">You'll Receive</p>
          <p className="text-2xl font-black">{formatCurrency(totalLent)}</p>
          <p className="text-[10px] text-white/60 mt-1">Money lent out</p>
        </div>
        <div className="rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#be123c 0%,#f43f5e 100%)' }}>
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">You'll Pay</p>
          <p className="text-2xl font-black">{formatCurrency(totalBorrowed)}</p>
          <p className="text-[10px] text-white/60 mt-1">Money borrowed</p>
        </div>
      </div>

      {/* Add Person Button */}
      <button onClick={onAddContact}
        className="w-full py-3.5 rounded-xl border-2 border-dashed dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500 text-sm font-bold flex items-center justify-center gap-2 hover:border-sky-500 hover:text-sky-500 hover:bg-sky-500/5 transition-all">
        <Plus size={16} /> Add Person
      </button>

      {/* Contacts List */}
      {loading ? (
        <div className="space-y-2">
          {Array(4).fill(0).map((_, i) => <div key={i} className="h-20 rounded-2xl dark:bg-dark-card bg-light-card animate-pulse" />)}
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto rounded-2xl gradient-blue flex items-center justify-center mb-4 opacity-60">
            <HandCoins size={28} className="text-white" />
          </div>
          <p className="text-sm font-bold dark:text-gray-300 text-slate-700">No contacts yet</p>
          <p className="text-xs dark:text-gray-500 text-gray-400 mt-1">Add people you've lent to or borrowed from</p>
        </div>
      ) : (
        <div className="card overflow-hidden border dark:border-dark-border border-light-border divide-y dark:divide-dark-border divide-light-border">
          {contacts.map(contact => (
            <motion.button
              key={contact.id}
              onClick={() => onSelectContact(contact)}
              layout
              className="w-full flex items-center gap-3 px-4 py-4 hover:dark:bg-dark-border/20 hover:bg-slate-50/60 transition-colors text-left"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-xl gradient-blue flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm shadow-sky-500/20">
                {contact.name[0].toUpperCase()}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black dark:text-white text-slate-800 truncate">{contact.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {contact.phone && (
                    <span className="text-[10px] dark:text-gray-500 text-gray-400 flex items-center gap-1">
                      <Phone size={9} /> {contact.phone}
                    </span>
                  )}
                  <span className="text-[10px] dark:text-gray-500 text-gray-400 flex items-center gap-1">
                    <Clock size={9} /> {contact.entryCount} transactions
                  </span>
                </div>
              </div>
              {/* Balance */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <BalanceChip balance={contact.balance} />
                <ChevronRight size={14} className="dark:text-gray-600 text-gray-400" />
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Person Ledger View ───────────────────────────────────────────────────────
function PersonLedgerView({ contact, onBack, onRefreshContacts }) {
  const { fetchEntries, addEntry, updateEntry, deleteEntry, updateContact, deleteContact } = useLedger()

  const [entries, setEntries] = useState([])
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [entryModal, setEntryModal] = useState(null)  // null | {} | {edit entry}
  const [editContactModal, setEditContactModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmEntry, setConfirmEntry] = useState(null)
  const [confirmContact, setConfirmContact] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchEntries(contact.id)
      setEntries(data.entries || [])
      setBalance(data.balance || 0)
    } finally {
      setLoading(false)
    }
  }, [contact.id, fetchEntries])

  useEffect(() => { load() }, [load])

  const handleAddEntry = async (form) => {
    setSaving(true)
    try {
      await addEntry(contact.id, form)
      await load()
      onRefreshContacts()
      setEntryModal(null)
    } finally { setSaving(false) }
  }

  const handleEditEntry = async (form) => {
    setSaving(true)
    try {
      await updateEntry(form.id, form)
      await load()
      setEntryModal(null)
    } finally { setSaving(false) }
  }

  const handleDeleteEntry = (id) => setConfirmEntry(id)

  const handleEditContact = async (form) => {
    setSaving(true)
    try {
      await updateContact(contact.id, form)
      setEditContactModal(false)
    } finally { setSaving(false) }
  }

  const handleDeleteContact = () => setConfirmContact(true)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border flex items-center justify-center dark:text-gray-400 text-gray-500 hover:text-sky-500 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black dark:text-white text-slate-800 truncate">{contact.name}</p>
          {contact.phone && (
            <p className="text-[10px] dark:text-gray-500 text-gray-400 flex items-center gap-1 mt-0.5">
              <Phone size={9} /> {contact.phone}
            </p>
          )}
        </div>
        <button onClick={() => setEditContactModal(true)}
          className="w-8 h-8 rounded-xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border flex items-center justify-center dark:text-gray-400 text-gray-500 hover:text-sky-500 transition-colors">
          <Pencil size={13} />
        </button>
        <button onClick={handleDeleteContact}
          className="w-8 h-8 rounded-xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border flex items-center justify-center dark:text-gray-400 text-gray-500 hover:text-rose-500 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Balance Card */}
      <div className={`rounded-2xl p-5 text-white relative overflow-hidden`}
        style={{ background: balance >= 0 ? 'linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)' : 'linear-gradient(135deg,#9f1239 0%,#e11d48 100%)' }}>
        <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />
        <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-1">
          {Math.abs(balance) < 1 ? 'Fully Settled' : balance > 0 ? `${contact.name} Owes You` : `You Owe ${contact.name}`}
        </p>
        <p className="text-3xl font-black">{formatCurrency(Math.abs(balance))}</p>
        {contact.note && <p className="text-white/60 text-[10px] mt-2 italic">"{contact.note}"</p>}
      </div>

      {/* Add Entry Button */}
      <button onClick={() => setEntryModal({})}
        className="gradient-blue w-full py-3 rounded-xl text-sm font-bold text-white shadow-md active:scale-95 transition-all flex items-center justify-center gap-2">
        <Plus size={16} /> Add Transaction
      </button>

      {/* Transaction List */}
      {loading ? (
        <div className="space-y-2">{Array(3).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl dark:bg-dark-card bg-light-card animate-pulse" />)}</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <StickyNote size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-xs dark:text-gray-500 text-gray-400">No transactions yet. Add the first one.</p>
        </div>
      ) : (
        <div className="card overflow-hidden border dark:border-dark-border border-light-border divide-y dark:divide-dark-border divide-light-border">
          {[...entries].reverse().map(entry => {
            const meta = TYPE_META[entry.type]
            const Icon = meta.icon
            return (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                  <Icon size={15} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold dark:text-white text-slate-800">{meta.label}</p>
                  <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-0.5">
                    {formatDate(entry.date)}{entry.note ? ` · ${entry.note}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-xs font-black ${meta.color}`}>{formatCurrency(entry.amount)}</p>
                  <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-0.5">
                    Bal: {formatCurrency(Math.abs(entry.runningBalance))}
                    {entry.runningBalance > 0 ? ' ↑' : entry.runningBalance < 0 ? ' ↓' : ' ✓'}
                  </p>
                </div>
                <div className="flex flex-col gap-1 ml-1">
                  <button onClick={() => setEntryModal({ ...entry })}
                    className="w-6 h-6 rounded-lg flex items-center justify-center dark:text-gray-500 text-gray-400 hover:text-sky-500 transition-colors">
                    <Pencil size={11} />
                  </button>
                  <button onClick={() => handleDeleteEntry(entry.id)}
                    className="w-6 h-6 rounded-lg flex items-center justify-center dark:text-gray-500 text-gray-400 hover:text-rose-500 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {entryModal !== null && (
          <EntryModal
            key="entry-modal"
            contactName={contact.name}
            initial={entryModal.id ? entryModal : undefined}
            onSave={entryModal.id ? handleEditEntry : handleAddEntry}
            onClose={() => setEntryModal(null)}
            saving={saving}
          />
        )}
        {editContactModal && (
          <ContactModal
            key="contact-modal"
            initial={{ name: contact.name, phone: contact.phone || '', note: contact.note || '', id: contact.id }}
            onSave={handleEditContact}
            onClose={() => setEditContactModal(false)}
            saving={saving}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirmEntry}
        variant="delete"
        title="Delete Entry?"
        message="This transaction will be permanently removed."
        confirmText="Delete"
        onConfirm={async () => {
          const id = confirmEntry
          setConfirmEntry(null)
          await deleteEntry(id, contact.id)
          await load()
          onRefreshContacts()
        }}
        onCancel={() => setConfirmEntry(null)}
      />
      <ConfirmDialog
        open={confirmContact}
        variant="delete"
        title={`Delete ${contact.name}?`}
        message="This contact and all their transactions will be permanently deleted."
        confirmText="Delete"
        onConfirm={async () => {
          setConfirmContact(false)
          await deleteContact(contact.id)
          onBack()
        }}
        onCancel={() => setConfirmContact(false)}
      />
    </div>
  )
}

// ─── Analytics View ───────────────────────────────────────────────────────────
function AnalyticsView({ contacts }) {
  const withBalance = contacts.filter(c => Math.abs(c.balance) >= 1)
  const lenders  = contacts.filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 8)
  const debtors  = contacts.filter(c => c.balance < 0).sort((a, b) => a.balance - b.balance).slice(0, 8)

  const totalLent     = contacts.reduce((s, c) => c.balance > 0 ? s + c.balance : s, 0)
  const totalBorrowed = contacts.reduce((s, c) => c.balance < 0 ? s + Math.abs(c.balance) : s, 0)
  const settled       = contacts.filter(c => Math.abs(c.balance) < 1).length

  const chartData = withBalance.slice(0, 8).map(c => ({
    name: c.name.split(' ')[0],
    amount: Math.abs(c.balance),
    color: c.balance > 0 ? '#10b981' : '#f43f5e',
  }))

  if (contacts.length === 0) {
    return (
      <div className="text-center py-20">
        <BarChart3 size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm font-bold dark:text-gray-300 text-slate-700">No data yet</p>
        <p className="text-xs dark:text-gray-500 text-gray-400 mt-1">Add people and transactions to see analytics</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'To Receive', value: formatCurrency(totalLent),     color: 'text-emerald-500' },
          { label: 'To Pay',     value: formatCurrency(totalBorrowed),  color: 'text-rose-500' },
          { label: 'Settled',    value: `${settled} people`,            color: 'text-sky-500' },
        ].map(k => (
          <div key={k.label} className="card p-3 border dark:border-dark-border border-light-border text-center">
            <p className="text-[10px] dark:text-gray-500 text-gray-400 font-bold uppercase tracking-wide">{k.label}</p>
            <p className={`text-sm font-black mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Bar Chart */}
      {chartData.length > 0 && (
        <div className="card p-5 border dark:border-dark-border border-light-border">
          <p className="text-[10px] font-bold dark:text-gray-500 text-gray-400 uppercase tracking-widest mb-4">Outstanding Balances</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={28}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={v => formatCurrency(v)}
                contentStyle={{ borderRadius: 12, fontSize: 11, border: 'none', background: '#1e293b', color: '#fff' }}
              />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 justify-center">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500"><span className="w-2 h-2 rounded-full bg-emerald-500" />They owe you</span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500"><span className="w-2 h-2 rounded-full bg-rose-500" />You owe them</span>
          </div>
        </div>
      )}

      {/* Top Lists */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { title: 'Top People Who Owe You', list: lenders,  color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { title: 'Top People You Owe',     list: debtors,  color: 'text-rose-500',    bg: 'bg-rose-500/10' },
        ].map(section => (
          <div key={section.title} className="card p-4 border dark:border-dark-border border-light-border">
            <p className="text-[10px] font-bold dark:text-gray-500 text-gray-400 uppercase tracking-widest mb-3">{section.title}</p>
            {section.list.length === 0 ? (
              <p className="text-[10px] dark:text-gray-600 text-gray-400 text-center py-4">None</p>
            ) : section.list.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 py-1.5">
                <span className="text-[10px] font-black dark:text-gray-500 text-gray-400 w-4">#{i + 1}</span>
                <div className={`w-7 h-7 rounded-lg ${section.bg} flex items-center justify-center text-[10px] font-black ${section.color}`}>
                  {c.name[0].toUpperCase()}
                </div>
                <span className="text-xs font-bold dark:text-gray-200 text-slate-700 flex-1 truncate">{c.name}</span>
                <span className={`text-xs font-black ${section.color}`}>{formatCurrency(Math.abs(c.balance))}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Ledger Page ─────────────────────────────────────────────────────────
export default function Ledger() {
  const { contacts, loading, fetchContacts } = useLedger()

  const [tab, setTab] = useState('people')           // 'people' | 'analytics'
  const [selectedContact, setSelectedContact] = useState(null)
  const [contactModal, setContactModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const { addContact } = useLedger()

  useEffect(() => { fetchContacts() }, [fetchContacts])

  const handleAddContact = async (form) => {
    setSaving(true)
    try {
      await addContact(form)
      setContactModal(false)
    } finally { setSaving(false) }
  }

  const handleSelectContact = (c) => {
    setSelectedContact(c)
  }

  const handleBack = () => {
    setSelectedContact(null)
    fetchContacts()
  }

  // Person ledger drill-down overrides the tab layout
  if (selectedContact) {
    return (
      <div className="page pb-24 animate-fadeIn">
        <PersonLedgerView
          contact={selectedContact}
          onBack={handleBack}
          onRefreshContacts={fetchContacts}
        />
      </div>
    )
  }

  return (
    <div className="page pb-24 animate-fadeIn space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between pr-12">
        <div>
          <h1 className="text-2xl font-black dark:text-white text-slate-800 tracking-tight">Borrow & Lend</h1>
          <p className="text-xs dark:text-gray-400 text-gray-500 mt-0.5">Personal ledger — track who owes what</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="card p-1.5 flex gap-1">
        {[
          { key: 'people',    label: `People (${contacts.length})`, icon: Users },
          { key: 'analytics', label: 'Analytics',                    icon: BarChart3 },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                tab === t.key ? 'gradient-blue text-white shadow-md' : 'dark:text-gray-500 text-gray-400 hover:dark:bg-dark-border hover:bg-light-muted'
              }`}>
              <Icon size={13} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {tab === 'people'    && <PeopleView contacts={contacts} loading={loading} onSelectContact={handleSelectContact} onAddContact={() => setContactModal(true)} />}
          {tab === 'analytics' && <AnalyticsView contacts={contacts} />}
        </motion.div>
      </AnimatePresence>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {contactModal && (
          <ContactModal key="new-contact" onSave={handleAddContact} onClose={() => setContactModal(false)} saving={saving} />
        )}
      </AnimatePresence>
    </div>
  )
}
