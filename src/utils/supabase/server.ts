import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient(options?: { sessionOnly?: boolean }) {

  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
              // If sessionOnly is true (explicitly or via preference cookie), remove persistence options
              const isSessionOnly = options?.sessionOnly || cookieStore.get('sb-session-only')?.value === 'true'
              
              const mergedOptions = {
                ...cookieOptions,
                path: '/', // Always force root path
              }

              if (isSessionOnly) {
                delete mergedOptions.maxAge
                delete mergedOptions.expires
              }
              
              cookieStore.set(name, value, mergedOptions)
            })
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
