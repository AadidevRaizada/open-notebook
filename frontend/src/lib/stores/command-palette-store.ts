import { create } from 'zustand'

// Shared open-state for the command palette so both the global ⌘K key
// handler and the header "Ask Navigator" trigger drive the same dialog.
interface CommandPaletteState {
  isOpen: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}))
