import { motion } from 'framer-motion'
import { Construction } from 'lucide-react'

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] page-enter">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <Construction size={24} className="text-indigo-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">{title}</h1>
        <p className="text-slate-500 text-sm">This module is coming soon.</p>
      </motion.div>
    </div>
  )
}
