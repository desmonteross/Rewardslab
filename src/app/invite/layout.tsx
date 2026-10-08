import { BrandLockup } from '@/components/brand'

export const metadata = { title: 'Accept invitation' }

/** Public shell for accepting a landlord or property manager invitation. */
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <BrandLockup size="lg" className="mb-8" />
        {children}
      </div>
    </main>
  )
}
