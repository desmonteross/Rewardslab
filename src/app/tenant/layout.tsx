import { BrandLockup } from '@/components/brand'

export const metadata = { title: 'Tenant access' }

/** Public shell for the two pages that exist before a tenant has a login. */
export default function TenantAccessLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <BrandLockup size="lg" subtitle="Tenant portal" className="mb-8" />
        {children}
      </div>
    </main>
  )
}
