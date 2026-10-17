// Supabase sends at most 1.000 rows per request. This asks for pages of 1.000, three at a time, until it
// has every row. `query` makes a fresh request each time (filters included),
// e.g. () => supabase.from('t').select('a').gte(...)
const PAGE = 1000
const AT_ONCE = 3

export async function fetchAll(query) {
  const rows = []
  for (let first = 0; ; first += AT_ONCE) {
    const pages = await Promise.all(
      Array.from({ length: AT_ONCE }, (_, i) => {
        const from = (first + i) * PAGE
        return query().order('id').range(from, from + PAGE - 1)
      }),
    )
    for (const { data, error } of pages) {
      if (error) throw error
      rows.push(...data)
      if (data.length < PAGE) return rows
    }
  }
}
