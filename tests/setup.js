import { vi } from 'vitest'

// No database in tests: anything that would ask Supabase gets an empty stand-in
vi.mock('../src/lib/supabase', () => ({ supabase: {} }))
